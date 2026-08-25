import { useEffect, useRef, useState } from "react";

interface BoardPromptDialogProps {
  title: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  /** Shown under the field: validation feedback or in-flight status. */
  hint?: string | null;
  busy?: boolean;
  multiline?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * Small modal used by the board for the two things that need free text before an item can
 * exist: a YouTube URL and an image-generation prompt. Deliberately not a native prompt()
 * — a Tauri webview blocks those.
 */
export function BoardPromptDialog({
  title,
  label,
  placeholder,
  confirmLabel,
  hint,
  busy = false,
  multiline = false,
  onSubmit,
  onCancel,
}: BoardPromptDialogProps): React.ReactElement {
  const [value, setValue] = useState("");
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed && !busy) onSubmit(trimmed);
  };

  return (
    <div className="board-prompt-backdrop" onPointerDown={() => !busy && onCancel()}>
      <div
        className="board-prompt"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <label>
          <span>{label}</span>
          {multiline ? (
            <textarea
              ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
              rows={3}
              value={value}
              placeholder={placeholder}
              disabled={busy}
              onChange={(event) => setValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
              }}
            />
          ) : (
            <input
              ref={fieldRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={value}
              placeholder={placeholder}
              disabled={busy}
              onChange={(event) => setValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
          )}
        </label>
        {hint ? <p className="board-prompt-hint">{hint}</p> : null}
        <footer>
          <button type="button" className="modal-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn board-prompt-confirm"
            disabled={busy || value.trim().length === 0}
            onClick={submit}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
