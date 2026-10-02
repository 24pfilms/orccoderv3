# Phase 1 Board shell evidence

Date: 2026-08-24

## Scope

- Board Mode remained production-off unless `VITE_BOARD_MODE_ENABLED=true`.
- The shared workspace header received an accessible Board/Workspace control only for a hydrated project.
- Workspace hooks and content remain mounted under a feature-enabled `WorkspaceSurface`; Board activation makes that region `hidden`, `inert`, and `aria-hidden`.
- Board render failures request an immediate return to Workspace without stopping the agent session.
- App-level zoom shortcuts are disabled on the Board surface; window navigation and `Ctrl/Cmd+Shift+B` surface switching remain available.
- File drag/drop handlers are detached while Board is active.

## Automated checks

- Targeted Board/feature/error/zoom tests: 13 passed.
- Full frontend suite at the Step 11 checkpoint: 367 passed.
- `pnpm --filter gg-app check`: passed.
- Targeted ESLint over changed frontend files: passed. The repository `pnpm --filter gg-app lint` wrapper remains unusable in this Windows shell because its single-quoted glob is passed literally; no lint rule was bypassed.
- `git diff --check`: passed.
- A component characterization toggled Workspace visibility 100 times and observed one mount, zero unmounts, and retained Workspace DOM/state.

## Isolated Windows runtime toggle drill

Home: `L:\BoardModeMigrationSafety\2026-08-24-phase0\orcacoder-step12-home`

The home contained copied test-only workspace metadata and newly created AppData known-folder roots. It did not point at live OrcaCoder or Mero data. No `boards` directory or board store was created.

WebView2 151 ran the feature-enabled development shell against the isolated home. After one warm-up Board/Workspace cycle and a five-second settle, Playwright drove 100 native surface switches and returned to Workspace.

| Measurement | Before | After | Delta |
|---|---:|---:|---:|
| JS heap used after forced GC | 16,623,368 B | 16,381,876 B | -241,492 B |
| Documents | 1 | 1 | 0 |
| DOM nodes | 206 | 205 | -1 |
| JS event listeners | 249 | 231 | -18 |

- 100-toggle duration: 6,701.84 ms.
- Retained growth stayed below the frozen 10 MiB limit.
- The native log contained one `window session starting` and one `window session ready`, both generation 1; no reconnect, replacement session, or second daemon was created during toggling.
- The final atomic workspace snapshot omitted `surface`, confirming the backward-compatible Workspace default.
- The isolated Tauri/Vite process and remote-debugging listener were stopped after evidence capture.

## Flush and blocker contract

`BoardFlushCoordinator` fails closed when dirty work has no handler or a save throws. It retains dirty state when edits arrive during an in-flight save, so surface changes, project changes, and window close cannot discard newer work. Board dirty state is also reported to the existing native updater coordinator; updater snapshot/relaunch remains blocked until a confirmed flush clears it.

Four focused tests cover missing handlers, failed writes, concurrent edits during save, and confirmed saves. Targeted tests, TypeScript, ESLint, and diff checks passed after this contract was wired into `App.tsx`.

## Preserved behavior

Agent subscriptions, transcript/tool/prompt state, input state, and modal components all remain outside the switched Board subtree or inside the never-unmounted Workspace subtree. The always-mounted `McpElicitModal` remains available over either surface, and Board header status reports active/completed/attention/ready state with a direct return to Workspace.
