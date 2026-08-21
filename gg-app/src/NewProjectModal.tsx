import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { theme } from "./theme";
import { Modal } from "./Modal";
import { createProject, selectProject } from "./agent";

interface Props {
  /** Existing directory prefilled into the editable Location field. */
  projectsRoot: string;
  onClose: () => void;
  /** Called after the project is created + this window re-pointed at it. */
  onCreated: (cwd: string) => void;
}

/** Normalize freeform input toward a valid folder name (lowercase, dashes). */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function NewProjectModal({ projectsRoot, onClose, onCreated }: Props): React.ReactElement {
  const [name, setName] = useState("");
  const [location, setLocation] = useState(projectsRoot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugify(name);
  const destination = location.trim();
  const canCreate = slug.length > 0 && destination.length > 0 && !busy;

  async function browse(): Promise<void> {
    setError(null);
    try {
      const picked = await open({
        directory: true,
        title: "Choose where to create the project",
        defaultPath: destination || undefined,
      });
      if (typeof picked === "string") setLocation(picked);
    } catch (browseError) {
      setError(browseError instanceof Error ? browseError.message : String(browseError));
    }
  }

  async function create(): Promise<void> {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const cwd = await createProject(slug, destination);
      await selectProject(cwd);
      onCreated(cwd);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
      setBusy(false);
    }
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <input
        className="modal-input"
        style={{ color: theme.text, background: theme.inputBackground }}
        value={name}
        aria-label="Project name"
        placeholder="my-project"
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void create();
        }}
      />
      <div className="modal-row">
        <input
          className="modal-input"
          style={{ color: theme.text, background: theme.inputBackground }}
          value={location}
          aria-label="Project location"
          placeholder="C:\\Users\\you\\projects"
          spellCheck={false}
          onChange={(event) => setLocation(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
          }}
        />
        <button className="modal-btn" title="Browse for a folder" onClick={() => void browse()}>
          <FolderOpen size={16} strokeWidth={1.8} aria-hidden="true" />
          Browse
        </button>
      </div>
      <div className="modal-hint" style={{ color: theme.textDim }}>
        Creates{" "}
        <span style={{ color: theme.textMuted }}>
          {destination || "\u2026"}\\{slug || "\u2026"}
        </span>
      </div>
      {error && (
        <div className="modal-error" style={{ color: theme.error }}>
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button className="modal-btn" onClick={onClose}>
          Cancel
        </button>
        <button className="modal-btn primary" disabled={!canCreate} onClick={() => void create()}>
          {busy ? "Creating\u2026" : "Create"}
        </button>
      </div>
    </Modal>
  );
}
