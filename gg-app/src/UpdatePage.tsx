import { Check, Download, RefreshCw, X } from "lucide-react";
import orcaLogo from "./assets/orca-scarlet.png";
import type { UpdateInfo } from "./update";

interface Props {
  update: UpdateInfo;
  onClose: () => void;
}

export function UpdatePage({ update, onClose }: Props): React.ReactElement {
  const busy = update.phase === "installing" || update.phase === "relaunching";
  const version = update.version ? `OrcaCoder ${update.version}` : "the latest OrcaCoder";

  const copy =
    update.phase === "updated"
      ? { title: "OrcaCoder is ready", body: `${version} installed successfully.` }
      : update.phase === "install-error"
        ? {
            title: "The update needs another try",
            body: "Nothing was damaged. Review the details below, then retry when you are ready.",
          }
        : update.phase === "relaunching"
          ? {
              title: "Restarting OrcaCoder",
              body: "Your workspace is saved. OrcaCoder will reopen automatically.",
            }
          : update.phase === "installing"
            ? {
                title: `Installing ${version}`,
                body: "Keep OrcaCoder open while the signed update is installed.",
              }
            : { title: `${version} is ready`, body: null };

  async function handlePrimary(): Promise<void> {
    if (update.phase === "updated") {
      await update.dismissUpdated();
      onClose();
      return;
    }
    await update.install();
  }

  return (
    <main className="scarlet-update-page" aria-labelledby="update-page-title">
      {!busy && (
        <button className="scarlet-update-close" onClick={onClose} aria-label="Close update page">
          <X size={20} aria-hidden="true" />
        </button>
      )}

      <div className="scarlet-update-orca" aria-hidden="true">
        <img src={orcaLogo} alt="" />
      </div>
      <h1 id="update-page-title">{copy.title}</h1>
      {copy.body && <p className="scarlet-update-copy">{copy.body}</p>}

      {update.phase === "available" && update.notes && (
        <section className="scarlet-update-notes" aria-labelledby="update-notes-title" tabIndex={0}>
          <h2 id="update-notes-title">Release notes</h2>
          <p>{update.notes}</p>
        </section>
      )}

      {update.phase === "installing" && (
        <div className="scarlet-update-progress" aria-label={`Installing ${update.progress ?? 0}%`}>
          <span style={{ transform: `scaleX(${(update.progress ?? 0) / 100})` }} />
          <strong>{update.progress ?? 0}%</strong>
        </div>
      )}

      {update.phase === "install-error" && update.error && (
        <div className="scarlet-update-error" role="alert">
          <strong>Details</strong>
          <span>{update.error}</span>
        </div>
      )}

      {!busy && (
        <div className="scarlet-update-actions">
          <button className="scarlet-update-primary" onClick={() => void handlePrimary()}>
            {update.phase === "updated" ? (
              <Check size={18} aria-hidden="true" />
            ) : update.phase === "install-error" ? (
              <RefreshCw size={18} aria-hidden="true" />
            ) : (
              <Download size={18} aria-hidden="true" />
            )}
            {update.phase === "updated"
              ? "Return to OrcaCoder"
              : update.phase === "install-error"
                ? "Retry update"
                : "Install and restart"}
          </button>
          {update.phase !== "updated" && (
            <button className="scarlet-update-later" onClick={onClose}>
              Not now
            </button>
          )}
        </div>
      )}
    </main>
  );
}
