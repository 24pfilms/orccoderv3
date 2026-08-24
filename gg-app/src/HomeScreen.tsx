import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CheckCircle2, Download, MessageCircle, Settings } from "lucide-react";
import { AsciiLogo } from "./AsciiLogo";
import { HomeBackdrop } from "./HomeBackdrop";
import { SettingsModal } from "./SettingsModal";
import { TelegramSettingsModal } from "./TelegramSettingsModal";
import { McpModal } from "./McpModal";
import { SoundButton } from "./SoundButton";
import { UpdatePage } from "./UpdatePage";
import {
  waitForReady,
  getSettings,
  authStatus,
  getServeStatus,
  startServe,
  stopServe,
  setRemoteActive,
} from "./agent";
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
  const [serving, setServing] = useState(false);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [serveBusy, setServeBusy] = useState(false);
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
        setServing(serve.running);
        setTelegramConfigured(serve.configured);
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

  async function handleServe(): Promise<void> {
    if (serveBusy) return;
    if (providerCount === 0) {
      toast("Connect an AI provider first.", "warning");
      return;
    }
    if (!telegramConfigured) {
      toast("Set up Telegram first.", "warning");
      setShowTelegram(true);
      return;
    }
    setServeBusy(true);
    try {
      if (serving) {
        await stopServe();
        setServing(false);
        // Keep the macOS tray's Remote label in step with this button.
        void setRemoteActive(false);
        toast("Stopped serving.", "success");
      } else {
        await startServe();
        setServing(true);
        void setRemoteActive(true);
        toast("Serving on Telegram — message your bot.", "success");
      }
    } catch (e) {
      toast(`Serve failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setServeBusy(false);
    }
  }

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
          <AsciiLogo
            folderSet={folderSet}
            providerCount={providerCount}
            serving={serving}
            action={updateControl}
          />
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
              <button
                className={`btn btn-ghost btn-lg home-btn scarlet-secondary${serving ? " home-serve-active" : ""}`}
                disabled={serveBusy}
                onClick={() => void handleServe()}
              >
                {serveBusy ? "Working\u2026" : serving ? "\u25CF Remote Pod" : "Remote Pod"}
              </button>
            </div>

            <div className="scarlet-iconbar" aria-label="Landing utilities">
              <SoundButton />
              <button
                className="btn btn-ghost btn-icon home-settings"
                title="Open Orca Chat"
                onClick={() => handleWorkspace(onChat)}
              >
                <MessageCircle size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
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
      {showTelegram && (
        <TelegramSettingsModal
          onClose={() => setShowTelegram(false)}
          onSaved={() => setTelegramConfigured(true)}
        />
      )}
      {showMcp && <McpModal onClose={() => setShowMcp(false)} />}
    </div>
  );
}
