import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CheckCircle2, Download, Settings } from "lucide-react";
import { AsciiLogo } from "./AsciiLogo";
import { HomeBackdrop } from "./HomeBackdrop";
import { SettingsModal } from "./SettingsModal";
import { TelegramSettingsModal } from "./TelegramSettingsModal";
import { McpModal } from "./McpModal";
import { SoundButton } from "./SoundButton";
import { UpdatePage } from "./UpdatePage";
import { waitForReady, getSettings, authStatus, getServeStatus, setRemoteActive } from "./agent";
import { useAppUpdate } from "./update";
import { toast } from "./toast";

interface Props {
  onProjects: () => void;
  onChat: () => void;
  onLogin: () => void;
  /**
   * Bumped when something OUTSIDE this screen changed serve/auth state (the
   * macOS tray toggling Remote, or its Settings modal saving a projects
   * folder). A counter, not a boolean, so repeats always re-fire.
   */
  refreshSignal?: number;
}

/**
 * App entry screen: the Scarlet OrcaCoder hero over the primary actions.
 * Code and Chat require a configured workspace folder and connected AI provider.
 */
export function HomeScreen({
  onProjects,
  onChat,
  onLogin,
  refreshSignal = 0,
}: Props): React.ReactElement {
  const [folderSet, setFolderSet] = useState(false);
  const [providerCount, setProviderCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showTelegram, setShowTelegram] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const appUpdate = useAppUpdate();
  const [updatePageOpen, setUpdatePageOpen] = useState(false);

  async function refresh(): Promise<void> {
    // Settings + auth are read NATIVELY (Rust) — do them first, WITHOUT waiting on
    // the sidecar, so the workspace gate never stays dimmed just because the
    // agent is slow/crashed.
    const [settings, providers] = await Promise.all([getSettings(), authStatus()]);
    // Prefer the explicit `configured` flag; fall back to a non-empty root so an
    // older sidecar (one that predates the flag) degrades to "set" instead of
    // dimming forever.
    setFolderSet(settings?.configured ?? Boolean(settings?.projectsRoot));
    setProviderCount(providers.filter((p) => p.connected).length);
    // Serve status lives in the sidecar (the Telegram bot runs there). Best-effort
    // — gate it on readiness but never let it block the native reads above.
    void waitForReady()
      .then(() => getServeStatus())
      .then((serve) => {
        // Serving is neither started nor shown here any more — the Remote Pod
        // button became Chat Pod and the status chip is gone. The tray still
        // owns the toggle, so keep its label in step with the real state.
        void setRemoteActive(serve.running);
      })
      .catch(() => {});
  }

  useEffect(() => {
    void refresh().catch(() => {});
    // Re-check when the window regains focus so a folder/provider set elsewhere
    // (or after a sidecar respawn) reflects without an app restart.
    const onFocus = (): void => void refresh().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Skips the initial 0 so mounting doesn't double-refresh.
  useEffect(() => {
    if (refreshSignal > 0) void refresh().catch(() => {});
  }, [refreshSignal]);

  useEffect(() => {
    if (
      ["available", "installing", "relaunching", "updated", "install-error"].includes(
        appUpdate.phase,
      )
    ) {
      setUpdatePageOpen(true);
    }
  }, [appUpdate.phase]);

  const ready = folderSet && providerCount > 0;

  function handleWorkspace(open: () => void): void {
    if (ready) {
      open();
      return;
    }
    // Guide the user to the missing prerequisite(s).
    if (!folderSet) {
      toast("Set a workspace folder first. Open Settings.", "warning");
    }
    if (providerCount === 0) {
      toast("Connect an AI provider first.", "warning");
    }
  }

  const updateControl =
    appUpdate.phase === "updated" ||
    (appUpdate.configured &&
      [
        "idle",
        "checking",
        "check-error",
        "available",
        "installing",
        "relaunching",
        "install-error",
      ].includes(appUpdate.phase)) ? (
      <button
        className={`home-update${appUpdate.phase === "installing" ? " home-update-progress" : ""}`}
        disabled={
          appUpdate.phase === "checking" ||
          appUpdate.phase === "installing" ||
          appUpdate.phase === "relaunching"
        }
        aria-live="polite"
        aria-label={
          appUpdate.phase === "updated"
            ? "Dismiss update confirmation"
            : appUpdate.phase === "install-error"
              ? "Retry update installation"
              : appUpdate.phase === "check-error"
                ? "Retry update check"
                : undefined
        }
        title={
          appUpdate.error ??
          (appUpdate.phase === "updated"
            ? "Dismiss"
            : appUpdate.phase === "idle" || appUpdate.phase === "checking"
              ? "Check for OrcaCoder updates"
              : `Install OrcaCoder ${appUpdate.version ?? "update"}`)
        }
        onClick={() => {
          if (
            appUpdate.phase === "available" ||
            appUpdate.phase === "install-error" ||
            appUpdate.phase === "updated"
          ) {
            setUpdatePageOpen(true);
            return;
          }
          if (appUpdate.phase === "idle" || appUpdate.phase === "check-error") {
            return void appUpdate.check();
          }
        }}
      >
        {appUpdate.phase === "installing" && (
          <span className="home-update-fill" style={{ width: `${appUpdate.progress ?? 0}%` }} />
        )}
        {appUpdate.phase === "updated" ? (
          <CheckCircle2 size={14} strokeWidth={2.25} aria-hidden="true" />
        ) : (
          <Download size={14} strokeWidth={2.25} aria-hidden="true" />
        )}
        <span>
          {appUpdate.phase === "updated"
            ? "OrcaCoder just updated!"
            : appUpdate.phase === "check-error"
              ? "Try update check again"
              : appUpdate.phase === "idle"
                ? "Check for updates"
                : appUpdate.phase === "checking"
                  ? "Checking…"
                  : appUpdate.phase === "install-error"
                    ? "Retry install"
                    : appUpdate.phase === "relaunching"
                      ? "Restarting…"
                      : appUpdate.phase === "installing"
                        ? `Installing… ${appUpdate.progress ?? 0}%`
                        : "Install update"}
        </span>
      </button>
    ) : null;

  return (
    <div className={`home${updatePageOpen ? " home-update-page-open" : ""}`} data-tauri-drag-region>
      <HomeBackdrop />
      {updatePageOpen ? (
        <UpdatePage update={appUpdate} onClose={() => setUpdatePageOpen(false)} />
      ) : (
        <div className="scarlet-deck">
          <AsciiLogo folderSet={folderSet} providerCount={providerCount} action={updateControl} />
          <aside className="home-actions scarlet-controls" aria-label="Mission controls">
            <div className="scarlet-panel-head">
              <div>Mission Controls</div>
              <span aria-hidden="true" />
            </div>

            <div className="scarlet-control-buttons">
              <button
                className={`btn btn-primary btn-lg home-btn scarlet-primary${ready ? "" : " is-dimmed"}`}
                aria-disabled={!ready}
                onClick={() => handleWorkspace(onProjects)}
              >
                Enter Pod Dock
              </button>
              {/* Chat sits directly under the dock because they are the two ways
                  in: one to work on a project, one to just talk. It replaced the
                  Remote Pod button, and the icon that used to carry it \u2014 an
                  unlabelled icon in the utility bar was a poor home for one of
                  the two main entrances. */}
              <button
                className="btn btn-ghost btn-lg home-btn scarlet-secondary"
                title="Open Orca Chat"
                onClick={() => handleWorkspace(onChat)}
              >
                Chat Pod
              </button>
              <button className="btn btn-ghost btn-lg home-btn scarlet-secondary" onClick={onLogin}>
                Connect AI Providers
              </button>
              <button
                className="btn btn-ghost btn-lg home-btn scarlet-secondary"
                title="Manage MCP servers"
                onClick={() => setShowMcp(true)}
              >
                MCP Channels
              </button>
            </div>

            <div className="scarlet-iconbar" aria-label="Landing utilities">
              <SoundButton />
              <button
                className="btn btn-ghost btn-icon home-settings"
                title="Settings"
                onClick={() => setShowSettings(true)}
              >
                <Settings size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="scarlet-footer" aria-label="Made by SquareCircleLabs.com">
        Made with{" "}
        <span className="scarlet-heart" aria-hidden="true">
          ♥
        </span>{" "}
        by{" "}
        <a
          href="https://squarecirclelabs.com"
          onClick={(event) => {
            event.preventDefault();
            void openUrl("https://squarecirclelabs.com");
          }}
        >
          SquareCircleLabs.com
        </a>
      </div>
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setFolderSet(true);
            toast("Project folder saved.", "success");
          }}
        />
      )}
      {/* Nothing opens this any more: its only trigger was the Remote Pod
          button, which Chat Pod replaced. Left mounted, and re-reading status on
          save, so restoring an entry point is a one-line change rather than a
          rebuild. */}
      {showTelegram && (
        <TelegramSettingsModal
          onClose={() => setShowTelegram(false)}
          onSaved={() => void refresh().catch(() => {})}
        />
      )}
      {showMcp && <McpModal onClose={() => setShowMcp(false)} />}
    </div>
  );
}
