use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_updater::{Update, UpdaterExt};

const UPDATE_EVENT: &str = "app-update-state";
const CHECK_INTERVAL_SECONDS: u64 = 24 * 60 * 60;
const STARTUP_DELAY_SECONDS: u64 = 10;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateSnapshot {
    phase: &'static str,
    version: Option<String>,
    notes: Option<String>,
    progress: Option<u8>,
    error: Option<String>,
    blockers: Vec<String>,
    configured: bool,
}

impl Default for UpdateSnapshot {
    fn default() -> Self {
        Self {
            phase: "disabled",
            version: None,
            notes: None,
            progress: None,
            error: None,
            blockers: Vec::new(),
            configured: false,
        }
    }
}

#[derive(Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedUpdateState {
    last_check_unix: Option<u64>,
    pending_version: Option<String>,
}

#[derive(Default)]
pub(crate) struct UpdateCoordinator {
    snapshot: Mutex<UpdateSnapshot>,
    pending: Mutex<Option<Update>>,
    readiness: Mutex<HashMap<String, Vec<String>>>,
    checking: AtomicBool,
    installing: AtomicBool,
}

fn state_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("updater-state.json"))
        .map_err(|error| error.to_string())
}

fn read_persisted(app: &AppHandle) -> PersistedUpdateState {
    state_path(app)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_persisted(app: &AppHandle, state: &PersistedUpdateState) -> Result<(), String> {
    let path = state_path(app)?;
    let mut bytes = serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    super::atomic_replace(&path, &bytes)
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn emit(app: &AppHandle, coordinator: &UpdateCoordinator) -> UpdateSnapshot {
    let snapshot = coordinator.snapshot.lock().unwrap().clone();
    let _ = app.emit(UPDATE_EVENT, &snapshot);
    snapshot
}

fn set_snapshot(
    app: &AppHandle,
    coordinator: &UpdateCoordinator,
    mutate: impl FnOnce(&mut UpdateSnapshot),
) -> UpdateSnapshot {
    {
        let mut snapshot = coordinator.snapshot.lock().unwrap();
        mutate(&mut snapshot);
    }
    emit(app, coordinator)
}

fn approved_artifact_parts(identifier: &str, scheme: &str, host: Option<&str>, path: &str) -> bool {
    if scheme != "https" || host != Some("github.com") {
        return false;
    }
    let repository = match identifier {
        "com.orcacoder.desktop.updater-test" => "orcacoder-test-releases",
        "com.orcacoder.desktop" => "orcacoder-releases",
        _ => return false,
    };
    path.starts_with(&format!("/24pfilms/{repository}/releases/download/"))
}

fn allowed_artifact(app: &AppHandle, update: &Update) -> bool {
    approved_artifact_parts(
        app.config().identifier.as_str(),
        update.download_url.scheme(),
        update.download_url.host_str(),
        update.download_url.path(),
    )
}

fn current_blockers(app: &AppHandle, coordinator: &UpdateCoordinator) -> Vec<String> {
    let readiness = coordinator.readiness.lock().unwrap();
    let mut blockers = Vec::new();
    for label in app.webview_windows().keys() {
        if label == "whatsnew" {
            continue;
        }
        match readiness.get(label) {
            Some(window_blockers) => blockers.extend(window_blockers.iter().cloned()),
            None => blockers.push(format!("{label} is still preparing")),
        }
    }
    blockers.sort();
    blockers.dedup();
    blockers
}

fn record_check(app: &AppHandle) -> Result<(), String> {
    let mut persisted = read_persisted(app);
    persisted.last_check_unix = Some(unix_now());
    write_persisted(app, &persisted)
}

fn record_pending(app: &AppHandle, version: Option<String>) -> Result<(), String> {
    let mut persisted = read_persisted(app);
    persisted.pending_version = version;
    write_persisted(app, &persisted)
}

fn check_due(app: &AppHandle) -> bool {
    read_persisted(app)
        .last_check_unix
        .map(|last| unix_now().saturating_sub(last) >= CHECK_INTERVAL_SECONDS)
        .unwrap_or(true)
}

async fn check_inner(
    app: &AppHandle,
    coordinator: &UpdateCoordinator,
    manual: bool,
) -> Result<UpdateSnapshot, String> {
    if !manual && !check_due(app) {
        log::info!("updater stage=check-skipped reason=interval");
        return Ok(coordinator.snapshot.lock().unwrap().clone());
    }
    if coordinator
        .checking
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        log::info!("updater stage=check-skipped reason=already-checking");
        return Ok(coordinator.snapshot.lock().unwrap().clone());
    }
    log::info!(
        "updater stage=check-started mode={}",
        if manual { "manual" } else { "automatic" }
    );
    set_snapshot(app, coordinator, |snapshot| {
        snapshot.phase = "checking";
        snapshot.error = None;
    });

    let result = async {
        let updater = app.updater().map_err(|error| {
            log::error!("updater stage=configuration-failed error={error}");
            error.to_string()
        })?;
        let update = updater.check().await.map_err(|error| {
            log::error!("updater stage=check-request-failed error={error}");
            error.to_string()
        })?;
        record_check(app).map_err(|error| {
            log::error!("updater stage=check-state-write-failed error={error}");
            error
        })?;
        match update {
            Some(update) if allowed_artifact(app, &update) => {
                let version = update.version.clone();
                let notes = update.body.clone();
                log::info!("updater stage=update-available version={version}");
                *coordinator.pending.lock().unwrap() = Some(update);
                Ok(set_snapshot(app, coordinator, |snapshot| {
                    snapshot.phase = "available";
                    snapshot.version = Some(version);
                    snapshot.notes = notes;
                    snapshot.progress = None;
                    snapshot.error = None;
                }))
            }
            Some(_) => {
                log::error!("updater stage=check-failed reason=unapproved-artifact-host");
                Err("update artifact host is not approved".to_string())
            }
            None => {
                log::info!("updater stage=check-complete result=up-to-date");
                *coordinator.pending.lock().unwrap() = None;
                Ok(set_snapshot(app, coordinator, |snapshot| {
                    snapshot.phase = "idle";
                    snapshot.version = None;
                    snapshot.notes = None;
                    snapshot.progress = None;
                    snapshot.error = None;
                }))
            }
        }
    }
    .await;

    coordinator.checking.store(false, Ordering::SeqCst);
    if let Err(error) = &result {
        log::error!("updater stage=check-failed error={error}");
        set_snapshot(app, coordinator, |snapshot| {
            snapshot.phase = "check-error";
            snapshot.error = Some(error.clone());
            snapshot.progress = None;
        });
    }
    result
}

pub(crate) fn initialise(app: &AppHandle) {
    let coordinator = app.state::<UpdateCoordinator>();
    let configured = app.updater().is_ok();
    let persisted = read_persisted(app);
    let current_version = app.package_info().version.to_string();
    let updated = persisted.pending_version.as_deref() == Some(current_version.as_str());
    log::info!(
        "updater stage=initialised configured={configured} version={current_version} post_update={updated}"
    );
    set_snapshot(app, coordinator.inner(), |snapshot| {
        snapshot.configured = configured;
        snapshot.phase = if updated {
            "updated"
        } else if configured {
            "idle"
        } else {
            "disabled"
        };
        snapshot.version = updated.then_some(current_version);
    });

    if configured {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let jitter = unix_now() % 30;
            tokio::time::sleep(Duration::from_secs(STARTUP_DELAY_SECONDS + jitter)).await;
            let coordinator = app.state::<UpdateCoordinator>();
            let _ = check_inner(&app, coordinator.inner(), false).await;
        });
    }
}

#[tauri::command]
pub(crate) fn update_state(state: State<'_, UpdateCoordinator>) -> UpdateSnapshot {
    state.snapshot.lock().unwrap().clone()
}

#[tauri::command]
pub(crate) async fn update_check(
    app: AppHandle,
    state: State<'_, UpdateCoordinator>,
) -> Result<UpdateSnapshot, String> {
    check_inner(&app, state.inner(), true).await
}

#[tauri::command]
pub(crate) fn update_set_window_readiness(
    window: WebviewWindow,
    blockers: Vec<String>,
    state: State<'_, UpdateCoordinator>,
) -> Result<(), String> {
    if blockers.len() > 10
        || blockers
            .iter()
            .any(|blocker| blocker.len() > 120 || blocker.contains(['\r', '\n']))
    {
        return Err("invalid update readiness report".to_string());
    }
    state
        .readiness
        .lock()
        .unwrap()
        .insert(window.label().to_string(), blockers);
    Ok(())
}

#[tauri::command]
pub(crate) fn update_dismiss_updated(
    app: AppHandle,
    state: State<'_, UpdateCoordinator>,
) -> Result<UpdateSnapshot, String> {
    record_pending(&app, None)?;
    Ok(set_snapshot(&app, state.inner(), |snapshot| {
        snapshot.phase = "idle";
        snapshot.version = None;
        snapshot.notes = None;
        snapshot.error = None;
    }))
}

#[tauri::command]
pub(crate) async fn update_install(
    app: AppHandle,
    state: State<'_, UpdateCoordinator>,
) -> Result<(), String> {
    if state
        .installing
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        log::info!("updater stage=install-skipped reason=already-installing");
        return Ok(());
    }

    log::info!("updater stage=install-requested");
    let result = async {
        let blockers = current_blockers(&app, state.inner());
        if !blockers.is_empty() {
            log::warn!(
                "updater stage=install-blocked active_blockers={}",
                blockers.len()
            );
            set_snapshot(&app, state.inner(), |snapshot| {
                snapshot.phase = "available";
                snapshot.blockers = blockers.clone();
                snapshot.error =
                    Some("Finish active work before installing the update.".to_string());
            });
            return Err("update blocked by active work".to_string());
        }

        let update = state
            .pending
            .lock()
            .unwrap()
            .clone()
            .ok_or("no update is ready to install")?;
        let version = update.version.clone();
        log::info!("updater stage=download-started version={version}");
        set_snapshot(&app, state.inner(), |snapshot| {
            snapshot.phase = "installing";
            snapshot.progress = Some(0);
            snapshot.blockers.clear();
            snapshot.error = None;
        });

        let mut downloaded = 0_u64;
        let bytes = update
            .download(
                |chunk, total| {
                    downloaded = downloaded.saturating_add(chunk as u64);
                    let progress = total
                        .filter(|total| *total > 0)
                        .map(|total| ((downloaded.saturating_mul(99) / total).min(99)) as u8);
                    set_snapshot(&app, state.inner(), |snapshot| snapshot.progress = progress);
                },
                || {
                    set_snapshot(&app, state.inner(), |snapshot| {
                        snapshot.progress = Some(100)
                    });
                },
            )
            .await
            .map_err(|error| {
                log::error!("updater stage=download-failed version={version} error={error}");
                error.to_string()
            })?;
        log::info!("updater stage=download-complete version={version} bytes={downloaded}");

        let blockers = current_blockers(&app, state.inner());
        if !blockers.is_empty() {
            log::warn!(
                "updater stage=install-blocked-after-download active_blockers={}",
                blockers.len()
            );
            return Err("active work started while the update downloaded".to_string());
        }
        log::info!("updater stage=workspace-snapshot-started");
        super::refresh_live_sessions_async(&app).await;
        super::snapshot_workspace(&app).map_err(|error| {
            log::error!("updater stage=workspace-snapshot-failed error={error}");
            error
        })?;
        record_pending(&app, Some(version.clone())).map_err(|error| {
            log::error!("updater stage=pending-state-write-failed error={error}");
            error
        })?;
        log::info!("updater stage=workspace-snapshot-complete version={version}");

        let child = app.state::<super::Daemon>().child.lock().unwrap().take();
        if let Some(child) = child {
            log::info!("updater stage=sidecar-stop-started");
            super::terminate_child(child);
            log::info!("updater stage=sidecar-stop-complete");
        }
        set_snapshot(&app, state.inner(), |snapshot| {
            snapshot.phase = "relaunching";
            snapshot.progress = Some(100);
        });
        log::info!("updater stage=installer-launch version={version}");
        update.install(bytes).map_err(|error| {
            log::error!("updater stage=installer-launch-failed version={version} error={error}");
            error.to_string()
        })?;
        log::info!("updater stage=installer-launched version={version}");
        Ok(())
    }
    .await;

    if let Err(error) = &result {
        log::error!("updater stage=install-failed error={error}");
        let _ = record_pending(&app, None);
        if app.state::<super::Daemon>().child.lock().unwrap().is_none() {
            super::spawn_daemon(app.clone(), false);
        }
        set_snapshot(&app, state.inner(), |snapshot| {
            snapshot.phase = "install-error";
            snapshot.error = Some(error.clone());
            snapshot.progress = None;
        });
    }
    state.installing.store(false, Ordering::SeqCst);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_https_and_wrong_release_repository() {
        assert!(approved_artifact_parts(
            "com.orcacoder.desktop.updater-test",
            "https",
            Some("github.com"),
            "/24pfilms/orcacoder-test-releases/releases/download/test-v1/app.exe",
        ));
        assert!(!approved_artifact_parts(
            "com.orcacoder.desktop.updater-test",
            "https",
            Some("github.com"),
            "/24pfilms/orcacoder-releases/releases/download/v1/app.exe",
        ));
        assert!(!approved_artifact_parts(
            "com.orcacoder.desktop",
            "http",
            Some("github.com"),
            "/24pfilms/orcacoder-releases/releases/download/v1/app.exe",
        ));
        assert!(!approved_artifact_parts(
            "com.orcacoder.desktop",
            "https",
            Some("example.com"),
            "/24pfilms/orcacoder-releases/releases/download/v1/app.exe",
        ));
    }
}
