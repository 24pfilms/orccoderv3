// Entry point for the bundled Node sidecar.
//
// It exists to set the subagent worker entry BEFORE any provider or agent code
// loads, then hand off to the real sidecar. A bootstrap failure is fatal and has
// no UI to surface it, so it goes to stderr with the `GG_APP_FATAL` marker the
// Rust side watches for.
//
// (Formerly error-mom-sidecar.mjs: it also initialised a crash reporter, whose
// backend no longer exists. The reporting is gone; the bootstrap is the point.)

// Subagent workers launch this same entry so each child process is configured
// identically before loading any provider or agent code.
process.env.GG_SUBAGENT_WORKER_ENTRY ??= process.argv[1];

try {
  await import("../../packages/ggcoder/dist/app-sidecar.js");
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`GG_APP_FATAL ${message}\n`);
  process.exitCode = 1;
}
