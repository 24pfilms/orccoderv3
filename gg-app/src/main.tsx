import ReactDOM from "react-dom/client";
import { error as logError, attachConsole } from "@tauri-apps/plugin-log";
import { invoke } from "@tauri-apps/api/core";
// Self-hosted Geist Sans + Mono (bundled by Vite → works offline in the
// packaged app). Imported before App so the @font-face rules land ahead of the
// stylesheet that references them.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import { BoardFixtureSurface } from "./board/fixtures/BoardFixtureSurface";
import { ZoomController } from "./ZoomController";
import { WhatsNewWindow } from "./WhatsNewWindow";
// Experimental: webcam gaze → window focus. Disabled for now; re-enable by
// uncommenting this import + the <GazeController /> mount below (and the
// <GazeButton /> in App.tsx). The full implementation lives in src/gaze/.
// import { GazeController } from "./GazeController";
import { applyAll, loadState, subscribeToThemeChanges } from "./orca/orca-theme";
import { tagPlatform } from "./platform";
import { AppUpdateProvider } from "./update";

const isBoardFixture =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("boardFixture") === "mero-core";

// Mirror Rust-side logs into the devtools console, and forward uncaught
// webview errors into the shared log file so failures aren't invisible.
if (!isBoardFixture) {
  void attachConsole();
  window.addEventListener("error", (e) => {
    void logError(`window.error: ${e.message}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    void logError(`unhandledrejection: ${String(e.reason)}`);
  });
}

// Apply platform and appearance state before the first render to prevent a blue
// or opaque flash before the Orca shell mounts. Appearance changes then sync
// live across every open app window through shared localStorage.
tagPlatform();
applyAll(loadState());
subscribeToThemeChanges();

// These handlers used to forward to a crash-reporting service; that service is
// gone and the reporting is removed. They stay because React's own default logs
// every failure identically — this keeps WHICH boundary fired (uncaught vs
// caught vs recoverable) and the component stack, which is the part that
// actually locates the failure in devtools.
function captureReactError(culprit: string, error: unknown, componentStack?: string): void {
  console.error(culprit, error, ...(componentStack ? [{ componentStack }] : []));
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement, {
  onUncaughtError: (error, info) => captureReactError("react.uncaught", error, info.componentStack),
  onCaughtError: (error, info) => captureReactError("react.caught", error, info.componentStack),
  onRecoverableError: (error, info) =>
    captureReactError("react.recoverable", error, info.componentStack),
});

// The dedicated, screen-centered "What's new" window reuses this same entry with
// a `?whatsnew=1` flag (see Rust `open_whatsnew_window`). Render ONLY the notes
// for that window — no agent, no sidecar, no app shell.
const search = new URLSearchParams(window.location.search);
if (isBoardFixture) {
  document.documentElement.classList.add("board-fixture-page");
  root.render(<BoardFixtureSurface />);
} else if (search.get("whatsnew") === "1") {
  // Mark the root so the stylesheet can make html/body transparent — the native
  // window is transparent (see Rust `open_whatsnew_window`) so the rounded card's
  // corners show through instead of sitting on a hard rectangular window edge.
  document.documentElement.classList.add("whatsnew-root");
  root.render(<WhatsNewWindow />);
} else {
  // Load the Tauri-only application graph after browser fixture routes have
  // branched, so fixture evidence never initializes native window APIs.
  void import("./App").then(({ default: App }) => {
    // No StrictMode: its intentional double-invocation of effects and state
    // updaters double-registers the single Tauri `agent-event` listener and was
    // amplifying state-updater impurity. A desktop webview gains nothing from it.
    root.render(
      <AppUpdateProvider>
        <App />
        <ZoomController />
        {/* <GazeController /> */}
      </AppUpdateProvider>,
    );
    // Tell Rust this window has painted its first frame. Restore creates windows
    // one at a time and waits on this before building the next, so two never
    // initialise at once (the concurrency that left some webviews black). Two
    // rAFs ensure the browser has actually presented a frame, not just committed
    // the render. Best-effort: Rust also has a timeout fallback.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void invoke("window_painted").catch(() => {});
      }),
    );
  });
}
