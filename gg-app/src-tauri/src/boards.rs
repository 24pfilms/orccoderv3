use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const LATEST_SCHEMA_VERSION: i64 = 1;
const MIGRATIONS: &[(i64, &str)] = &[(1, include_str!("../migrations/boards/0001_initial.sql"))];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BoardStoreError {
    code: &'static str,
    message: String,
}

impl BoardStoreError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    fn database(error: rusqlite::Error) -> Self {
        Self::new("board_database_failed", error.to_string())
    }
}

pub(crate) struct BoardStoreState {
    connection: Mutex<Option<Connection>>,
    pub(crate) app_instance_id: String,
}

impl Default for BoardStoreState {
    fn default() -> Self {
        Self {
            connection: Mutex::new(None),
            app_instance_id: uuid::Uuid::new_v4().to_string(),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum PickerTokenKind {
    BackupRestore,
}

struct PickerToken {
    kind: PickerTokenKind,
    window_label: String,
    project_key: String,
    path: PathBuf,
    expires_at: i64,
}

#[derive(Default)]
pub(crate) struct PickerTokenStore(Mutex<HashMap<String, PickerToken>>);

impl PickerTokenStore {
    pub(crate) fn issue(
        &self,
        kind: PickerTokenKind,
        window_label: &str,
        project_key: &str,
        path: PathBuf,
    ) -> Result<String, BoardStoreError> {
        let now = now_millis();
        let mut tokens = self.0.lock().map_err(|_| {
            BoardStoreError::new("board_token_unavailable", "Board preview token lock failed")
        })?;
        tokens.retain(|_, token| token.expires_at > now);
        if tokens.len() >= 64 {
            return Err(BoardStoreError::new(
                "board_token_unavailable",
                "Too many Board previews are open",
            ));
        }
        let id = uuid::Uuid::new_v4().to_string();
        tokens.insert(
            id.clone(),
            PickerToken {
                kind,
                window_label: window_label.to_string(),
                project_key: project_key.to_string(),
                path,
                expires_at: now + 10 * 60 * 1_000,
            },
        );
        Ok(id)
    }

    pub(crate) fn consume(
        &self,
        id: &str,
        kind: PickerTokenKind,
        window_label: &str,
        project_key: &str,
    ) -> Result<PathBuf, BoardStoreError> {
        validate_id(id)?;
        let now = now_millis();
        let mut tokens = self.0.lock().map_err(|_| {
            BoardStoreError::new("board_token_unavailable", "Board preview token lock failed")
        })?;
        let token = tokens.get(id).ok_or_else(|| {
            BoardStoreError::new("board_token_invalid", "Board preview token is invalid")
        })?;
        if token.expires_at <= now {
            tokens.remove(id);
            return Err(BoardStoreError::new(
                "board_token_invalid",
                "Board preview token expired",
            ));
        }
        if token.kind != kind
            || token.window_label != window_label
            || token.project_key != project_key
        {
            return Err(BoardStoreError::new(
                "board_token_invalid",
                "Board preview token is not valid for this window",
            ));
        }
        tokens.remove(id).map(|token| token.path).ok_or_else(|| {
            BoardStoreError::new("board_token_invalid", "Board preview token was used")
        })
    }
}

impl BoardStoreState {
    pub(crate) fn with_connection<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, BoardStoreError>,
    ) -> Result<T, BoardStoreError> {
        if !board_mode_enabled() {
            return Err(BoardStoreError::new(
                "board_mode_disabled",
                "Board Mode is disabled in this build",
            ));
        }
        let mut guard = self.connection.lock().map_err(|_| {
            BoardStoreError::new("board_store_unavailable", "Board store lock failed")
        })?;
        if guard.is_none() {
            *guard = Some(open_store(&super::home_dir().join(".gg/boards"))?);
        }
        let connection = guard.as_mut().ok_or_else(|| {
            BoardStoreError::new(
                "board_store_unavailable",
                "Board store failed to initialize",
            )
        })?;
        operation(connection)
    }

    fn restore_from_backup(
        &self,
        store_root: &Path,
        backup_root: &Path,
    ) -> Result<BoardBackupRecord, BoardStoreError> {
        let mut guard = self.connection.lock().map_err(|_| {
            BoardStoreError::new("board_store_unavailable", "Board store lock failed")
        })?;
        if guard.is_none() {
            *guard = Some(open_store(&store_root)?);
        }
        let connection = guard.as_ref().ok_or_else(|| {
            BoardStoreError::new("board_store_unavailable", "Board store is unavailable")
        })?;
        let active_leases: i64 = connection
            .query_row("SELECT COUNT(*) FROM board_leases", [], |row| row.get(0))
            .map_err(BoardStoreError::database)?;
        if active_leases != 0 {
            return Err(BoardStoreError::new(
                "board_restore_blocked",
                "Close every Board editor before restoring",
            ));
        }
        verify_backup_root(backup_root)?;
        let rollback_record = create_backup(connection, &store_root, "before-restore")?;
        let required = directory_size(backup_root)?
            .saturating_mul(2)
            .saturating_add(256 * 1024 * 1024);
        if available_space(&store_root)? < required {
            return Err(BoardStoreError::new(
                "board_disk_space_low",
                "Not enough free disk space to stage and roll back this restore",
            ));
        }
        *guard = None;

        let parent = store_root.parent().ok_or_else(|| {
            BoardStoreError::new("board_restore_failed", "Board store parent is invalid")
        })?;
        let suffix = uuid::Uuid::new_v4();
        let staging = parent.join(format!(".boards-restore-{suffix}"));
        let rollback = parent.join(format!(".boards-rollback-{suffix}"));
        let failed = parent.join(format!(".boards-failed-{suffix}"));
        if let Err(error) = stage_restore(&store_root, backup_root, &staging) {
            let _ = std::fs::remove_dir_all(&staging);
            *guard = Some(open_store(&store_root)?);
            return Err(error);
        }
        if std::fs::rename(&store_root, &rollback).is_err() {
            let _ = std::fs::remove_dir_all(&staging);
            *guard = Some(open_store(&store_root)?);
            return Err(BoardStoreError::new(
                "board_restore_failed",
                "Board store could not enter maintenance swap",
            ));
        }
        if std::fs::rename(&staging, &store_root).is_err() {
            let _ = std::fs::rename(&rollback, &store_root);
            *guard = Some(open_store(&store_root)?);
            return Err(BoardStoreError::new(
                "board_restore_failed",
                "Restored Board store could not be activated",
            ));
        }
        match open_store(&store_root) {
            Ok(connection) => {
                *guard = Some(connection);
                Ok(rollback_record)
            }
            Err(error) => {
                let _ = std::fs::rename(&store_root, &failed);
                let _ = std::fs::rename(&rollback, &store_root);
                *guard = Some(open_store(&store_root)?);
                Err(BoardStoreError::new(
                    "board_restore_failed",
                    format!(
                        "Restored Board store failed verification: {}",
                        error.message
                    ),
                ))
            }
        }
    }
}

pub(crate) fn board_mode_enabled() -> bool {
    option_env!("VITE_BOARD_MODE_ENABLED") == Some("true")
}

fn open_store(root: &Path) -> Result<Connection, BoardStoreError> {
    validate_store_root(root)?;
    std::fs::create_dir_all(root).map_err(|error| {
        BoardStoreError::new(
            "board_store_unavailable",
            format!("Could not create Board store directory: {error}"),
        )
    })?;
    let path = root.join("boards.sqlite3");
    let mut connection = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(BoardStoreError::database)?;
    configure_connection(&connection)?;
    migrate(&mut connection)?;
    verify_connection(&connection)?;
    Ok(connection)
}

fn validate_store_root(root: &Path) -> Result<(), BoardStoreError> {
    if !root.is_absolute() {
        return Err(BoardStoreError::new(
            "board_store_path_invalid",
            "Board store path must be absolute",
        ));
    }
    #[cfg(windows)]
    if matches!(
        root.components().next(),
        Some(std::path::Component::Prefix(prefix))
            if matches!(
                prefix.kind(),
                std::path::Prefix::UNC(_, _)
                    | std::path::Prefix::VerbatimUNC(_, _)
                    | std::path::Prefix::DeviceNS(_)
            )
    ) {
        return Err(BoardStoreError::new(
            "board_store_path_invalid",
            "Board store must be on a local path",
        ));
    }
    Ok(())
}

fn configure_connection(connection: &Connection) -> Result<(), BoardStoreError> {
    connection
        .busy_timeout(Duration::from_millis(5_000))
        .map_err(BoardStoreError::database)?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(BoardStoreError::database)?;
    connection
        .pragma_update(None, "synchronous", "FULL")
        .map_err(BoardStoreError::database)?;
    let journal_mode: String = connection
        .pragma_query_value(None, "journal_mode", |row| row.get(0))
        .map_err(BoardStoreError::database)?;
    if !journal_mode.eq_ignore_ascii_case("wal") {
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(BoardStoreError::database)?;
    }
    Ok(())
}

fn migrate(connection: &mut Connection) -> Result<(), BoardStoreError> {
    let current = current_schema_version(connection)?;
    if current > LATEST_SCHEMA_VERSION {
        return Err(BoardStoreError::new(
            "board_schema_too_new",
            format!("Board schema {current} is newer than this app supports"),
        ));
    }
    if current > 0 && current < LATEST_SCHEMA_VERSION {
        return Err(BoardStoreError::new(
            "board_backup_required",
            "Board schema upgrade requires a recovery backup",
        ));
    }
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version > current) {
        apply_migration(connection, *version, sql)?;
    }
    Ok(())
}

fn current_schema_version(connection: &Connection) -> Result<i64, BoardStoreError> {
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')",
            [],
            |row| row.get(0),
        )
        .map_err(BoardStoreError::database)?;
    if !exists {
        return Ok(0);
    }
    connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(BoardStoreError::database)
}

fn apply_migration(
    connection: &mut Connection,
    version: i64,
    sql: &str,
) -> Result<(), BoardStoreError> {
    let transaction = connection
        .transaction()
        .map_err(BoardStoreError::database)?;
    transaction.execute_batch(sql).map_err(|error| {
        BoardStoreError::new(
            "board_migration_failed",
            format!("Board schema migration {version} failed: {error}"),
        )
    })?;
    transaction.commit().map_err(BoardStoreError::database)
}

fn verify_connection(connection: &Connection) -> Result<(), BoardStoreError> {
    let quick_check: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(BoardStoreError::database)?;
    if quick_check != "ok" {
        return Err(BoardStoreError::new(
            "board_integrity_failed",
            "Board database quick check failed",
        ));
    }
    let mut foreign_keys = connection
        .prepare("PRAGMA foreign_key_check")
        .map_err(BoardStoreError::database)?;
    if foreign_keys
        .query([])
        .map_err(BoardStoreError::database)?
        .next()
        .map_err(BoardStoreError::database)?
        .is_some()
    {
        return Err(BoardStoreError::new(
            "board_integrity_failed",
            "Board database contains broken references",
        ));
    }
    Ok(())
}

#[derive(Clone)]
struct ProjectContext {
    key: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BoardSummary {
    board_id: String,
    name: String,
    description: Option<String>,
    revision: i64,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BoardItem {
    item_id: String,
    board_id: String,
    item_type: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    z_index: i64,
    rotation: f64,
    payload: serde_json::Value,
    revision: i64,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BoardDocument {
    board: BoardSummary,
    background_color: String,
    dot_density: f64,
    toolbar_position: String,
    pan_x: f64,
    pan_y: f64,
    zoom: f64,
    items: Vec<BoardItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BoardLease {
    editable: bool,
    lease_epoch: Option<i64>,
    owner_window_label: Option<String>,
    expired: bool,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn project_context(
    window: &WebviewWindow,
    windows: &super::Windows,
) -> Result<ProjectContext, BoardStoreError> {
    project_context_for_label(window.label(), windows)
}

fn project_context_for_label(
    window_label: &str,
    windows: &super::Windows,
) -> Result<ProjectContext, BoardStoreError> {
    let cwd = windows
        .map
        .lock()
        .map_err(|_| {
            BoardStoreError::new("board_session_unavailable", "Window session lock failed")
        })?
        .get(window_label)
        .and_then(|session| session.cwd.clone())
        .ok_or_else(|| BoardStoreError::new("board_project_required", "A project must be open"))?;
    normalize_project_path(&cwd)
}

fn normalize_project_path(path: &Path) -> Result<ProjectContext, BoardStoreError> {
    let canonical = std::fs::canonicalize(path).map_err(|_| {
        BoardStoreError::new(
            "board_project_unavailable",
            "Project path could not be resolved",
        )
    })?;
    let display = canonical.to_string_lossy().to_string();
    #[cfg(windows)]
    let key = {
        let without_verbatim = display
            .strip_prefix(r"\\?\UNC\")
            .map(|path| format!(r"\\{path}"))
            .or_else(|| display.strip_prefix(r"\\?\").map(str::to_owned))
            .unwrap_or_else(|| display.clone());
        without_verbatim.replace('/', r"\").to_lowercase()
    };
    #[cfg(not(windows))]
    let key = display.clone();
    if key.is_empty() || key.len() > 32_768 {
        return Err(BoardStoreError::new(
            "board_project_unavailable",
            "Normalized project path is invalid",
        ));
    }
    Ok(ProjectContext { key, path: display })
}

async fn run_store<T: Send + 'static>(
    app: AppHandle,
    operation: impl FnOnce(&BoardStoreState, &mut Connection) -> Result<T, BoardStoreError>
        + Send
        + 'static,
) -> Result<T, BoardStoreError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<BoardStoreState>();
        state.with_connection(|connection| operation(&state, connection))
    })
    .await
    .map_err(|_| BoardStoreError::new("board_store_unavailable", "Board store worker failed"))?
}

fn validate_id(id: &str) -> Result<(), BoardStoreError> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board ID is invalid",
        ));
    }
    Ok(())
}

fn validate_name(name: &str) -> Result<&str, BoardStoreError> {
    let name = name.trim();
    if name.is_empty() || name.len() > 200 || name.chars().any(char::is_control) {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board name is invalid",
        ));
    }
    Ok(name)
}

fn board_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<BoardSummary> {
    Ok(BoardSummary {
        board_id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        revision: row.get(3)?,
        updated_at: row.get(4)?,
        deleted_at: row.get(5)?,
    })
}

fn load_document(
    connection: &Connection,
    project: &ProjectContext,
    board_id: &str,
) -> Result<BoardDocument, BoardStoreError> {
    let (board, background_color, dot_density, toolbar_position, pan_x, pan_y, zoom) = connection
        .query_row(
            "SELECT board_id, name, description, revision, updated_at, deleted_at, background_color, dot_density, toolbar_position, pan_x, pan_y, zoom FROM boards WHERE board_id=?1 AND project_key=?2",
            params![board_id, project.key],
            |row| Ok((board_summary(row)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?)),
        )
        .optional()
        .map_err(BoardStoreError::database)?
        .ok_or_else(|| BoardStoreError::new("board_not_found", "Board was not found"))?;
    let mut statement = connection
        .prepare("SELECT item_id, board_id, item_type, x, y, width, height, z_index, rotation, payload_json, revision, created_at, updated_at, deleted_at FROM board_items WHERE board_id=?1 ORDER BY z_index, item_id")
        .map_err(BoardStoreError::database)?;
    let rows = statement
        .query_map([board_id], |row| {
            let payload: String = row.get(9)?;
            Ok(BoardItem {
                item_id: row.get(0)?,
                board_id: row.get(1)?,
                item_type: row.get(2)?,
                x: row.get(3)?,
                y: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                z_index: row.get(7)?,
                rotation: row.get(8)?,
                payload: serde_json::from_str(&payload).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        payload.len(),
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?,
                revision: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
                deleted_at: row.get(13)?,
            })
        })
        .map_err(BoardStoreError::database)?;
    let items = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(BoardStoreError::database)?;
    Ok(BoardDocument {
        board,
        background_color,
        dot_density,
        toolbar_position,
        pan_x,
        pan_y,
        zoom,
        items,
    })
}

#[tauri::command]
pub(crate) async fn board_list(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
) -> Result<Vec<BoardSummary>, BoardStoreError> {
    let project = project_context(&window, &windows)?;
    run_store(app, move |_, connection| {
        let mut statement = connection
            .prepare("SELECT board_id, name, description, revision, updated_at, deleted_at FROM boards WHERE project_key=?1 ORDER BY deleted_at IS NOT NULL, updated_at DESC")
            .map_err(BoardStoreError::database)?;
        let boards = statement
            .query_map([project.key], board_summary)
            .map_err(BoardStoreError::database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(BoardStoreError::database)?;
        Ok(boards)
    })
    .await
}

#[tauri::command]
pub(crate) async fn board_create(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    name: String,
) -> Result<BoardDocument, BoardStoreError> {
    let project = project_context(&window, &windows)?;
    let name = validate_name(&name)?.to_string();
    let board_id = uuid::Uuid::new_v4().to_string();
    let timestamp = now_millis().to_string();
    run_store(app, move |_, connection| {
        connection
            .execute(
                "INSERT INTO boards(board_id, project_key, project_path, name, background_color, dot_density, toolbar_position, pan_x, pan_y, zoom, revision, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, '#101216', 16, 'bottom', 0, 0, 1, 0, ?5, ?5)",
                params![board_id, project.key, project.path, name, timestamp],
            )
            .map_err(BoardStoreError::database)?;
        load_document(connection, &project, &board_id)
    })
    .await
}

#[tauri::command]
pub(crate) async fn board_get(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
) -> Result<BoardDocument, BoardStoreError> {
    validate_id(&board_id)?;
    let project = project_context(&window, &windows)?;
    run_store(app, move |_, connection| {
        load_document(connection, &project, &board_id)
    })
    .await
}

#[tauri::command]
pub(crate) async fn board_lease_acquire(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    reclaim_expired: bool,
) -> Result<BoardLease, BoardStoreError> {
    validate_id(&board_id)?;
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    run_store(app, move |state, connection| {
        let transaction = connection.transaction().map_err(BoardStoreError::database)?;
        let belongs: bool = transaction
            .query_row("SELECT EXISTS(SELECT 1 FROM boards WHERE board_id=?1 AND project_key=?2)", params![board_id, project.key], |row| row.get(0))
            .map_err(BoardStoreError::database)?;
        if !belongs {
            return Err(BoardStoreError::new("board_not_found", "Board was not found"));
        }
        let existing = transaction
            .query_row("SELECT app_instance_id, window_label, lease_epoch, heartbeat_at FROM board_leases WHERE board_id=?1", [&board_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?, row.get::<_, String>(3)?)))
            .optional()
            .map_err(BoardStoreError::database)?;
        let now = now_millis();
        let lease = match existing {
            None => {
                transaction.execute("INSERT INTO board_leases(board_id, app_instance_id, window_label, lease_epoch, heartbeat_at) VALUES (?1, ?2, ?3, 1, ?4)", params![board_id, state.app_instance_id, window_label, now.to_string()]).map_err(BoardStoreError::database)?;
                BoardLease { editable: true, lease_epoch: Some(1), owner_window_label: None, expired: false }
            }
            Some((owner_app, owner_window, epoch, _heartbeat)) if owner_app == state.app_instance_id && owner_window == window_label => {
                transaction.execute("UPDATE board_leases SET heartbeat_at=?2 WHERE board_id=?1", params![board_id, now.to_string()]).map_err(BoardStoreError::database)?;
                BoardLease { editable: true, lease_epoch: Some(epoch), owner_window_label: None, expired: false }
            }
            Some((_, owner_window, epoch, heartbeat)) => {
                let heartbeat = heartbeat.parse::<i64>().map_err(|_| {
                    BoardStoreError::new(
                        "board_integrity_failed",
                        "Board lease heartbeat is invalid",
                    )
                })?;
                let expired = now.saturating_sub(heartbeat) > 30_000;
                if expired && reclaim_expired {
                    let next_epoch = epoch.checked_add(1).ok_or_else(|| BoardStoreError::new("board_lease_failed", "Board lease epoch is exhausted"))?;
                    let changed = transaction.execute("UPDATE board_leases SET app_instance_id=?2, window_label=?3, lease_epoch=?4, heartbeat_at=?5 WHERE board_id=?1 AND lease_epoch=?6", params![board_id, state.app_instance_id, window_label, next_epoch, now.to_string(), epoch]).map_err(BoardStoreError::database)?;
                    if changed != 1 {
                        return Err(BoardStoreError::new("board_lease_stale", "Board editing lease changed during takeover"));
                    }
                    BoardLease { editable: true, lease_epoch: Some(next_epoch), owner_window_label: None, expired: false }
                } else {
                    BoardLease { editable: false, lease_epoch: None, owner_window_label: Some(owner_window), expired }
                }
            }
        };
        transaction.commit().map_err(BoardStoreError::database)?;
        Ok(lease)
    }).await
}

#[tauri::command]
pub(crate) async fn board_lease_release(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    lease_epoch: i64,
) -> Result<(), BoardStoreError> {
    validate_id(&board_id)?;
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    run_store(app, move |state, connection| {
        let changed = connection.execute(
            "DELETE FROM board_leases WHERE board_id=?1 AND lease_epoch=?2 AND app_instance_id=?3 AND window_label=?4 AND EXISTS(SELECT 1 FROM boards WHERE board_id=?1 AND project_key=?5)",
            params![board_id, lease_epoch, state.app_instance_id, window_label, project.key],
        ).map_err(BoardStoreError::database)?;
        if changed != 1 {
            return Err(BoardStoreError::new("board_lease_stale", "Board editing lease is no longer valid"));
        }
        Ok(())
    }).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BoardSettingsPatch {
    name: Option<String>,
    description: Option<Option<String>>,
    background_color: Option<String>,
    dot_density: Option<f64>,
    toolbar_position: Option<String>,
    pan_x: Option<f64>,
    pan_y: Option<f64>,
    zoom: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NewBoardItem {
    item_type: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    z_index: i64,
    rotation: f64,
    payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BoardItemPatch {
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    z_index: Option<i64>,
    rotation: Option<f64>,
    payload: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
// `rename_all` renames the VARIANTS of an enum, not the fields inside them, so the
// variant fields need `rename_all_fields` to match the camelCase payload the frontend
// sends. Without it every mutation was rejected with "missing field `item_id`".
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub(crate) enum BoardItemMutation {
    Create {
        item_id: String,
        item: NewBoardItem,
    },
    Update {
        item_id: String,
        expected_item_revision: i64,
        patch: BoardItemPatch,
    },
    SoftDelete {
        item_id: String,
        expected_item_revision: i64,
    },
    Restore {
        item_id: String,
        expected_item_revision: i64,
    },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BoardChanged {
    board_id: String,
    revision: i64,
}

fn validate_finite(value: f64, limit: f64, field: &str) -> Result<(), BoardStoreError> {
    if !value.is_finite() || value.abs() > limit {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            format!("Board {field} is invalid"),
        ));
    }
    Ok(())
}

fn validate_payload(
    item_type: &str,
    payload: &serde_json::Value,
) -> Result<String, BoardStoreError> {
    let encoded = serde_json::to_string(payload).map_err(|_| {
        BoardStoreError::new("board_input_invalid", "Board item payload is invalid")
    })?;
    if encoded.len() > 1_048_576 {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board item payload is too large",
        ));
    }
    let object = payload.as_object().ok_or_else(|| {
        BoardStoreError::new(
            "board_input_invalid",
            "Board item payload must be an object",
        )
    })?;
    let allowed: &[&str] = match item_type {
        // fontSize/fontFamily are characterized Mero sticky-note properties and the
        // selection toolbar offers them for notes; omitting them here made the validator
        // fail the whole mutation closed, so font changes on a note silently never saved.
        "sticky_note" => &[
            "text",
            "color",
            "backgroundColor",
            "fontSize",
            "fontFamily",
            "votes",
            "_provenance",
        ],
        "text" => &[
            "text",
            "color",
            "backgroundColor",
            "fontSize",
            "fontFamily",
            "_provenance",
        ],
        "shape" => &[
            "shape",
            "text",
            "fill",
            "stroke",
            "color",
            "fontSize",
            "fontFamily",
            "_provenance",
        ],
        "frame" => &[
            "title",
            "color",
            "backgroundColor",
            "childIds",
            "_provenance",
        ],
        "arrow" => &["label", "color", "shape", "_provenance"],
        // `videoId` carries an embedded YouTube player. It is kept on the image type so
        // this needs no schema migration; the CHECK constraint on item_type cannot be
        // altered without a table rebuild, which the migration runner gates behind a
        // recovery backup.
        "image" => &["assetId", "alt", "videoId", "_provenance"],
        "drawing" => &["assetId", "color", "points", "strokeWidth", "_provenance"],
        _ => {
            return Err(BoardStoreError::new(
                "board_input_invalid",
                "Board item type is unsupported",
            ))
        }
    };
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board item payload contains unsupported fields",
        ));
    }
    let valid_text = |key: &str, limit: usize| {
        object.get(key).is_none_or(|value| {
            value.as_str().is_some_and(|text| {
                text.len() <= limit && !text.chars().any(|character| character == '\0')
            })
        })
    };
    let valid_color = |key: &str| {
        object.get(key).is_none_or(|value| {
            value.as_str().is_some_and(|color| {
                matches!(color.len(), 4 | 7 | 9)
                    && color.starts_with('#')
                    && color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
            })
        })
    };
    let valid_asset = object.get("assetId").is_none_or(|value| {
        value
            .as_str()
            .is_some_and(|asset_id| validate_id(asset_id).is_ok())
    });
    let valid_shape = object.get("shape").is_none_or(|value| {
        value.as_str().is_some_and(|shape| {
            matches!(
                shape,
                "rectangle"
                    | "rounded_rectangle"
                    | "ellipse"
                    | "triangle"
                    | "diamond"
                    | "hexagon"
                    | "line"
                    | "arrow"
                    | "double_arrow"
            )
        })
    });
    let valid_font_size = object.get("fontSize").is_none_or(|value| {
        value
            .as_f64()
            .is_some_and(|size| size.is_finite() && (8.0..=256.0).contains(&size))
    });
    // A YouTube id is interpolated straight into the player URL, so constrain it to the
    // exact shape YouTube uses and nothing else.
    let valid_video_id = object.get("videoId").is_none_or(|value| {
        value.as_str().is_some_and(|id| {
            id.len() == 11 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        })
    });
    let valid_font_family = object.get("fontFamily").is_none_or(|value| {
        value
            .as_str()
            .is_some_and(|family| matches!(family, "sans" | "serif" | "mono" | "hand"))
    });
    let valid_child_ids = object.get("childIds").is_none_or(|value| {
        value.as_array().is_some_and(|ids| {
            ids.len() <= 10_000
                && ids
                    .iter()
                    .all(|id| id.as_str().is_some_and(|id| validate_id(id).is_ok()))
        })
    });
    let valid_votes = object.get("votes").is_none_or(|value| {
        value
            .as_i64()
            .is_some_and(|votes| (0..=1_000_000).contains(&votes))
    });
    let valid_stroke_width = object.get("strokeWidth").is_none_or(|value| {
        value
            .as_f64()
            .is_some_and(|width| width.is_finite() && (0.5..=100.0).contains(&width))
    });
    let valid_points = object.get("points").is_none_or(|value| {
        value.as_array().is_some_and(|points| {
            points.len() <= 10_000
                && points.iter().all(|point| {
                    point.as_object().is_some_and(|point| {
                        point.len() == 2
                            && ["x", "y"].iter().all(|key| {
                                point
                                    .get(*key)
                                    .and_then(serde_json::Value::as_f64)
                                    .is_some_and(|coordinate| {
                                        coordinate.is_finite() && coordinate.abs() <= 100_000.0
                                    })
                            })
                    })
                })
        })
    });
    if !valid_text("text", 100_000)
        || !valid_text("title", 1_000)
        || !valid_text("label", 10_000)
        || !valid_text("alt", 1_000)
        || !valid_color("color")
        || !valid_color("backgroundColor")
        || !valid_color("fill")
        || !valid_color("stroke")
        || !valid_asset
        || !valid_shape
        || !valid_video_id
        || !valid_font_size
        || !valid_font_family
        || !valid_child_ids
        || !valid_votes
        || !valid_stroke_width
        || !valid_points
        || object
            .get("_provenance")
            .is_some_and(|value| !value.is_object())
    {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board item payload is invalid",
        ));
    }
    Ok(encoded)
}

fn validate_new_item(item: &NewBoardItem) -> Result<String, BoardStoreError> {
    if !matches!(
        item.item_type.as_str(),
        "sticky_note" | "text" | "shape" | "frame" | "arrow" | "image" | "drawing"
    ) {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board item type is unsupported",
        ));
    }
    validate_finite(item.x, 1_000_000_000.0, "x coordinate")?;
    validate_finite(item.y, 1_000_000_000.0, "y coordinate")?;
    if !item.width.is_finite()
        || !item.height.is_finite()
        || !(0.0..=100_000.0).contains(&item.width)
        || !(0.0..=100_000.0).contains(&item.height)
        || item.width == 0.0
        || item.height == 0.0
        || !item.rotation.is_finite()
        || item.rotation.abs() > 360_000.0
        || !(-1_000_000..=1_000_000).contains(&item.z_index)
    {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board item geometry is invalid",
        ));
    }
    validate_payload(&item.item_type, &item.payload)
}

fn validate_item_patch(patch: &BoardItemPatch) -> Result<(), BoardStoreError> {
    if patch.x.is_none()
        && patch.y.is_none()
        && patch.width.is_none()
        && patch.height.is_none()
        && patch.z_index.is_none()
        && patch.rotation.is_none()
        && patch.payload.is_none()
    {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board item patch is empty",
        ));
    }
    if patch
        .x
        .is_some_and(|value| !value.is_finite() || value.abs() > 1_000_000_000.0)
        || patch
            .y
            .is_some_and(|value| !value.is_finite() || value.abs() > 1_000_000_000.0)
        || patch
            .width
            .is_some_and(|value| !value.is_finite() || value <= 0.0 || value > 100_000.0)
        || patch
            .height
            .is_some_and(|value| !value.is_finite() || value <= 0.0 || value > 100_000.0)
        || patch
            .z_index
            .is_some_and(|value| !(-1_000_000..=1_000_000).contains(&value))
        || patch
            .rotation
            .is_some_and(|value| !value.is_finite() || value.abs() > 360_000.0)
    {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board item geometry is invalid",
        ));
    }
    Ok(())
}

fn authorize_mutation(
    transaction: &rusqlite::Transaction<'_>,
    project: &ProjectContext,
    state: &BoardStoreState,
    window_label: &str,
    board_id: &str,
    lease_epoch: i64,
    expected_revision: i64,
) -> Result<(), BoardStoreError> {
    let authorized: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM boards b JOIN board_leases l ON l.board_id=b.board_id WHERE b.board_id=?1 AND b.project_key=?2 AND b.deleted_at IS NULL AND b.revision=?3 AND l.app_instance_id=?4 AND l.window_label=?5 AND l.lease_epoch=?6)",
            params![board_id, project.key, expected_revision, state.app_instance_id, window_label, lease_epoch],
            |row| row.get(0),
        )
        .map_err(BoardStoreError::database)?;
    if !authorized {
        return Err(BoardStoreError::new(
            "board_write_conflict",
            "Board revision or editing lease is stale",
        ));
    }
    Ok(())
}

fn emit_changed(app: &AppHandle, changed: &BoardChanged) {
    let _ = app.emit("board://changed", changed);
}

#[tauri::command]
pub(crate) async fn board_update_settings(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    lease_epoch: i64,
    expected_revision: i64,
    patch: BoardSettingsPatch,
) -> Result<BoardDocument, BoardStoreError> {
    validate_id(&board_id)?;
    if patch.name.is_none()
        && patch.description.is_none()
        && patch.background_color.is_none()
        && patch.dot_density.is_none()
        && patch.toolbar_position.is_none()
        && patch.pan_x.is_none()
        && patch.pan_y.is_none()
        && patch.zoom.is_none()
    {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board settings patch is empty",
        ));
    }
    if let Some(name) = &patch.name {
        validate_name(name)?;
    }
    if let Some(description) = &patch.description {
        if description
            .as_ref()
            .is_some_and(|value| value.len() > 4_000)
        {
            return Err(BoardStoreError::new(
                "board_input_invalid",
                "Board description is too large",
            ));
        }
    }
    if let Some(color) = &patch.background_color {
        if color.is_empty() || color.len() > 32 || color.chars().any(char::is_control) {
            return Err(BoardStoreError::new(
                "board_input_invalid",
                "Board color is invalid",
            ));
        }
    }
    if patch
        .dot_density
        .is_some_and(|value| !value.is_finite() || !(0.0..=100.0).contains(&value))
        || patch
            .pan_x
            .is_some_and(|value| !value.is_finite() || value.abs() > 1_000_000_000.0)
        || patch
            .pan_y
            .is_some_and(|value| !value.is_finite() || value.abs() > 1_000_000_000.0)
        || patch
            .zoom
            .is_some_and(|value| !value.is_finite() || !(0.05..=8.0).contains(&value))
        || patch
            .toolbar_position
            .as_ref()
            .is_some_and(|value| !matches!(value.as_str(), "top" | "bottom" | "left" | "right"))
    {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board settings are invalid",
        ));
    }
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let emitter = app.clone();
    let changed_board_id = board_id.clone();
    let document = run_store(app, move |state, connection| {
        let transaction = connection.transaction().map_err(BoardStoreError::database)?;
        authorize_mutation(&transaction, &project, state, &window_label, &board_id, lease_epoch, expected_revision)?;
        let timestamp = now_millis().to_string();
        let changed = transaction.execute(
            "UPDATE boards SET name=COALESCE(?1,name), description=CASE WHEN ?2 THEN ?3 ELSE description END, background_color=COALESCE(?4,background_color), dot_density=COALESCE(?5,dot_density), toolbar_position=COALESCE(?6,toolbar_position), pan_x=COALESCE(?7,pan_x), pan_y=COALESCE(?8,pan_y), zoom=COALESCE(?9,zoom), revision=revision+1, updated_at=?10 WHERE board_id=?11 AND revision=?12",
            params![patch.name.as_deref().map(str::trim), patch.description.is_some(), patch.description.flatten(), patch.background_color, patch.dot_density, patch.toolbar_position, patch.pan_x, patch.pan_y, patch.zoom, timestamp, board_id, expected_revision],
        ).map_err(BoardStoreError::database)?;
        if changed != 1 { return Err(BoardStoreError::new("board_write_conflict", "Board revision changed while saving")); }
        transaction.execute("UPDATE board_leases SET heartbeat_at=?2 WHERE board_id=?1 AND lease_epoch=?3", params![board_id, now_millis().to_string(), lease_epoch]).map_err(BoardStoreError::database)?;
        transaction.commit().map_err(BoardStoreError::database)?;
        load_document(connection, &project, &board_id)
    }).await?;
    emit_changed(
        &emitter,
        &BoardChanged {
            board_id: changed_board_id,
            revision: document.board.revision,
        },
    );
    Ok(document)
}

#[tauri::command]
pub(crate) async fn board_item_create(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    lease_epoch: i64,
    expected_revision: i64,
    item: NewBoardItem,
) -> Result<BoardDocument, BoardStoreError> {
    validate_id(&board_id)?;
    let payload = validate_new_item(&item)?;
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let item_id = uuid::Uuid::new_v4().to_string();
    let emitter = app.clone();
    let changed_board_id = board_id.clone();
    let document = run_store(app, move |state, connection| {
        let transaction = connection.transaction().map_err(BoardStoreError::database)?;
        authorize_mutation(&transaction, &project, state, &window_label, &board_id, lease_epoch, expected_revision)?;
        let timestamp = now_millis().to_string();
        transaction.execute(
            "INSERT INTO board_items(item_id, board_id, item_type, x, y, width, height, z_index, rotation, payload_json, revision, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?11)",
            params![item_id, board_id, item.item_type, item.x, item.y, item.width, item.height, item.z_index, item.rotation, payload, timestamp],
        ).map_err(BoardStoreError::database)?;
        let changed = transaction.execute("UPDATE boards SET revision=revision+1, updated_at=?2 WHERE board_id=?1 AND revision=?3", params![board_id, timestamp, expected_revision]).map_err(BoardStoreError::database)?;
        if changed != 1 { return Err(BoardStoreError::new("board_write_conflict", "Board revision changed while saving")); }
        transaction.execute("UPDATE board_leases SET heartbeat_at=?2 WHERE board_id=?1 AND lease_epoch=?3", params![board_id, now_millis().to_string(), lease_epoch]).map_err(BoardStoreError::database)?;
        transaction.commit().map_err(BoardStoreError::database)?;
        load_document(connection, &project, &board_id)
    }).await?;
    emit_changed(
        &emitter,
        &BoardChanged {
            board_id: changed_board_id,
            revision: document.board.revision,
        },
    );
    Ok(document)
}

#[tauri::command]
pub(crate) async fn board_item_update(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    item_id: String,
    lease_epoch: i64,
    expected_revision: i64,
    expected_item_revision: i64,
    patch: BoardItemPatch,
) -> Result<BoardDocument, BoardStoreError> {
    validate_id(&board_id)?;
    validate_id(&item_id)?;
    validate_item_patch(&patch)?;
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let emitter = app.clone();
    let changed_board_id = board_id.clone();
    let document = run_store(app, move |state, connection| {
        let transaction = connection.transaction().map_err(BoardStoreError::database)?;
        authorize_mutation(&transaction, &project, state, &window_label, &board_id, lease_epoch, expected_revision)?;
        let item_type = transaction.query_row(
            "SELECT item_type FROM board_items WHERE item_id=?1 AND board_id=?2 AND deleted_at IS NULL",
            params![item_id, board_id],
            |row| row.get::<_, String>(0),
        ).optional().map_err(BoardStoreError::database)?.ok_or_else(|| BoardStoreError::new("board_item_not_found", "Board item was not found"))?;
        let payload = patch.payload.as_ref().map(|value| validate_payload(&item_type, value)).transpose()?;
        let timestamp = now_millis().to_string();
        let changed = transaction.execute(
            "UPDATE board_items SET x=COALESCE(?1,x), y=COALESCE(?2,y), width=COALESCE(?3,width), height=COALESCE(?4,height), z_index=COALESCE(?5,z_index), rotation=COALESCE(?6,rotation), payload_json=COALESCE(?7,payload_json), revision=revision+1, updated_at=?8 WHERE item_id=?9 AND board_id=?10 AND revision=?11 AND deleted_at IS NULL",
            params![patch.x, patch.y, patch.width, patch.height, patch.z_index, patch.rotation, payload, timestamp, item_id, board_id, expected_item_revision],
        ).map_err(BoardStoreError::database)?;
        if changed != 1 { return Err(BoardStoreError::new("board_write_conflict", "Board item revision changed while saving")); }
        let board_changed = transaction.execute("UPDATE boards SET revision=revision+1, updated_at=?2 WHERE board_id=?1 AND revision=?3", params![board_id, timestamp, expected_revision]).map_err(BoardStoreError::database)?;
        if board_changed != 1 { return Err(BoardStoreError::new("board_write_conflict", "Board revision changed while saving")); }
        transaction.execute("UPDATE board_leases SET heartbeat_at=?2 WHERE board_id=?1 AND lease_epoch=?3", params![board_id, now_millis().to_string(), lease_epoch]).map_err(BoardStoreError::database)?;
        transaction.commit().map_err(BoardStoreError::database)?;
        load_document(connection, &project, &board_id)
    }).await?;
    emit_changed(
        &emitter,
        &BoardChanged {
            board_id: changed_board_id,
            revision: document.board.revision,
        },
    );
    Ok(document)
}

#[tauri::command]
pub(crate) async fn board_item_soft_delete(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    item_id: String,
    lease_epoch: i64,
    expected_revision: i64,
) -> Result<BoardDocument, BoardStoreError> {
    validate_id(&board_id)?;
    validate_id(&item_id)?;
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let emitter = app.clone();
    let changed_board_id = board_id.clone();
    let document = run_store(app, move |state, connection| {
        let transaction = connection.transaction().map_err(BoardStoreError::database)?;
        authorize_mutation(&transaction, &project, state, &window_label, &board_id, lease_epoch, expected_revision)?;
        let timestamp = now_millis().to_string();
        let changed = transaction.execute("UPDATE board_items SET deleted_at=?3, updated_at=?3, revision=revision+1 WHERE item_id=?1 AND board_id=?2 AND deleted_at IS NULL", params![item_id, board_id, timestamp]).map_err(BoardStoreError::database)?;
        if changed != 1 { return Err(BoardStoreError::new("board_item_not_found", "Board item was not found")); }
        let changed = transaction.execute("UPDATE boards SET revision=revision+1, updated_at=?2 WHERE board_id=?1 AND revision=?3", params![board_id, timestamp, expected_revision]).map_err(BoardStoreError::database)?;
        if changed != 1 { return Err(BoardStoreError::new("board_write_conflict", "Board revision changed while saving")); }
        transaction.commit().map_err(BoardStoreError::database)?;
        load_document(connection, &project, &board_id)
    }).await?;
    emit_changed(
        &emitter,
        &BoardChanged {
            board_id: changed_board_id,
            revision: document.board.revision,
        },
    );
    Ok(document)
}

fn apply_item_mutations_transactional(
    connection: &mut Connection,
    project: &ProjectContext,
    state: &BoardStoreState,
    window_label: &str,
    board_id: &str,
    lease_epoch: i64,
    expected_revision: i64,
    mutations: Vec<BoardItemMutation>,
) -> Result<BoardDocument, BoardStoreError> {
    validate_id(board_id)?;
    if mutations.is_empty() || mutations.len() > 500 {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board mutation batch must contain between 1 and 500 items",
        ));
    }
    let mut item_ids = HashSet::with_capacity(mutations.len());
    for mutation in &mutations {
        let item_id = match mutation {
            BoardItemMutation::Create { item_id, item } => {
                validate_new_item(item)?;
                item_id
            }
            BoardItemMutation::Update { item_id, patch, .. } => {
                validate_item_patch(patch)?;
                item_id
            }
            BoardItemMutation::SoftDelete { item_id, .. }
            | BoardItemMutation::Restore { item_id, .. } => item_id,
        };
        validate_id(item_id)?;
        if !item_ids.insert(item_id.clone()) {
            return Err(BoardStoreError::new(
                "board_input_invalid",
                "Board mutation batch contains duplicate item IDs",
            ));
        }
    }

    let transaction = connection
        .transaction()
        .map_err(BoardStoreError::database)?;
    authorize_mutation(
        &transaction,
        project,
        state,
        window_label,
        board_id,
        lease_epoch,
        expected_revision,
    )?;
    let timestamp = now_millis().to_string();
    for mutation in mutations {
        let changed = match mutation {
            BoardItemMutation::Create { item_id, item } => {
                let payload = validate_new_item(&item)?;
                transaction.execute(
                    "INSERT INTO board_items(item_id, board_id, item_type, x, y, width, height, z_index, rotation, payload_json, revision, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?11)",
                    params![item_id, board_id, item.item_type, item.x, item.y, item.width, item.height, item.z_index, item.rotation, payload, timestamp],
                ).map_err(BoardStoreError::database)?
            }
            BoardItemMutation::Update {
                item_id,
                expected_item_revision,
                patch,
            } => {
                let item_type = transaction
                    .query_row(
                        "SELECT item_type FROM board_items WHERE item_id=?1 AND board_id=?2 AND deleted_at IS NULL",
                        params![item_id, board_id],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                    .map_err(BoardStoreError::database)?
                    .ok_or_else(|| BoardStoreError::new("board_item_not_found", "Board item was not found"))?;
                let payload = patch
                    .payload
                    .as_ref()
                    .map(|value| validate_payload(&item_type, value))
                    .transpose()?;
                transaction.execute(
                    "UPDATE board_items SET x=COALESCE(?1,x), y=COALESCE(?2,y), width=COALESCE(?3,width), height=COALESCE(?4,height), z_index=COALESCE(?5,z_index), rotation=COALESCE(?6,rotation), payload_json=COALESCE(?7,payload_json), revision=revision+1, updated_at=?8 WHERE item_id=?9 AND board_id=?10 AND revision=?11 AND deleted_at IS NULL",
                    params![patch.x, patch.y, patch.width, patch.height, patch.z_index, patch.rotation, payload, timestamp, item_id, board_id, expected_item_revision],
                ).map_err(BoardStoreError::database)?
            }
            BoardItemMutation::SoftDelete {
                item_id,
                expected_item_revision,
            } => {
                let frame_payload = transaction
                    .query_row(
                        "SELECT item_type, payload_json FROM board_items WHERE item_id=?1 AND board_id=?2",
                        params![item_id, board_id],
                        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                    )
                    .optional()
                    .map_err(BoardStoreError::database)?
                    .and_then(|(item_type, payload)| {
                        if item_type != "frame" {
                            return None;
                        }
                        let mut value: serde_json::Value = serde_json::from_str(&payload).ok()?;
                        value.as_object_mut()?.insert("childIds".into(), serde_json::json!([]));
                        serde_json::to_string(&value).ok()
                    });
                transaction
                    .execute(
                        "UPDATE board_items SET deleted_at=?4, updated_at=?4, payload_json=COALESCE(?5,payload_json), revision=revision+1 WHERE item_id=?1 AND board_id=?2 AND revision=?3 AND deleted_at IS NULL",
                        params![item_id, board_id, expected_item_revision, timestamp, frame_payload],
                    )
                    .map_err(BoardStoreError::database)?
            },
            BoardItemMutation::Restore {
                item_id,
                expected_item_revision,
            } => transaction
                .execute(
                    "UPDATE board_items SET deleted_at=NULL, updated_at=?4, revision=revision+1 WHERE item_id=?1 AND board_id=?2 AND revision=?3 AND deleted_at IS NOT NULL",
                    params![item_id, board_id, expected_item_revision, timestamp],
                )
                .map_err(BoardStoreError::database)?,
        };
        if changed != 1 {
            return Err(BoardStoreError::new(
                "board_write_conflict",
                "Board item revision or state changed while saving",
            ));
        }
    }
    let board_changed = transaction
        .execute(
            "UPDATE boards SET revision=revision+1, updated_at=?2 WHERE board_id=?1 AND revision=?3",
            params![board_id, timestamp, expected_revision],
        )
        .map_err(BoardStoreError::database)?;
    if board_changed != 1 {
        return Err(BoardStoreError::new(
            "board_write_conflict",
            "Board revision changed while saving",
        ));
    }
    transaction
        .execute(
            "UPDATE board_leases SET heartbeat_at=?2 WHERE board_id=?1 AND lease_epoch=?3",
            params![board_id, now_millis().to_string(), lease_epoch],
        )
        .map_err(BoardStoreError::database)?;
    transaction.commit().map_err(BoardStoreError::database)?;
    load_document(connection, project, board_id)
}

#[tauri::command]
pub(crate) async fn board_items_apply(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    lease_epoch: i64,
    expected_revision: i64,
    mutations: Vec<BoardItemMutation>,
) -> Result<BoardDocument, BoardStoreError> {
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let emitter = app.clone();
    let changed_board_id = board_id.clone();
    let document = run_store(app, move |state, connection| {
        apply_item_mutations_transactional(
            connection,
            &project,
            state,
            &window_label,
            &board_id,
            lease_epoch,
            expected_revision,
            mutations,
        )
    })
    .await?;
    emit_changed(
        &emitter,
        &BoardChanged {
            board_id: changed_board_id,
            revision: document.board.revision,
        },
    );
    Ok(document)
}

#[tauri::command]
pub(crate) async fn board_soft_delete(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    lease_epoch: i64,
    expected_revision: i64,
) -> Result<BoardDocument, BoardStoreError> {
    validate_id(&board_id)?;
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let emitter = app.clone();
    let changed_board_id = board_id.clone();
    let document = run_store(app, move |state, connection| {
        let transaction = connection.transaction().map_err(BoardStoreError::database)?;
        authorize_mutation(&transaction, &project, state, &window_label, &board_id, lease_epoch, expected_revision)?;
        let timestamp = now_millis().to_string();
        let changed = transaction.execute("UPDATE boards SET deleted_at=?2, updated_at=?2, revision=revision+1 WHERE board_id=?1 AND revision=?3 AND deleted_at IS NULL", params![board_id, timestamp, expected_revision]).map_err(BoardStoreError::database)?;
        if changed != 1 { return Err(BoardStoreError::new("board_write_conflict", "Board revision changed while deleting")); }
        transaction.commit().map_err(BoardStoreError::database)?;
        load_document(connection, &project, &board_id)
    }).await?;
    emit_changed(
        &emitter,
        &BoardChanged {
            board_id: changed_board_id,
            revision: document.board.revision,
        },
    );
    Ok(document)
}

#[tauri::command]
pub(crate) async fn board_restore(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    lease_epoch: i64,
    expected_revision: i64,
) -> Result<BoardDocument, BoardStoreError> {
    validate_id(&board_id)?;
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let emitter = app.clone();
    let changed_board_id = board_id.clone();
    let document = run_store(app, move |state, connection| {
        let transaction = connection.transaction().map_err(BoardStoreError::database)?;
        let authorized: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM boards b JOIN board_leases l ON l.board_id=b.board_id WHERE b.board_id=?1 AND b.project_key=?2 AND b.deleted_at IS NOT NULL AND b.revision=?3 AND l.app_instance_id=?4 AND l.window_label=?5 AND l.lease_epoch=?6)", params![board_id, project.key, expected_revision, state.app_instance_id, window_label, lease_epoch], |row| row.get(0)).map_err(BoardStoreError::database)?;
        if !authorized { return Err(BoardStoreError::new("board_write_conflict", "Board revision or editing lease is stale")); }
        let timestamp = now_millis().to_string();
        let changed = transaction.execute("UPDATE boards SET deleted_at=NULL, updated_at=?2, revision=revision+1 WHERE board_id=?1 AND revision=?3 AND deleted_at IS NOT NULL", params![board_id, timestamp, expected_revision]).map_err(BoardStoreError::database)?;
        if changed != 1 { return Err(BoardStoreError::new("board_write_conflict", "Board revision changed while restoring")); }
        transaction.commit().map_err(BoardStoreError::database)?;
        load_document(connection, &project, &board_id)
    }).await?;
    emit_changed(
        &emitter,
        &BoardChanged {
            board_id: changed_board_id,
            revision: document.board.revision,
        },
    );
    Ok(document)
}

const MAX_ASSET_BYTES: u64 = 25 * 1024 * 1024;
const MAX_BOARD_ASSET_BYTES: i64 = 500 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 40_000_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BoardAsset {
    asset_id: String,
    mime_type: String,
    byte_length: i64,
    url: String,
    board_revision: i64,
}

struct ValidatedImage {
    bytes: Vec<u8>,
    sha256: String,
    mime_type: &'static str,
    extension: &'static str,
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn read_validated_image(path: &Path) -> Result<ValidatedImage, BoardStoreError> {
    let metadata = std::fs::metadata(path).map_err(|_| {
        BoardStoreError::new("board_asset_invalid", "Selected image could not be read")
    })?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_ASSET_BYTES {
        return Err(BoardStoreError::new(
            "board_asset_invalid",
            "Selected image size is not allowed",
        ));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    std::fs::File::open(path)
        .and_then(|file| file.take(MAX_ASSET_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|_| {
            BoardStoreError::new("board_asset_invalid", "Selected image could not be read")
        })?;
    if bytes.len() as u64 != metadata.len() || bytes.len() as u64 > MAX_ASSET_BYTES {
        return Err(BoardStoreError::new(
            "board_asset_invalid",
            "Selected image changed while reading",
        ));
    }
    let format = image::guess_format(&bytes).map_err(|_| {
        BoardStoreError::new(
            "board_asset_invalid",
            "Selected file is not a supported image",
        )
    })?;
    let (mime_type, extension) = match format {
        image::ImageFormat::Png => ("image/png", "png"),
        image::ImageFormat::Jpeg => ("image/jpeg", "jpg"),
        _ => {
            return Err(BoardStoreError::new(
                "board_asset_invalid",
                "Only PNG and JPEG images are supported",
            ))
        }
    };
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_IMAGE_PIXELS * 4);
    let mut dimensions_reader = image::ImageReader::with_format(Cursor::new(&bytes), format);
    dimensions_reader.limits(limits.clone());
    let (width, height) = dimensions_reader
        .into_dimensions()
        .map_err(|_| BoardStoreError::new("board_asset_invalid", "Selected image is malformed"))?;
    if u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return Err(BoardStoreError::new(
            "board_asset_invalid",
            "Selected image dimensions are too large",
        ));
    }
    let mut decode_reader = image::ImageReader::with_format(Cursor::new(&bytes), format);
    decode_reader.limits(limits);
    decode_reader.decode().map_err(|_| {
        BoardStoreError::new("board_asset_invalid", "Selected image could not be decoded")
    })?;
    let sha256 = sha256_hex(&bytes);
    Ok(ValidatedImage {
        bytes,
        sha256,
        mime_type,
        extension,
    })
}

fn persist_asset_file(root: &Path, image: &ValidatedImage) -> Result<String, BoardStoreError> {
    let assets = root.join("assets");
    std::fs::create_dir_all(&assets).map_err(|_| {
        BoardStoreError::new(
            "board_asset_write_failed",
            "Board asset directory is unavailable",
        )
    })?;
    let relative_path = format!("{}.{}", image.sha256, image.extension);
    let destination = assets.join(&relative_path);
    if destination.exists() {
        let existing = std::fs::metadata(&destination).map_err(|_| {
            BoardStoreError::new(
                "board_asset_write_failed",
                "Existing Board asset is unavailable",
            )
        })?;
        if existing.len() != image.bytes.len() as u64
            || std::fs::read(&destination)
                .map(|bytes| sha256_hex(&bytes) != image.sha256)
                .unwrap_or(true)
        {
            return Err(BoardStoreError::new(
                "board_integrity_failed",
                "Existing Board asset does not match its hash",
            ));
        }
        return Ok(relative_path);
    }
    let temporary = assets.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let write_result = (|| -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&image.bytes)?;
        file.sync_all()?;
        std::fs::rename(&temporary, &destination)
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temporary);
        return Err(BoardStoreError::new(
            "board_asset_write_failed",
            format!("Board asset write failed: {error}"),
        ));
    }
    Ok(relative_path)
}

#[tauri::command]
pub(crate) async fn board_asset_choose_and_import(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    item_id: String,
    role: String,
    lease_epoch: i64,
    expected_revision: i64,
) -> Result<Option<BoardAsset>, BoardStoreError> {
    if !board_mode_enabled() {
        return Err(BoardStoreError::new(
            "board_mode_disabled",
            "Board Mode is disabled in this build",
        ));
    }
    validate_id(&board_id)?;
    validate_id(&item_id)?;
    if !matches!(role.as_str(), "image" | "drawing") {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Board asset role is invalid",
        ));
    }
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let picker_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        picker_app
            .dialog()
            .file()
            .add_filter("Images", &["png", "jpg", "jpeg"])
            .blocking_pick_file()
    })
    .await
    .map_err(|_| BoardStoreError::new("board_picker_failed", "Image picker failed"))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|_| {
        BoardStoreError::new("board_asset_invalid", "Selected image path is invalid")
    })?;
    import_image_from_path(
        app, project, window_label, board_id, item_id, role, lease_epoch, expected_revision, path,
    )
    .await
    .map(Some)
}

/// Validate an image on disk, store it content-addressed, and link it to a board item.
/// Shared by the file-picker import and by generated images so both go through the same
/// MIME sniffing, raster limits, storage cap, and lease/revision authorization.
#[allow(clippy::too_many_arguments)]
async fn import_image_from_path(
    app: AppHandle,
    project: ProjectContext,
    window_label: String,
    board_id: String,
    item_id: String,
    role: String,
    lease_epoch: i64,
    expected_revision: i64,
    path: std::path::PathBuf,
) -> Result<BoardAsset, BoardStoreError> {
    let store_root = super::home_dir().join(".gg/boards");
    let image = tauri::async_runtime::spawn_blocking(move || {
        let image = read_validated_image(&path)?;
        let relative_path = persist_asset_file(&store_root, &image)?;
        Ok::<_, BoardStoreError>((image, relative_path))
    })
    .await
    .map_err(|_| BoardStoreError::new("board_asset_invalid", "Image validation worker failed"))??;
    let emitter = app.clone();
    let changed_board_id = board_id.clone();
    let asset = run_store(app, move |state, connection| {
        let transaction = connection.transaction().map_err(BoardStoreError::database)?;
        authorize_mutation(&transaction, &project, state, &window_label, &board_id, lease_epoch, expected_revision)?;
        let item_type = transaction.query_row(
            "SELECT item_type FROM board_items WHERE item_id=?1 AND board_id=?2 AND deleted_at IS NULL",
            params![item_id, board_id],
            |row| row.get::<_, String>(0),
        ).optional().map_err(BoardStoreError::database)?.ok_or_else(|| BoardStoreError::new("board_item_not_found", "Board item was not found"))?;
        if item_type != role {
            return Err(BoardStoreError::new("board_input_invalid", "Board asset role does not match its item"));
        }
        let current_total: i64 = transaction.query_row(
            "SELECT COALESCE(SUM(a.byte_length), 0) FROM assets a JOIN item_assets ia ON ia.asset_id=a.asset_id JOIN board_items i ON i.item_id=ia.item_id WHERE i.board_id=?1 AND a.deleted_at IS NULL",
            [&board_id], |row| row.get(0),
        ).map_err(BoardStoreError::database)?;
        let already_present: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM assets WHERE sha256=?1)", [&image.0.sha256], |row| row.get(0),
        ).map_err(BoardStoreError::database)?;
        if !already_present && current_total.saturating_add(image.0.bytes.len() as i64) > MAX_BOARD_ASSET_BYTES {
            return Err(BoardStoreError::new("board_asset_limit", "Board asset storage limit would be exceeded"));
        }
        let asset_id = transaction.query_row(
            "SELECT asset_id FROM assets WHERE sha256=?1", [&image.0.sha256], |row| row.get::<_, String>(0),
        ).optional().map_err(BoardStoreError::database)?.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        transaction.execute(
            "INSERT INTO assets(asset_id, sha256, relative_path, mime_type, byte_length, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(sha256) DO NOTHING",
            params![asset_id, image.0.sha256, image.1, image.0.mime_type, image.0.bytes.len() as i64, now_millis().to_string()],
        ).map_err(BoardStoreError::database)?;
        transaction.execute(
            "INSERT OR IGNORE INTO item_assets(item_id, asset_id, role) VALUES (?1, ?2, ?3)", params![item_id, asset_id, role],
        ).map_err(BoardStoreError::database)?;
        let timestamp = now_millis().to_string();
        let changed = transaction.execute(
            "UPDATE boards SET revision=revision+1, updated_at=?2 WHERE board_id=?1 AND revision=?3", params![board_id, timestamp, expected_revision],
        ).map_err(BoardStoreError::database)?;
        if changed != 1 { return Err(BoardStoreError::new("board_write_conflict", "Board revision changed while importing an asset")); }
        transaction.commit().map_err(BoardStoreError::database)?;
        Ok(BoardAsset { asset_id: asset_id.clone(), mime_type: image.0.mime_type.to_string(), byte_length: image.0.bytes.len() as i64, url: format!("board-asset://{asset_id}"), board_revision: expected_revision + 1 })
    }).await?;
    emit_changed(
        &emitter,
        &BoardChanged {
            board_id: changed_board_id,
            revision: asset.board_revision,
        },
    );
    Ok(asset)
}

/// Codex backend endpoint. ChatGPT OAuth tokens are rejected by
/// api.openai.com/v1/images/*, but they work here, and the backend routes the Responses
/// API's built-in `image_generation` tool to gpt-image-2. This mirrors the contract the
/// ggcoder `generate_image` tool already uses.
const CODEX_RESPONSES_ENDPOINT: &str = "https://chatgpt.com/backend-api/codex/responses";
const IMAGE_GEN_MODEL: &str = "gpt-5.5";
const MAX_IMAGE_PROMPT_CHARS: usize = 4_000;

/// Read the ChatGPT OAuth access token (and account id) the desktop app already stores.
fn openai_oauth_credentials() -> Result<(String, Option<String>), BoardStoreError> {
    let path = super::home_dir().join(".gg").join("auth.json");
    let raw = std::fs::read_to_string(&path).map_err(|_| {
        BoardStoreError::new("openai_not_connected", "Sign in to OpenAI to generate images")
    })?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(|_| {
        BoardStoreError::new("openai_not_connected", "Stored OpenAI credentials are unreadable")
    })?;
    let entry = parsed.get("openai").ok_or_else(|| {
        BoardStoreError::new("openai_not_connected", "Sign in to OpenAI to generate images")
    })?;
    let token = entry
        .get("accessToken")
        .and_then(|value| value.as_str())
        .filter(|token| !token.is_empty())
        .ok_or_else(|| {
            BoardStoreError::new("openai_not_connected", "Sign in to OpenAI to generate images")
        })?;
    let account_id = entry
        .get("accountId")
        .and_then(|value| value.as_str())
        .filter(|id| !id.is_empty())
        .map(str::to_string);
    Ok((token.to_string(), account_id))
}

/// Stream the Codex response and pull the base64 image out of the
/// `image_generation_call` output item.
async fn request_generated_image(prompt: &str) -> Result<Vec<u8>, BoardStoreError> {
    use base64::Engine as _;
    let (token, account_id) = openai_oauth_credentials()?;
    let body = serde_json::json!({
        "model": IMAGE_GEN_MODEL,
        "store": false,
        "stream": true,
        "instructions": "Generate the image the user requested.",
        "input": [{ "role": "user", "content": [{ "type": "input_text", "text": prompt }] }],
        "tools": [{ "type": "image_generation", "output_format": "png", "action": "generate" }],
        "tool_choice": "auto",
        "reasoning": { "effort": "low" },
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|_| BoardStoreError::new("board_generate_failed", "HTTP client unavailable"))?;
    // Match the header set the working Codex provider sends. The backend rejects
    // requests that do not look like the Codex client, so Accept, OpenAI-Beta,
    // originator, and User-Agent all matter — an unknown originator is refused.
    let mut request = client
        .post(CODEX_RESPONSES_ENDPOINT)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .header("Authorization", format!("Bearer {token}"))
        .header("OpenAI-Beta", "responses=experimental")
        .header("originator", "ggcoder")
        .header("User-Agent", "ggcoder (windows; x86_64)");
    if let Some(account) = account_id {
        request = request.header("chatgpt-account-id", account);
    }
    let response = request.json(&body).send().await.map_err(|_| {
        BoardStoreError::new("board_generate_failed", "Could not reach the image service")
    })?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let detail = response.text().await.unwrap_or_default();
        let message = serde_json::from_str::<serde_json::Value>(&detail)
            .ok()
            .and_then(|value| {
                value
                    .get("detail")
                    .and_then(|d| d.as_str())
                    .or_else(|| value.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()))
                    .map(str::to_string)
            })
            .unwrap_or_else(|| format!("Image service returned {status}"));
        return Err(BoardStoreError::new("board_generate_failed", message));
    }
    let text = response.text().await.map_err(|_| {
        BoardStoreError::new("board_generate_failed", "Image response could not be read")
    })?;
    for line in text.lines() {
        let Some(payload) = line.strip_prefix("data: ") else { continue };
        if payload.trim() == "[DONE]" {
            break;
        }
        let Ok(event) = serde_json::from_str::<serde_json::Value>(payload) else { continue };
        let item = event.get("item");
        let is_image = item
            .and_then(|item| item.get("type"))
            .and_then(|value| value.as_str())
            == Some("image_generation_call");
        if !is_image {
            continue;
        }
        if let Some(result) = item.and_then(|item| item.get("result")).and_then(|v| v.as_str()) {
            return base64::engine::general_purpose::STANDARD
                .decode(result)
                .map_err(|_| {
                    BoardStoreError::new("board_generate_failed", "Generated image was malformed")
                });
        }
    }
    Err(BoardStoreError::new(
        "board_generate_failed",
        "The image service returned no image",
    ))
}

/// Generate an image from a prompt and attach it to an existing image item. The network
/// call happens here rather than in the webview, so the board runtime itself still makes
/// no outbound requests.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn board_image_generate(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    item_id: String,
    prompt: String,
    lease_epoch: i64,
    expected_revision: i64,
) -> Result<BoardAsset, BoardStoreError> {
    if !board_mode_enabled() {
        return Err(BoardStoreError::new(
            "board_mode_disabled",
            "Board Mode is disabled in this build",
        ));
    }
    validate_id(&board_id)?;
    validate_id(&item_id)?;
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() || prompt.chars().count() > MAX_IMAGE_PROMPT_CHARS {
        return Err(BoardStoreError::new(
            "board_input_invalid",
            "Image prompt is empty or too long",
        ));
    }
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let bytes = request_generated_image(&prompt).await?;
    // Land the bytes on disk so the generated image goes through exactly the same
    // validation as a picked file: magic-byte sniffing, raster limits, and the store cap.
    let store_root = super::home_dir().join(".gg/boards");
    let staged = tauri::async_runtime::spawn_blocking(move || {
        let dir = store_root.join("incoming");
        std::fs::create_dir_all(&dir).map_err(|_| {
            BoardStoreError::new("board_generate_failed", "Could not stage the generated image")
        })?;
        let path = dir.join(format!("{}.png", uuid::Uuid::new_v4()));
        std::fs::write(&path, &bytes).map_err(|_| {
            BoardStoreError::new("board_generate_failed", "Could not stage the generated image")
        })?;
        Ok::<_, BoardStoreError>(path)
    })
    .await
    .map_err(|_| BoardStoreError::new("board_generate_failed", "Staging worker failed"))??;
    let result = import_image_from_path(
        app,
        project,
        window_label,
        board_id,
        item_id,
        "image".to_string(),
        lease_epoch,
        expected_revision,
        staged.clone(),
    )
    .await;
    let _ = std::fs::remove_file(&staged);
    result
}

fn validate_export_bytes(format: &str, bytes: &[u8]) -> Result<&'static str, BoardStoreError> {
    if bytes.is_empty() || bytes.len() > 64 * 1024 * 1024 {
        return Err(BoardStoreError::new(
            "board_export_invalid",
            "Board export size is invalid",
        ));
    }
    let valid = match format {
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "pdf" => bytes.starts_with(b"%PDF-") && bytes.ends_with(b"%%EOF\n"),
        "csv" => std::str::from_utf8(bytes).is_ok_and(|text| !text.contains('\0')),
        _ => false,
    };
    if !valid {
        return Err(BoardStoreError::new(
            "board_export_invalid",
            "Board export data is invalid",
        ));
    }
    Ok(match format {
        "jpg" => "jpg",
        "png" => "png",
        "pdf" => "pdf",
        "csv" => "csv",
        _ => unreachable!(),
    })
}

#[tauri::command]
pub(crate) async fn board_export_choose_destination(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    board_id: String,
    format: String,
    bytes: Vec<u8>,
) -> Result<bool, BoardStoreError> {
    if !board_mode_enabled() {
        return Err(BoardStoreError::new(
            "board_mode_disabled",
            "Board Mode is disabled in this build",
        ));
    }
    validate_id(&board_id)?;
    let extension = validate_export_bytes(&format, &bytes)?;
    let project = project_context(&window, &windows)?;
    let authorized_board_id = board_id.clone();
    run_store(app.clone(), move |_, connection| {
        let belongs: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM boards WHERE board_id=?1 AND project_key=?2 AND deleted_at IS NULL)",
            params![authorized_board_id, project.key],
            |row| row.get(0),
        ).map_err(BoardStoreError::database)?;
        if !belongs { return Err(BoardStoreError::new("board_not_found", "Board was not found")); }
        Ok(())
    }).await?;
    let picker_app = app.clone();
    let picker_extension = extension.to_string();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        picker_app
            .dialog()
            .file()
            .add_filter(
                format!("{} export", picker_extension.to_uppercase()),
                &[&picker_extension],
            )
            .set_file_name(format!("board-export.{picker_extension}"))
            .blocking_save_file()
    })
    .await
    .map_err(|_| BoardStoreError::new("board_picker_failed", "Export picker failed"))?;
    let Some(selected) = selected else {
        return Ok(false);
    };
    let mut path = selected.into_path().map_err(|_| {
        BoardStoreError::new("board_export_failed", "Export destination is invalid")
    })?;
    match path.extension().and_then(|value| value.to_str()) {
        None => {
            path.set_extension(extension);
        }
        Some(value) if value.eq_ignore_ascii_case(extension) => {}
        Some(_) => {
            return Err(BoardStoreError::new(
                "board_export_invalid",
                "Export extension does not match its format",
            ))
        }
    }
    super::atomic_replace(&path, &bytes).map_err(|_| {
        BoardStoreError::new("board_export_failed", "Board export could not be saved")
    })?;
    Ok(true)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BoardBackupRecord {
    backup_id: String,
    created_at: String,
    board_count: i64,
    item_count: i64,
    asset_count: i64,
    byte_length: u64,
}

fn directory_size(root: &Path) -> Result<u64, BoardStoreError> {
    let mut total = 0_u64;
    let mut pending = vec![root.to_path_buf()];
    while let Some(path) = pending.pop() {
        for entry in std::fs::read_dir(path).map_err(|_| {
            BoardStoreError::new(
                "board_restore_failed",
                "Restore source could not be measured",
            )
        })? {
            let entry = entry.map_err(|_| {
                BoardStoreError::new(
                    "board_restore_failed",
                    "Restore source could not be measured",
                )
            })?;
            let metadata = entry.metadata().map_err(|_| {
                BoardStoreError::new(
                    "board_restore_failed",
                    "Restore source could not be measured",
                )
            })?;
            if metadata.is_dir() {
                pending.push(entry.path());
            } else if metadata.is_file() {
                total = total.saturating_add(metadata.len());
            } else {
                return Err(BoardStoreError::new(
                    "board_restore_failed",
                    "Restore source contains an unsupported filesystem entry",
                ));
            }
        }
    }
    Ok(total)
}

#[cfg(windows)]
fn available_space(path: &Path) -> Result<u64, BoardStoreError> {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0_u64;
    let ok = unsafe {
        windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(BoardStoreError::new(
            "board_disk_space_unknown",
            "Free disk space could not be verified",
        ));
    }
    Ok(available)
}

#[cfg(not(windows))]
fn available_space(_path: &Path) -> Result<u64, BoardStoreError> {
    Err(BoardStoreError::new(
        "board_mode_disabled",
        "Board restore is available on Windows only",
    ))
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), BoardStoreError> {
    std::fs::create_dir_all(destination).map_err(|_| {
        BoardStoreError::new(
            "board_restore_failed",
            "Restore staging directory could not be created",
        )
    })?;
    for entry in std::fs::read_dir(source).map_err(|_| {
        BoardStoreError::new("board_restore_failed", "Restore source could not be read")
    })? {
        let entry = entry.map_err(|_| {
            BoardStoreError::new("board_restore_failed", "Restore source could not be read")
        })?;
        let target = destination.join(entry.file_name());
        let metadata = entry.metadata().map_err(|_| {
            BoardStoreError::new(
                "board_restore_failed",
                "Restore entry could not be inspected",
            )
        })?;
        if metadata.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if metadata.is_file() {
            if std::fs::hard_link(entry.path(), &target).is_err() {
                std::fs::copy(entry.path(), &target).map_err(|_| {
                    BoardStoreError::new(
                        "board_restore_failed",
                        "Restore entry could not be copied",
                    )
                })?;
            }
        } else {
            return Err(BoardStoreError::new(
                "board_restore_failed",
                "Restore source contains an unsupported filesystem entry",
            ));
        }
    }
    Ok(())
}

fn stage_restore(
    live_root: &Path,
    backup_root: &Path,
    staging: &Path,
) -> Result<(), BoardStoreError> {
    std::fs::create_dir(staging).map_err(|_| {
        BoardStoreError::new(
            "board_restore_failed",
            "Restore staging root could not be created",
        )
    })?;
    std::fs::copy(
        backup_root.join("boards.sqlite3"),
        staging.join("boards.sqlite3"),
    )
    .map_err(|_| {
        BoardStoreError::new(
            "board_restore_failed",
            "Restore database could not be staged",
        )
    })?;
    copy_tree(&backup_root.join("assets"), &staging.join("assets"))?;
    copy_tree(&live_root.join("backups"), &staging.join("backups"))?;
    verify_backup_root(backup_root)?;
    let staged = Connection::open_with_flags(
        staging.join("boards.sqlite3"),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(BoardStoreError::database)?;
    verify_connection(&staged)
}

fn create_backup(
    connection: &Connection,
    store_root: &Path,
    reason: &str,
) -> Result<BoardBackupRecord, BoardStoreError> {
    let created_at = now_millis().to_string();
    let backup_id = format!("{}-{}", created_at, uuid::Uuid::new_v4());
    let backups = store_root.join("backups");
    std::fs::create_dir_all(&backups).map_err(|_| {
        BoardStoreError::new(
            "board_backup_failed",
            "Board backup directory is unavailable",
        )
    })?;
    let staging = backups.join(format!(".{backup_id}.staging"));
    let destination = backups.join(&backup_id);
    std::fs::create_dir(&staging).map_err(|_| {
        BoardStoreError::new(
            "board_backup_failed",
            "Board backup staging could not be created",
        )
    })?;
    let result = (|| -> Result<BoardBackupRecord, BoardStoreError> {
        let database_path = staging.join("boards.sqlite3");
        let mut destination_connection =
            Connection::open(&database_path).map_err(BoardStoreError::database)?;
        rusqlite::backup::Backup::new(connection, &mut destination_connection)
            .and_then(|backup| backup.run_to_completion(64, Duration::from_millis(10), None))
            .map_err(BoardStoreError::database)?;
        drop(destination_connection);
        let verified =
            Connection::open_with_flags(&database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(BoardStoreError::database)?;
        verify_connection(&verified)?;
        let board_count: i64 = verified
            .query_row("SELECT COUNT(*) FROM boards", [], |row| row.get(0))
            .map_err(BoardStoreError::database)?;
        let item_count: i64 = verified
            .query_row("SELECT COUNT(*) FROM board_items", [], |row| row.get(0))
            .map_err(BoardStoreError::database)?;
        let mut statement = verified.prepare("SELECT DISTINCT a.sha256, a.relative_path, a.byte_length FROM assets a JOIN item_assets ia ON ia.asset_id=a.asset_id ORDER BY a.sha256").map_err(BoardStoreError::database)?;
        let assets = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(BoardStoreError::database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(BoardStoreError::database)?;
        drop(statement);
        drop(verified);
        let backup_assets = staging.join("assets");
        std::fs::create_dir(&backup_assets).map_err(|_| {
            BoardStoreError::new(
                "board_backup_failed",
                "Board backup assets could not be created",
            )
        })?;
        let mut asset_manifest = String::new();
        let mut byte_length = std::fs::metadata(&database_path)
            .map_err(|_| {
                BoardStoreError::new(
                    "board_backup_failed",
                    "Board backup database is unavailable",
                )
            })?
            .len();
        for (sha256, relative_path, expected_length) in &assets {
            let source = store_root.join("assets").join(relative_path);
            let bytes = std::fs::read(&source).map_err(|_| {
                BoardStoreError::new(
                    "board_backup_failed",
                    "A referenced Board asset is unavailable",
                )
            })?;
            if bytes.len() as i64 != *expected_length || sha256_hex(&bytes) != *sha256 {
                return Err(BoardStoreError::new(
                    "board_integrity_failed",
                    "A referenced Board asset failed verification",
                ));
            }
            std::fs::write(backup_assets.join(relative_path), &bytes).map_err(|_| {
                BoardStoreError::new(
                    "board_backup_failed",
                    "A Board asset could not be backed up",
                )
            })?;
            byte_length = byte_length.saturating_add(bytes.len() as u64);
            asset_manifest.push_str(&format!("{sha256} {expected_length} {relative_path}\n"));
        }
        let database_bytes = std::fs::read(&database_path).map_err(|_| {
            BoardStoreError::new(
                "board_backup_failed",
                "Board backup database could not be verified",
            )
        })?;
        let metadata = serde_json::json!({
            "schemaVersion": LATEST_SCHEMA_VERSION,
            "createdAt": created_at,
            "reason": reason,
            "boardCount": board_count,
            "itemCount": item_count,
            "assetCount": assets.len(),
            "databaseSha256": sha256_hex(&database_bytes),
            "assetManifestSha256": sha256_hex(asset_manifest.as_bytes()),
            "appVersion": env!("CARGO_PKG_VERSION")
        });
        let manifest_bytes = serde_json::to_vec_pretty(&metadata).map_err(|_| {
            BoardStoreError::new(
                "board_backup_failed",
                "Board backup manifest could not be encoded",
            )
        })?;
        std::fs::write(staging.join("assets.sha256"), asset_manifest)
            .and_then(|_| std::fs::write(staging.join("manifest.json"), manifest_bytes))
            .map_err(|_| {
                BoardStoreError::new(
                    "board_backup_failed",
                    "Board backup manifest could not be written",
                )
            })?;
        std::fs::rename(&staging, &destination).map_err(|_| {
            BoardStoreError::new("board_backup_failed", "Board backup could not be committed")
        })?;
        Ok(BoardBackupRecord {
            backup_id: backup_id.clone(),
            created_at: created_at.clone(),
            board_count,
            item_count,
            asset_count: assets.len() as i64,
            byte_length,
        })
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    result
}

#[tauri::command]
pub(crate) async fn board_backup_create(
    app: AppHandle,
) -> Result<BoardBackupRecord, BoardStoreError> {
    let store_root = super::home_dir().join(".gg/boards");
    run_store(app, move |_, connection| {
        create_backup(connection, &store_root, "manual")
    })
    .await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BoardBackupPreview {
    preview_token: String,
    board_count: i64,
    item_count: i64,
    asset_count: i64,
    created_at: String,
}

fn verify_backup_root(root: &Path) -> Result<BoardBackupPreview, BoardStoreError> {
    let manifest_bytes = std::fs::read(root.join("manifest.json")).map_err(|_| {
        BoardStoreError::new("board_backup_invalid", "Backup manifest is unavailable")
    })?;
    if manifest_bytes.len() > 1_048_576 {
        return Err(BoardStoreError::new(
            "board_backup_invalid",
            "Backup manifest is too large",
        ));
    }
    let manifest: serde_json::Value = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| BoardStoreError::new("board_backup_invalid", "Backup manifest is invalid"))?;
    let asset_manifest = std::fs::read(root.join("assets.sha256")).map_err(|_| {
        BoardStoreError::new(
            "board_backup_invalid",
            "Backup asset manifest is unavailable",
        )
    })?;
    if manifest
        .get("assetManifestSha256")
        .and_then(serde_json::Value::as_str)
        != Some(sha256_hex(&asset_manifest).as_str())
    {
        return Err(BoardStoreError::new(
            "board_backup_invalid",
            "Backup asset manifest checksum does not match",
        ));
    }
    let asset_manifest = std::str::from_utf8(&asset_manifest).map_err(|_| {
        BoardStoreError::new("board_backup_invalid", "Backup asset manifest is invalid")
    })?;
    let mut verified_assets = 0_i64;
    for line in asset_manifest.lines() {
        let mut fields = line.splitn(3, ' ');
        let (Some(expected_hash), Some(expected_length), Some(relative_path)) =
            (fields.next(), fields.next(), fields.next())
        else {
            return Err(BoardStoreError::new(
                "board_backup_invalid",
                "Backup asset manifest is invalid",
            ));
        };
        let expected_length = expected_length.parse::<usize>().map_err(|_| {
            BoardStoreError::new("board_backup_invalid", "Backup asset length is invalid")
        })?;
        let path = root.join("assets").join(relative_path);
        if relative_path.contains("..") || Path::new(relative_path).is_absolute() {
            return Err(BoardStoreError::new(
                "board_backup_invalid",
                "Backup asset path is invalid",
            ));
        }
        let bytes = std::fs::read(path).map_err(|_| {
            BoardStoreError::new("board_backup_invalid", "A backup asset is unavailable")
        })?;
        if bytes.len() != expected_length || sha256_hex(&bytes) != expected_hash {
            return Err(BoardStoreError::new(
                "board_backup_invalid",
                "A backup asset checksum does not match",
            ));
        }
        verified_assets += 1;
    }
    let database_path = root.join("boards.sqlite3");
    let database_bytes = std::fs::read(&database_path).map_err(|_| {
        BoardStoreError::new("board_backup_invalid", "Backup database is unavailable")
    })?;
    if manifest
        .get("databaseSha256")
        .and_then(serde_json::Value::as_str)
        != Some(&sha256_hex(&database_bytes))
    {
        return Err(BoardStoreError::new(
            "board_backup_invalid",
            "Backup database checksum does not match",
        ));
    }
    let connection = Connection::open_with_flags(database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(BoardStoreError::database)?;
    verify_connection(&connection)?;
    let board_count = connection
        .query_row("SELECT COUNT(*) FROM boards", [], |row| row.get(0))
        .map_err(BoardStoreError::database)?;
    let item_count = connection
        .query_row("SELECT COUNT(*) FROM board_items", [], |row| row.get(0))
        .map_err(BoardStoreError::database)?;
    let asset_count = connection
        .query_row(
            "SELECT COUNT(DISTINCT asset_id) FROM item_assets",
            [],
            |row| row.get(0),
        )
        .map_err(BoardStoreError::database)?;
    if manifest
        .get("boardCount")
        .and_then(serde_json::Value::as_i64)
        != Some(board_count)
        || manifest
            .get("itemCount")
            .and_then(serde_json::Value::as_i64)
            != Some(item_count)
        || manifest
            .get("assetCount")
            .and_then(serde_json::Value::as_i64)
            != Some(asset_count)
        || verified_assets != asset_count
    {
        return Err(BoardStoreError::new(
            "board_backup_invalid",
            "Backup counts do not match",
        ));
    }
    let created_at = manifest
        .get("createdAt")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            BoardStoreError::new("board_backup_invalid", "Backup creation time is invalid")
        })?
        .to_string();
    Ok(BoardBackupPreview {
        preview_token: String::new(),
        board_count,
        item_count,
        asset_count,
        created_at,
    })
}

#[tauri::command]
pub(crate) async fn board_backup_choose_and_preview(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    tokens: State<'_, PickerTokenStore>,
) -> Result<Option<BoardBackupPreview>, BoardStoreError> {
    if !board_mode_enabled() {
        return Err(BoardStoreError::new(
            "board_mode_disabled",
            "Board Mode is disabled in this build",
        ));
    }
    let project = project_context(&window, &windows)?;
    let window_label = window.label().to_string();
    let picker_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        picker_app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|_| BoardStoreError::new("board_picker_failed", "Backup picker failed"))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| BoardStoreError::new("board_backup_invalid", "Backup path is invalid"))?;
    let verify_path = path.clone();
    let mut preview =
        tauri::async_runtime::spawn_blocking(move || verify_backup_root(&verify_path))
            .await
            .map_err(|_| {
                BoardStoreError::new("board_backup_invalid", "Backup verification worker failed")
            })??;
    preview.preview_token = tokens.issue(
        PickerTokenKind::BackupRestore,
        &window_label,
        &project.key,
        path,
    )?;
    Ok(Some(preview))
}

#[tauri::command]
pub(crate) async fn board_restore_apply(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, super::Windows>,
    tokens: State<'_, PickerTokenStore>,
    preview_token: String,
) -> Result<BoardBackupRecord, BoardStoreError> {
    let project = project_context(&window, &windows)?;
    let backup_root = tokens.consume(
        &preview_token,
        PickerTokenKind::BackupRestore,
        window.label(),
        &project.key,
    )?;
    let restore_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = restore_app.state::<BoardStoreState>();
        state.restore_from_backup(&super::home_dir().join(".gg/boards"), &backup_root)
    })
    .await
    .map_err(|_| BoardStoreError::new("board_restore_failed", "Restore worker failed"))??;
    let _ = app.emit("board://store-restored", ());
    Ok(result)
}

fn protocol_response(
    status: tauri::http::StatusCode,
    content_type: &'static str,
    body: Vec<u8>,
) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header("Content-Type", content_type)
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'")
        .header("Cache-Control", "private, max-age=31536000, immutable")
        .body(body)
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

pub(crate) fn asset_protocol(
    context: tauri::UriSchemeContext<'_, tauri::Wry>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let app = context.app_handle().clone();
    let window_label = context.webview_label().to_string();
    let method_allowed = request.method() == tauri::http::Method::GET;
    let range_requested = request.headers().contains_key(tauri::http::header::RANGE);
    let uri = request.uri().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let response = (|| -> Result<tauri::http::Response<Vec<u8>>, BoardStoreError> {
            if !method_allowed {
                return Ok(protocol_response(tauri::http::StatusCode::METHOD_NOT_ALLOWED, "text/plain", Vec::new()));
            }
            if range_requested {
                return Ok(protocol_response(tauri::http::StatusCode::RANGE_NOT_SATISFIABLE, "text/plain", Vec::new()));
            }
            let asset_id = uri
                .host()
                .filter(|host| *host != "localhost" && *host != "board-asset.localhost")
                .map(str::to_owned)
                .unwrap_or_else(|| uri.path().trim_matches('/').to_string());
            validate_id(&asset_id)?;
            let windows = app.state::<super::Windows>();
            let project = project_context_for_label(&window_label, &windows)?;
            let state = app.state::<BoardStoreState>();
            let (relative_path, mime_type, byte_length, sha256) = state.with_connection(|connection| {
                connection.query_row(
                    "SELECT DISTINCT a.relative_path, a.mime_type, a.byte_length, a.sha256 FROM assets a JOIN item_assets ia ON ia.asset_id=a.asset_id JOIN board_items i ON i.item_id=ia.item_id JOIN boards b ON b.board_id=i.board_id WHERE a.asset_id=?1 AND b.project_key=?2 AND a.deleted_at IS NULL AND i.deleted_at IS NULL AND b.deleted_at IS NULL",
                    params![asset_id, project.key],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?, row.get::<_, String>(3)?)),
                ).optional().map_err(BoardStoreError::database)?.ok_or_else(|| BoardStoreError::new("board_asset_not_found", "Board asset was not found"))
            })?;
            let assets_root = super::home_dir().join(".gg/boards/assets");
            let path = assets_root.join(&relative_path);
            if !path.starts_with(&assets_root) || byte_length <= 0 || byte_length as u64 > MAX_ASSET_BYTES {
                return Err(BoardStoreError::new("board_asset_invalid", "Board asset record is invalid"));
            }
            let bytes = std::fs::read(&path).map_err(|_| BoardStoreError::new("board_asset_not_found", "Board asset bytes are unavailable"))?;
            if bytes.len() as i64 != byte_length || sha256_hex(&bytes) != sha256 {
                return Err(BoardStoreError::new("board_integrity_failed", "Board asset does not match its record"));
            }
            let content_type = match mime_type.as_str() {
                "image/png" => "image/png",
                "image/jpeg" => "image/jpeg",
                _ => return Err(BoardStoreError::new("board_asset_invalid", "Board asset type is invalid")),
            };
            Ok(protocol_response(tauri::http::StatusCode::OK, content_type, bytes))
        })()
        .unwrap_or_else(|_| protocol_response(tauri::http::StatusCode::NOT_FOUND, "text/plain", Vec::new()));
        responder.respond(response);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temporary_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("orcacoder-board-{name}-{}", uuid::Uuid::new_v4()))
    }

    fn remove_temporary_root(root: &Path) {
        let temp = std::env::temp_dir();
        assert!(root.starts_with(&temp));
        assert!(root
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("orcacoder-board-")));
        std::fs::remove_dir_all(root).unwrap();
    }

    fn mutation_fixture(name: &str) -> (PathBuf, Connection, ProjectContext, BoardStoreState) {
        let root = temporary_root(name);
        let connection = open_store(&root).unwrap();
        connection.execute(
            "INSERT INTO boards(board_id, project_key, project_path, name, background_color, dot_density, toolbar_position, pan_x, pan_y, zoom, revision, created_at, updated_at) VALUES ('board', 'project', 'P', 'Board', '#fff', 1, 'bottom', 0, 0, 1, 0, 'now', 'now')",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO board_leases(board_id, app_instance_id, window_label, lease_epoch, heartbeat_at) VALUES ('board', 'app', 'window', 1, '0')",
            [],
        ).unwrap();
        for (id, x) in [("item-a", 0), ("item-b", 100)] {
            connection.execute(
                "INSERT INTO board_items(item_id, board_id, item_type, x, y, width, height, z_index, rotation, payload_json, revision, created_at, updated_at) VALUES (?1, 'board', 'shape', ?2, 0, 100, 100, 0, 0, '{\"shape\":\"rectangle\"}', 0, 'now', 'now')",
                params![id, x],
            ).unwrap();
        }
        let project = ProjectContext {
            key: String::from("project"),
            path: "P".into(),
        };
        let state = BoardStoreState {
            connection: Mutex::new(None),
            app_instance_id: "app".into(),
        };
        (root, connection, project, state)
    }

    fn update_mutation(item_id: &str, revision: i64, x: f64) -> BoardItemMutation {
        BoardItemMutation::Update {
            item_id: item_id.into(),
            expected_item_revision: revision,
            patch: BoardItemPatch {
                x: Some(x),
                y: None,
                width: None,
                height: None,
                z_index: None,
                rotation: None,
                payload: None,
            },
        }
    }

    #[test]
    fn atomic_item_batch_commits_once_and_rolls_back_on_one_stale_item() {
        let (root, mut connection, project, state) = mutation_fixture("batch-cas");
        let document = apply_item_mutations_transactional(
            &mut connection,
            &project,
            &state,
            "window",
            "board",
            1,
            0,
            vec![
                update_mutation("item-a", 0, 20.0),
                update_mutation("item-b", 0, 120.0),
            ],
        )
        .unwrap();
        assert_eq!(document.board.revision, 1);
        assert_eq!(
            document
                .items
                .iter()
                .map(|item| item.revision)
                .collect::<Vec<_>>(),
            vec![1, 1]
        );

        let error = apply_item_mutations_transactional(
            &mut connection,
            &project,
            &state,
            "window",
            "board",
            1,
            1,
            vec![
                update_mutation("item-a", 1, 40.0),
                update_mutation("item-b", 0, 140.0),
            ],
        )
        .unwrap_err();
        assert_eq!(error.code, "board_write_conflict");
        let x: f64 = connection
            .query_row(
                "SELECT x FROM board_items WHERE item_id='item-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(x, 20.0);
        drop(connection);
        remove_temporary_root(&root);
    }

    #[test]
    fn item_batch_soft_delete_restore_preserves_identity_and_rejects_bad_batches() {
        let (root, mut connection, project, state) = mutation_fixture("batch-restore");
        connection.execute(
            "UPDATE board_items SET item_type='frame', payload_json='{\"title\":\"Frame\",\"childIds\":[\"item-b\"]}' WHERE item_id='item-a'",
            [],
        ).unwrap();
        let deleted = apply_item_mutations_transactional(
            &mut connection,
            &project,
            &state,
            "window",
            "board",
            1,
            0,
            vec![BoardItemMutation::SoftDelete {
                item_id: "item-a".into(),
                expected_item_revision: 0,
            }],
        )
        .unwrap();
        let deleted_item = deleted
            .items
            .iter()
            .find(|item| item.item_id == "item-a")
            .unwrap();
        assert!(deleted_item.deleted_at.is_some());
        assert_eq!(
            deleted_item.payload.get("childIds"),
            Some(&serde_json::json!([]))
        );
        let restored = apply_item_mutations_transactional(
            &mut connection,
            &project,
            &state,
            "window",
            "board",
            1,
            1,
            vec![BoardItemMutation::Restore {
                item_id: "item-a".into(),
                expected_item_revision: 1,
            }],
        )
        .unwrap();
        assert!(restored
            .items
            .iter()
            .find(|item| item.item_id == "item-a")
            .unwrap()
            .deleted_at
            .is_none());

        let duplicate = apply_item_mutations_transactional(
            &mut connection,
            &project,
            &state,
            "window",
            "board",
            1,
            2,
            vec![
                update_mutation("item-a", 2, 1.0),
                update_mutation("item-a", 2, 2.0),
            ],
        )
        .unwrap_err();
        assert_eq!(duplicate.code, "board_input_invalid");
        let wrong_lease = apply_item_mutations_transactional(
            &mut connection,
            &project,
            &state,
            "window",
            "board",
            99,
            2,
            vec![update_mutation("item-a", 2, 1.0)],
        )
        .unwrap_err();
        assert_eq!(wrong_lease.code, "board_write_conflict");
        drop(connection);
        remove_temporary_root(&root);
    }

    #[test]
    fn item_payload_validation_accepts_supported_fields_and_rejects_active_content() {
        assert!(validate_payload(
            "sticky_note",
            &serde_json::json!({"text": "hello", "color": "#f6d365"}),
        )
        .is_ok());
        assert!(validate_payload(
            "image",
            &serde_json::json!({"assetId": "asset-1", "alt": "diagram"}),
        )
        .is_ok());
        assert!(validate_payload(
            "sticky_note",
            &serde_json::json!({"text": "hello", "html": "<script>"}),
        )
        .is_err());
        assert!(validate_payload(
            "shape",
            &serde_json::json!({"shape": "rectangle", "fill": "url(https://example.invalid)"}),
        )
        .is_err());
        assert!(validate_payload("image", &serde_json::json!({"assetId": "../secret"})).is_err());
        assert!(validate_payload(
            "drawing",
            &serde_json::json!({"color": "#f4f4f5", "points": [{"x": 1, "y": 2}]}),
        )
        .is_ok());
        assert!(validate_payload(
            "drawing",
            &serde_json::json!({"points": [{"x": "bad", "y": 2}]}),
        )
        .is_err());
    }

    #[test]
    fn export_validation_accepts_expected_signatures_and_rejects_mismatches() {
        assert_eq!(
            validate_export_bytes("png", b"\x89PNG\r\n\x1a\nbody").unwrap(),
            "png"
        );
        assert_eq!(
            validate_export_bytes("jpg", &[0xff, 0xd8, 0xff, 1]).unwrap(),
            "jpg"
        );
        assert_eq!(
            validate_export_bytes("pdf", b"%PDF-1.4\nbody\n%%EOF\n").unwrap(),
            "pdf"
        );
        assert_eq!(
            validate_export_bytes("csv", b"\"item_id\"\r\n").unwrap(),
            "csv"
        );
        assert!(validate_export_bytes("png", b"not a png").is_err());
        assert!(validate_export_bytes("svg", b"<svg></svg>").is_err());
        assert!(validate_export_bytes("csv", b"value\0hidden").is_err());
    }

    #[test]
    fn fresh_store_applies_schema_and_required_pragmas() {
        let root = temporary_root("fresh");
        let connection = open_store(&root).unwrap();
        let version = current_schema_version(&connection).unwrap();
        let journal: String = connection
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .unwrap();
        let synchronous: i64 = connection
            .pragma_query_value(None, "synchronous", |row| row.get(0))
            .unwrap();
        let foreign_keys: i64 = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);
        assert_eq!(journal.to_ascii_lowercase(), "wal");
        assert_eq!(synchronous, 2);
        assert_eq!(foreign_keys, 1);
        drop(connection);
        remove_temporary_root(&root);
    }

    #[test]
    fn schema_rejects_invalid_board_values_and_orphan_items() {
        let root = temporary_root("constraints");
        let connection = open_store(&root).unwrap();
        let invalid_zoom = connection.execute(
            "INSERT INTO boards VALUES (?1, ?2, ?3, ?4, NULL, ?5, 1, 'top', 0, 0, 99, 0, ?6, ?6, NULL)",
            ("board", "project", "C:\\project", "Board", "#fff", "now"),
        );
        assert!(invalid_zoom.is_err());
        let orphan = connection.execute(
            "INSERT INTO board_items VALUES ('item', 'missing', 'text', 0, 0, 10, 10, 0, 0, '{}', 0, 'now', 'now', NULL)",
            [],
        );
        assert!(orphan.is_err());
        drop(connection);
        remove_temporary_root(&root);
    }

    #[test]
    fn reopening_current_schema_is_idempotent() {
        let root = temporary_root("reopen");
        drop(open_store(&root).unwrap());
        let connection = open_store(&root).unwrap();
        let migrations: i64 = connection
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(migrations, 1);
        drop(connection);
        remove_temporary_root(&root);
    }

    #[test]
    fn failed_migration_rolls_back_every_statement() {
        let mut connection = Connection::open_in_memory().unwrap();
        let result = apply_migration(
            &mut connection,
            99,
            "CREATE TABLE should_rollback(id INTEGER); INVALID SQL;",
        );
        assert!(result.is_err());
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='should_rollback')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!exists);
    }

    #[test]
    fn rejects_relative_store_paths_before_creating_files() {
        let error = open_store(Path::new("relative/boards")).unwrap_err();
        assert_eq!(error.code, "board_store_path_invalid");
        assert!(!PathBuf::from("relative/boards").exists());
    }

    #[test]
    fn project_aliases_resolve_to_one_key() {
        let root = temporary_root("project-key");
        std::fs::create_dir_all(&root).unwrap();
        let direct = normalize_project_path(&root).unwrap();
        let alias = normalize_project_path(&root.join(".")).unwrap();
        assert_eq!(direct.key, alias.key);
        remove_temporary_root(&root);
    }

    #[test]
    fn document_reads_fail_closed_across_projects() {
        let root = temporary_root("project-auth");
        let connection = open_store(&root).unwrap();
        connection.execute(
            "INSERT INTO boards(board_id, project_key, project_path, name, background_color, dot_density, toolbar_position, pan_x, pan_y, zoom, revision, created_at, updated_at) VALUES ('board', 'project-a', 'A', 'Board', '#fff', 1, 'top', 0, 0, 1, 0, 'now', 'now')",
            [],
        ).unwrap();
        let wrong_project = ProjectContext {
            key: "project-b".into(),
            path: "B".into(),
        };
        let error = load_document(&connection, &wrong_project, "board").unwrap_err();
        assert_eq!(error.code, "board_not_found");
        drop(connection);
        remove_temporary_root(&root);
    }

    #[test]
    fn asset_validation_accepts_fixture_and_writes_content_addressed_file() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../docs/board-mode/fixtures/mero-core-v1/fixture-image.png");
        let image = read_validated_image(&fixture).unwrap();
        assert_eq!(image.mime_type, "image/png");
        assert_eq!(image.sha256.len(), 64);
        let root = temporary_root("asset-write");
        let relative = persist_asset_file(&root, &image).unwrap();
        assert_eq!(
            std::fs::read(root.join("assets").join(relative)).unwrap(),
            image.bytes
        );
        remove_temporary_root(&root);
    }

    #[test]
    fn asset_validation_rejects_non_raster_and_oversized_files() {
        let root = temporary_root("asset-reject");
        std::fs::create_dir_all(&root).unwrap();
        let svg = root.join("image.svg");
        std::fs::write(&svg, b"<svg xmlns='http://www.w3.org/2000/svg'></svg>").unwrap();
        assert!(matches!(
            read_validated_image(&svg),
            Err(error) if error.code == "board_asset_invalid"
        ));
        let oversized = root.join("large.png");
        let file = std::fs::File::create(&oversized).unwrap();
        file.set_len(MAX_ASSET_BYTES + 1).unwrap();
        assert!(matches!(
            read_validated_image(&oversized),
            Err(error) if error.code == "board_asset_invalid"
        ));
        remove_temporary_root(&root);
    }

    #[test]
    fn online_backup_restores_into_a_separate_verified_database() {
        let root = temporary_root("backup");
        let connection = open_store(&root).unwrap();
        connection.execute(
            "INSERT INTO boards(board_id, project_key, project_path, name, background_color, dot_density, toolbar_position, pan_x, pan_y, zoom, revision, created_at, updated_at) VALUES ('canary', 'project', 'P', 'Canary', '#fff', 1, 'top', 0, 0, 1, 0, 'now', 'now')",
            [],
        ).unwrap();
        let backup = create_backup(&connection, &root, "test").unwrap();
        let backup_root = root.join("backups").join(&backup.backup_id);
        let restored = Connection::open_with_flags(
            backup_root.join("boards.sqlite3"),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        verify_connection(&restored).unwrap();
        let canaries: i64 = restored
            .query_row(
                "SELECT COUNT(*) FROM boards WHERE board_id='canary'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(canaries, 1);
        assert!(backup_root.join("manifest.json").is_file());
        assert_eq!(verify_backup_root(&backup_root).unwrap().board_count, 1);
        drop(restored);
        drop(connection);
        remove_temporary_root(&root);
    }

    #[cfg(windows)]
    #[test]
    fn live_restore_swaps_verified_store_and_retains_rollback() {
        let root = temporary_root("live-restore");
        let connection = open_store(&root).unwrap();
        connection.execute(
            "INSERT INTO boards(board_id, project_key, project_path, name, background_color, dot_density, toolbar_position, pan_x, pan_y, zoom, revision, created_at, updated_at) VALUES ('canary', 'project', 'P', 'Before', '#fff', 1, 'top', 0, 0, 1, 0, 'now', 'now')",
            [],
        ).unwrap();
        let backup = create_backup(&connection, &root, "test-restore").unwrap();
        let backup_root = root.join("backups").join(&backup.backup_id);
        connection
            .execute("UPDATE boards SET name='After' WHERE board_id='canary'", [])
            .unwrap();
        let state = BoardStoreState {
            connection: Mutex::new(Some(connection)),
            app_instance_id: uuid::Uuid::new_v4().to_string(),
        };
        state.restore_from_backup(&root, &backup_root).unwrap();
        let guard = state.connection.lock().unwrap();
        let name: String = guard
            .as_ref()
            .unwrap()
            .query_row(
                "SELECT name FROM boards WHERE board_id='canary'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name, "Before");
        drop(guard);
        let parent = root.parent().unwrap();
        let rollback_paths: Vec<_> = std::fs::read_dir(parent)
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with(".boards-rollback-"))
            })
            .collect();
        assert!(!rollback_paths.is_empty());
        drop(state);
        remove_temporary_root(&root);
        for path in rollback_paths {
            std::fs::remove_dir_all(path).unwrap();
        }
    }

    #[test]
    fn corrupted_backup_is_rejected_before_restore() {
        let root = temporary_root("corrupt-backup");
        let connection = open_store(&root).unwrap();
        let backup = create_backup(&connection, &root, "test-corruption").unwrap();
        let backup_root = root.join("backups").join(backup.backup_id);
        drop(connection);
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(backup_root.join("boards.sqlite3"))
            .unwrap();
        file.write_all(b"corrupt").unwrap();
        file.sync_all().unwrap();
        assert!(matches!(
            verify_backup_root(&backup_root),
            Err(error) if error.code == "board_backup_invalid"
        ));
        remove_temporary_root(&root);
    }

    #[cfg(windows)]
    #[test]
    fn active_lease_blocks_restore_without_changing_live_data() {
        let root = temporary_root("blocked-restore");
        let connection = open_store(&root).unwrap();
        connection.execute(
            "INSERT INTO boards(board_id, project_key, project_path, name, background_color, dot_density, toolbar_position, pan_x, pan_y, zoom, revision, created_at, updated_at) VALUES ('canary', 'project', 'P', 'Before', '#fff', 1, 'top', 0, 0, 1, 0, 'now', 'now')",
            [],
        ).unwrap();
        let backup = create_backup(&connection, &root, "blocked-restore").unwrap();
        let backup_root = root.join("backups").join(backup.backup_id);
        connection
            .execute(
                "INSERT INTO board_leases VALUES ('canary', 'app', 'main', 1, '0')",
                [],
            )
            .unwrap();
        let state = BoardStoreState {
            connection: Mutex::new(Some(connection)),
            app_instance_id: "app".into(),
        };
        let error = state.restore_from_backup(&root, &backup_root).unwrap_err();
        assert_eq!(error.code, "board_restore_blocked");
        let guard = state.connection.lock().unwrap();
        let count: i64 = guard
            .as_ref()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM boards WHERE board_id='canary'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
        drop(guard);
        drop(state);
        remove_temporary_root(&root);
    }

    #[test]
    fn picker_tokens_are_window_bound_and_single_use() {
        let tokens = PickerTokenStore::default();
        let path = PathBuf::from("C:\\selected\\backup.orcaboard");
        let id = tokens
            .issue(
                PickerTokenKind::BackupRestore,
                "main",
                "project",
                path.clone(),
            )
            .unwrap();
        assert_eq!(
            tokens
                .consume(&id, PickerTokenKind::BackupRestore, "other", "project")
                .unwrap_err()
                .code,
            "board_token_invalid"
        );
        assert_eq!(
            tokens
                .consume(&id, PickerTokenKind::BackupRestore, "main", "project")
                .unwrap(),
            path
        );
        assert_eq!(
            tokens
                .consume(&id, PickerTokenKind::BackupRestore, "main", "project")
                .unwrap_err()
                .code,
            "board_token_invalid"
        );
    }

    #[test]
    fn mutations_require_matching_project_revision_and_fenced_lease() {
        let root = temporary_root("lease-auth");
        let mut connection = open_store(&root).unwrap();
        connection.execute(
            "INSERT INTO boards(board_id, project_key, project_path, name, background_color, dot_density, toolbar_position, pan_x, pan_y, zoom, revision, created_at, updated_at) VALUES ('board', 'project-a', 'A', 'Board', '#fff', 1, 'top', 0, 0, 1, 7, 'now', 'now')",
            [],
        ).unwrap();
        let state = BoardStoreState::default();
        connection
            .execute(
                "INSERT INTO board_leases VALUES ('board', ?1, 'main', 3, '0')",
                [&state.app_instance_id],
            )
            .unwrap();
        let project = ProjectContext {
            key: "project-a".into(),
            path: "A".into(),
        };

        let transaction = connection.transaction().unwrap();
        assert!(authorize_mutation(&transaction, &project, &state, "main", "board", 3, 7).is_ok());
        assert_eq!(
            authorize_mutation(&transaction, &project, &state, "main", "board", 2, 7)
                .unwrap_err()
                .code,
            "board_write_conflict"
        );
        assert_eq!(
            authorize_mutation(&transaction, &project, &state, "main", "board", 3, 6)
                .unwrap_err()
                .code,
            "board_write_conflict"
        );
        let other_project = ProjectContext {
            key: "project-b".into(),
            path: "B".into(),
        };
        assert_eq!(
            authorize_mutation(&transaction, &other_project, &state, "main", "board", 3, 7)
                .unwrap_err()
                .code,
            "board_write_conflict"
        );
        transaction.rollback().unwrap();
        drop(connection);
        remove_temporary_root(&root);
    }
}
