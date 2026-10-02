CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  applied_at TEXT NOT NULL CHECK (length(applied_at) > 0)
) STRICT;

CREATE TABLE boards (
  board_id TEXT PRIMARY KEY CHECK (length(board_id) BETWEEN 1 AND 128),
  project_key TEXT NOT NULL CHECK (length(project_key) BETWEEN 1 AND 32768),
  project_path TEXT NOT NULL CHECK (length(project_path) BETWEEN 1 AND 32768),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR length(description) <= 4000),
  background_color TEXT NOT NULL CHECK (length(background_color) BETWEEN 1 AND 32),
  dot_density REAL NOT NULL CHECK (dot_density = dot_density AND dot_density BETWEEN 0 AND 100),
  toolbar_position TEXT NOT NULL CHECK (toolbar_position IN ('top', 'bottom', 'left', 'right')),
  pan_x REAL NOT NULL CHECK (pan_x = pan_x AND abs(pan_x) <= 1000000000),
  pan_y REAL NOT NULL CHECK (pan_y = pan_y AND abs(pan_y) <= 1000000000),
  zoom REAL NOT NULL CHECK (zoom = zoom AND zoom BETWEEN 0.05 AND 8),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  deleted_at TEXT CHECK (deleted_at IS NULL OR length(deleted_at) > 0)
) STRICT;

CREATE TABLE board_items (
  item_id TEXT PRIMARY KEY CHECK (length(item_id) BETWEEN 1 AND 128),
  board_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('sticky_note', 'text', 'shape', 'frame', 'arrow', 'image', 'drawing')),
  x REAL NOT NULL CHECK (x = x AND abs(x) <= 1000000000),
  y REAL NOT NULL CHECK (y = y AND abs(y) <= 1000000000),
  width REAL NOT NULL CHECK (width = width AND width > 0 AND width <= 100000),
  height REAL NOT NULL CHECK (height = height AND height > 0 AND height <= 100000),
  z_index INTEGER NOT NULL CHECK (z_index BETWEEN -1000000 AND 1000000),
  rotation REAL NOT NULL CHECK (rotation = rotation AND abs(rotation) <= 360000),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(CAST(payload_json AS BLOB)) <= 1048576),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  deleted_at TEXT CHECK (deleted_at IS NULL OR length(deleted_at) > 0),
  FOREIGN KEY(board_id) REFERENCES boards(board_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE assets (
  asset_id TEXT PRIMARY KEY CHECK (length(asset_id) BETWEEN 1 AND 128),
  sha256 TEXT UNIQUE NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  relative_path TEXT UNIQUE NOT NULL CHECK (
    length(relative_path) BETWEEN 1 AND 255
    AND relative_path NOT LIKE '/%'
    AND relative_path NOT LIKE '\\%'
    AND relative_path NOT LIKE '%..%'
    AND relative_path NOT LIKE '%:%'
  ),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg')),
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 52428800),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  deleted_at TEXT CHECK (deleted_at IS NULL OR length(deleted_at) > 0)
) STRICT;

CREATE TABLE item_assets (
  item_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('image', 'drawing')),
  PRIMARY KEY(item_id, asset_id, role),
  FOREIGN KEY(item_id) REFERENCES board_items(item_id) ON DELETE RESTRICT,
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE import_runs (
  import_id TEXT PRIMARY KEY CHECK (length(import_id) BETWEEN 1 AND 128),
  source_type TEXT NOT NULL CHECK (source_type IN ('orcaboard', 'mero_sqlite', 'mero_browser')),
  source_fingerprint TEXT UNIQUE NOT NULL CHECK (length(source_fingerprint) = 64 AND source_fingerprint NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK (status IN ('previewed', 'staging', 'complete', 'failed')),
  checkpoint_json TEXT NOT NULL CHECK (json_valid(checkpoint_json) AND length(CAST(checkpoint_json AS BLOB)) <= 1048576),
  source_counts_json TEXT NOT NULL CHECK (json_valid(source_counts_json) AND length(CAST(source_counts_json AS BLOB)) <= 65536),
  imported_counts_json TEXT NOT NULL CHECK (json_valid(imported_counts_json) AND length(CAST(imported_counts_json AS BLOB)) <= 65536),
  error_text TEXT CHECK (error_text IS NULL OR length(error_text) <= 4000),
  started_at TEXT NOT NULL CHECK (length(started_at) > 0),
  completed_at TEXT CHECK (completed_at IS NULL OR length(completed_at) > 0)
) STRICT;

CREATE TABLE board_leases (
  board_id TEXT PRIMARY KEY,
  app_instance_id TEXT NOT NULL CHECK (length(app_instance_id) BETWEEN 1 AND 128),
  window_label TEXT NOT NULL CHECK (length(window_label) BETWEEN 1 AND 128),
  lease_epoch INTEGER NOT NULL CHECK (lease_epoch > 0),
  heartbeat_at TEXT NOT NULL CHECK (length(heartbeat_at) > 0),
  FOREIGN KEY(board_id) REFERENCES boards(board_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX boards_active_project_updated
  ON boards(project_key, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX board_items_active_board_z
  ON board_items(board_id, z_index, item_id)
  WHERE deleted_at IS NULL;
CREATE INDEX board_items_board_deleted
  ON board_items(board_id, deleted_at);
CREATE INDEX item_assets_asset
  ON item_assets(asset_id);

INSERT INTO schema_migrations(version, applied_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
