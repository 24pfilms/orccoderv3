# OrcaCoder V3 — Signed Auto-Update and Release Pipeline Plan

**Prepared for:** Claude / implementation agent  
**Project:** `L:\orcacoderv3`  
**Primary branch:** `orca-main`  
**GitHub origin:** `https://github.com/24pfilms/orccoderv3.git`  
**Upstream:** `https://github.com/KenKaiii/gg-framework.git`  
**Prepared:** 2026-08-23  
**Status:** Plan only. Do not publish, tag, create/rotate production keys, alter GitHub secrets, or enable production updates without Taylor's explicit stage-specific approval.

---

## 1. Mission

Implement a secure, reproducible, Orca-owned desktop release and auto-update pipeline for OrcaCoder V3 by adapting the proven GG Coder/Tauri v2 architecture already inherited by the fork.

Target flow:

```text
Approved Orca release commit on orca-main
  → version validation + tests + packaged smoke checks
  → protected production approval
  → Windows x64 and macOS ARM64 builds
  → OS signing/notarization where configured
  → Tauri artifact signing with Orca's private key
  → published Orca-owned GitHub Release
  → latest.json + signed platform artifacts
  → installed clients check on launch and hourly
  → user approves Update
  → download → verify → install → relaunch → What's New
```

This is primarily release engineering, configuration, signing, validation, testing, and operational hardening. The client updater UI and install flow largely already exist.

---

## 2. Non-negotiable safety rules

Claude must obey all of these:

1. Never point an Orca build at GG Coder's endpoint.
2. Never reuse GG Coder's updater public key. Ken's corresponding private key is unavailable and must not be copied or sought.
3. Never commit or display a private updater key, password, Apple credential, certificate, GitHub token, or Windows signing credential.
4. Never print secrets in terminal output, patches, chat, CI logs, tests, screenshots, or documentation.
5. Do not push tags, publish releases, alter GitHub secrets/environments, or enable production polling without explicit approval for that exact action.
6. Preserve all current uncommitted work in `L:\orcacoderv3`. Inspect `git status` first and do not touch unrelated UI/system-prompt changes.
7. Never use `reset --hard`, `clean -fd`, force-push, destructive rebases, release deletion, or tag deletion.
8. Keep production updating disabled until an isolated end-to-end test rollout passes.
9. Fail closed: wrong branch, version mismatch, missing credential, empty key/endpoint, malformed manifest, unsigned artifact, or failed test must prevent publication.
10. Create and verify an encrypted offline backup of the final production updater private key before shipping the first updater-enabled public installer.
11. Treat the first updater-enabled installer as a permanent trust-root event. An incorrect embedded endpoint/public key can force manual reinstalls.
12. Use separate test and production keys/endpoints. Test workflows must have no access to production credentials.
13. Do not expose the updater to pull-request code with production secrets.
14. No irreversible operation may be hidden inside a broad script. Show Taylor the exact command and effect first.

---

## 3. Verified GG Coder design

GG Coder uses **Tauri v2's signed static-JSON updater**, hosted entirely on public GitHub Releases. No separate GG update server or public beta channel was found.

### Release side

Upstream `.github/workflows/release.yml` runs on a `v*` tag, checks that it is SemVer-shaped and belongs to `main`, validates protected credentials, builds Windows x64 and macOS Apple Silicon, signs updater packages, signs/notarizes macOS, publishes a non-draft/non-prerelease GitHub Release, and generates `latest.json` through `tauri-apps/tauri-action@v1` with `uploadUpdaterJson: true`.

Upstream endpoint:

```text
https://github.com/KenKaiii/gg-framework/releases/latest/download/latest.json
```

The manifest contains a version, notes, publication date, platform identifiers, asset URLs, and inline Tauri signatures.

### Client side

Upstream `gg-app/src/update.ts`:

- invokes Tauri `check()` when the updater hook mounts;
- polls once per hour;
- quietly tolerates offline/endpoint failures;
- exposes the available version;
- invokes `update.downloadAndInstall(...)` after user approval;
- reports download progress;
- invokes `relaunch()` after installation.

Update controls appear in the application banner/footer, home screen, and tray. `WhatsNewModal.tsx` handles post-version-change UX.

### Signing layers

- **Tauri updater signing:** mandatory artifact-integrity verification on all platforms. CI holds `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; clients embed the corresponding public key.
- **macOS Developer ID signing/notarization:** Apple publisher and Gatekeeper trust.
- **Windows Authenticode:** Windows publisher trust and reputation. This was not found in GG's workflow. Tauri signing does not replace Authenticode.

### Sources

- <https://github.com/KenKaiii/gg-framework>
- <https://github.com/KenKaiii/gg-framework/releases>
- <https://github.com/KenKaiii/gg-framework/releases/latest/download/latest.json>
- <https://v2.tauri.app/plugin/updater/>
- <https://v2.tauri.app/distribute/pipelines/github/>
- <https://github.com/tauri-apps/tauri-action>

---

## 4. Current OrcaCoder state

The inherited updater is wired but intentionally disabled, which is the correct safe state.

### Runtime kill switch

`gg-app/src/update.ts` contains:

```ts
const UPDATES_CONFIGURED = false;
```

### Tauri configuration

`gg-app/src-tauri/tauri.conf.json` currently has the Orca product identity plus:

```json
"createUpdaterArtifacts": false
```

and:

```json
"updater": {
  "pubkey": "",
  "endpoints": [],
  "windows": { "installMode": "passive" }
}
```

### Existing code to preserve

- `gg-app/src/update.ts` — check/install/progress/relaunch hook
- `gg-app/src/App.tsx` — banner, tray state, tray update command
- `gg-app/src/HomeScreen.tsx` — home update button/progress
- `gg-app/src/WhatsNewModal.tsx` — post-upgrade UX
- `gg-app/src-tauri/src/lib.rs` — updater/process plugins and tray command
- `gg-app/src-tauri/capabilities/default.json` — updater/process permissions
- `gg-app/src-tauri/Cargo.toml` — updater/process dependencies
- `gg-app/package.json` — JavaScript updater dependency and build scripts
- `gg-app/scripts/bump-version.mjs` — synchronized version bump
- `.github/workflows/release.yml` — inherited build/sign/publish workflow

### Known gaps and conflicts

1. Workflow checks ancestry against `origin/main`, but Orca uses `orca-main`.
2. Tauri artifact generation is disabled while the workflow assumes updater artifacts and `latest.json`.
3. No Orca updater public key is embedded.
4. No Orca endpoint is configured.
5. Runtime checks remain disabled.
6. Release automation still contains GG wording.
7. Tag shape is checked, but tag version is not proven equal to the desktop version.
8. A broad `v*` namespace can let unrelated package releases become GitHub's “latest.” Upstream history demonstrates this risk.
9. Tag push publishes immediately; there is no explicit candidate-to-production promotion flow.
10. No Windows Authenticode integration was found.
11. Documentation disagrees with workflow behavior in places (draft versus published; Linux references versus Windows/macOS matrix).
12. The inherited release workflow has not yet been adapted to the Orca-owned repository and trust root.

---

## 5. Decisions requiring Taylor's approval

Claude must ask and record these before production configuration.

1. **Canonical repository:** confirm `https://github.com/24pfilms/orccoderv3`. Decide whether the two-c spelling in `orccoderv3` is permanent before embedding the endpoint.
2. **Visible product name:** `OrcaCoder`, `OrcaCoder V3`, or another exact name.
3. **Permanent app identifier:** confirm `com.orcacoder.desktop` before first public install.
4. **First-release platforms:** recommended Windows x64 first; macOS ARM64 after Apple credentials; defer Intel Mac/Linux unless required.
5. **Channels:** recommended isolated test channel plus public stable only; add public beta later if needed.
6. **Update UX:** recommended check on launch/hourly, notify in current UI, user approves install, relaunch automatically, no forced updates.
7. **Windows signing:** decide signing provider and whether Authenticode is required before public launch. Strongly recommended.
8. **Production approval:** recommended GitHub environment `desktop-production` with Taylor as required reviewer.
9. **Tag namespace:** recommended `desktop-v0.54.0`, not broad `v0.54.0`, unless the repository will never publish independently versioned packages.
10. **Release notes source:** determine whether notes are authored manually, generated from commits/changesets, or both.

---

## 6. Target architecture

If repository identity is confirmed, the stable endpoint will be:

```text
https://github.com/24pfilms/orccoderv3/releases/latest/download/latest.json
```

Do not insert it until repository naming and test strategy are approved.

### Production trust root

```text
Orca production private key
  → protected GitHub environment secret only
  → encrypted, verified offline backup

Orca production public key
  → embedded in tauri.conf.json
  → safe to commit
```

Before key generation, verify exact syntax against the installed Tauri v2 CLI and current official documentation. Start with help, for example:

```bash
pnpm --filter gg-app tauri signer generate --help
```

Generate outside the repository. Do not paste key material into chat.

### Test trust root

Use a different keypair, endpoint, and isolated release destination. A production client must never trust the test key, and the test workflow must never access production secrets.

### Manifest invariants

Production `latest.json` must:

- be valid JSON;
- contain the approved version;
- list only supported platform identifiers;
- reference accessible Orca-owned assets;
- contain non-empty signatures;
- contain no `KenKaiii`, `gg-framework`, or GG asset references;
- correspond to a published stable release;
- be independently fetched and validated after publication.

---

# 7. Phased implementation

Claude must work in small, reviewable phases and stop at each approval gate.

## Phase 0 — Baseline and preservation

1. Read `AGENTS.md`, README, `UPSTREAM.md`, and distribution documentation.
2. Run non-destructive inspection:

```bash
git status --short --branch
git remote -v
git branch -vv
git log -1 --oneline --decorate
git diff -- .github/workflows/release.yml gg-app/src/update.ts gg-app/src-tauri/tauri.conf.json
```

3. Inventory uncommitted files and avoid them.
4. Confirm origin repository and default branch through GitHub metadata if authenticated.
5. Record Node, pnpm, Rust, Tauri CLI/action/plugin versions.
6. Trace all release/updater references and GG strings.
7. Run existing non-destructive relevant tests.
8. Return a baseline report before editing.

**Exit:** no lost work; exact state and pre-existing failures documented; decisions listed.

## Phase 1 — Release/version contract

Adopt the approved desktop tag namespace, preferably:

```text
desktop-v0.54.0
```

The pipeline must prove:

```text
tag version
=
gg-app/package.json version
=
gg-app/src-tauri/tauri.conf.json version
=
gg-app/src-tauri/Cargo.toml package version
```

Include any other authoritative desktop version files discovered.

Tasks:

1. Add a cross-platform Node validation script under `gg-app/scripts/` or root `scripts/`.
2. Parse JSON/TOML structurally where practical.
3. Accept the tag via argument/environment.
4. Normalize only the approved prefix.
5. Reject malformed SemVer, mismatches, stable-channel prereleases, and wrong prefixes.
6. Add tests for valid, mismatched, malformed, and prerelease inputs.
7. Add a package command such as `release:validate`.

**Exit:** unrelated tags and mismatched versions cannot publish.

## Phase 2 — Split candidate verification from production publication

Recommended workflow structure:

```text
.github/workflows/desktop-release-candidate.yml
.github/workflows/desktop-release.yml
```

A reusable workflow with thin candidate/production callers is also acceptable.

### Candidate workflow

Trigger through `workflow_dispatch`. It must:

1. check out an exact commit;
2. install pinned Node/pnpm/Rust tooling;
3. validate versions;
4. run lint/typecheck/tests;
5. build framework packages;
6. stage Node runtime and sidecar;
7. run sidecar smoke tests;
8. build platform bundles with test configuration as needed;
9. run packaged smoke tests;
10. upload artifacts only to the workflow run;
11. never create/update a production release.

### Production workflow

Trigger only from the approved desktop tag and protected environment. It must repeat validation, prove ancestry against `origin/orca-main`, require production credentials, build from source, sign, publish, and verify the live manifest.

**Exit:** artifacts can be tested without becoming visible to production clients; publication needs protected approval.

## Phase 3 — Adapt and harden release automation

Required changes:

1. Replace `main` ancestry checks with `orca-main`, or securely derive and enforce the confirmed canonical branch.
2. Replace broad `v*` trigger with approved desktop tag prefix.
3. Replace GG release names/bodies with Orca wording.
4. Preserve `projectPath: gg-app` if validated.
5. Use `releaseDraft: false` only in final publication.
6. Keep stable releases `prerelease: false`.
7. Generate updater JSON in production.
8. Run version/tag validation before expensive builds.
9. Add concurrency controls to prevent duplicate/racing publication.
10. Keep default `contents: read`; grant `contents: write` only to publication.
11. Pin third-party Actions to reviewed immutable commit SHAs where practical, with readable version comments.
12. Keep explicit timeouts and fail-fast shell behavior.
13. Preserve macOS nested-binary signing before Tauri notarization.
14. Do not silently add Linux/Intel Mac.
15. Add post-publication manifest verification.

Manifest verification must check:

- HTTP success;
- intended version;
- expected platforms;
- non-empty signatures;
- every URL resolves;
- every URL belongs to Orca's approved host;
- no GG/Ken references;
- release is published and stable;
- asset names carry expected product/version;
- expected signature assets exist.

Do not automatically delete a release after a verification failure. Fail loudly, alert, preserve evidence, and follow the incident runbook.

## Phase 4 — Keys, signing, and GitHub environment

This requires Taylor's supervision.

### Tauri production key

1. Confirm exact Tauri v2 command and format.
2. Generate a strong password in a password manager.
3. Generate key outside the repository.
4. Separate/save public key.
5. Add private material to protected environment secrets only:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

6. Create encrypted offline backup.
7. Prove backup recovery before shipping.
8. Commit only public key.
9. Record a non-secret public-key fingerprint/checksum.
10. Scan Git status/diff/history/logs for accidental secret material.

### GitHub environment

Create `desktop-production` with:

- Taylor as required reviewer;
- tag/branch restrictions;
- environment-scoped secrets;
- no PR-origin access;
- production job only;
- release URL as deployment URL.

### macOS secrets, if macOS ships

```text
APPLE_CERTIFICATE
APPLE_CERTIFICATE_PASSWORD
APPLE_SIGNING_IDENTITY
KEYCHAIN_PASSWORD
APPLE_ID
APPLE_PASSWORD
APPLE_TEAM_ID
```

Use an app-specific password. Record certificate expiry and establish renewal reminders/runbook.

### Windows Authenticode

Choose a signing service/certificate, sign before publication, and verify signatures in CI. If deferred, explicitly document SmartScreen/publisher implications and do not describe installers as publisher-signed.

**Exit:** private key safely backed up; only public key committed; test signature independently verifies.

## Phase 5 — Produce updater artifacts without production polling

1. Enable `bundle.createUpdaterArtifacts` for release builds.
2. Prefer Tauri config overlays if they safely separate dev/test/production.
3. Add approved public key only at the approved stage.
4. Use test endpoint/key first.
5. Keep production runtime checks disabled.
6. Confirm Windows `installMode` intentionally.
7. Build and inspect signed updater artifacts.
8. Confirm Windows/macOS artifact formats.

Replace the hard-coded Boolean only if the replacement is simpler and safer. A build-time flag may be used, but absent/invalid values must disable updates or fail release builds. Avoid contradictory switches. Define one documented source of truth and tests for dev/test/production behavior.

**Exit:** signed test artifacts exist; ordinary developer builds cannot poll production; customers see nothing.

## Phase 6 — Automated tests

### Updater-hook tests

Mock Tauri updater/process APIs and cover:

1. disabled configuration makes no request;
2. enabled configuration checks on mount;
3. hourly timer rechecks;
4. no update returns idle;
5. available update captures version/object;
6. endpoint/offline failure is non-disruptive;
7. progress reporting is correct;
8. 99% cap remains until completion;
9. success relaunches;
10. failed install enters error without relaunch;
11. checks do not interrupt installation;
12. install without pending update is impossible.

### UI tests

- banner visibility/version;
- home button;
- tray synchronization/action;
- single installation invocation;
- progress state;
- error/retry behavior if supported;
- accessible names/progress semantics;
- What's New after version change.

### Release tests

- valid stable desktop tag;
- mismatched versions;
- malformed/wrong-prefix tag;
- prerelease blocked from stable;
- wrong branch ancestry;
- missing credentials;
- empty key/endpoint in production config;
- GG endpoint/key/reference rejected;
- manifest platform/URL validation.

### Artifact checks

For each advertised platform:

- artifact and signature exist;
- signature validates with embedded public key;
- app reports expected version/name/identifier;
- installer upgrades rather than unexpectedly side-by-side installs;
- settings, history, sessions, and project references survive.

## Phase 7 — Isolated end-to-end rollout

Use test key/channel and disposable test systems or VMs.

### Windows x64

1. Clean install version N.
2. Verify no production contact.
3. Publish test N+1.
4. Detect on launch.
5. Test hourly detection (or test-only shortened timer).
6. Test banner, home, and tray paths separately.
7. Verify download/signature/passive install/relaunch.
8. Confirm What's New once.
9. Confirm settings, API configuration, history, project state, and user data survive.
10. Confirm active agents/processes are safely handled before relaunch.
11. Test offline launch, interrupted download, corrupted package, invalid signature, missing platform entry, permissions, and antivirus interference where practical.

### macOS ARM64

Repeat equivalent tests plus:

- Gatekeeper acceptance;
- Developer ID verification;
- notarization verification;
- upgrade from `/Applications`;
- nested Node/native modules remain valid;
- no quarantine/signature breakage.

### Update-chain matrix

Test:

```text
N → N+1 → N+2
older supported N → N+2
```

Check data/schema migrations. Tauri usually distributes full packages, but Orca's own migrations can still fail.

**Exit:** all advertised platforms pass; invalid signatures fail; no data loss; production remains disabled.

## Phase 8 — Production activation

Only after Taylor explicitly approves.

Checklist:

- [ ] Canonical repository/name/identifier confirmed
- [ ] Production private-key backup recovery tested
- [ ] Production public key embedded
- [ ] Production endpoint embedded
- [ ] Workflow enforces `orca-main`
- [ ] Desktop tag/version equality enforced
- [ ] Protected approval active
- [ ] Windows signing decision complete
- [ ] macOS signing/notarization valid if advertised
- [ ] Test rollout passed everywhere advertised
- [ ] Release notes ready
- [ ] Incident/key-loss runbook ready
- [ ] Taylor approves activation

Recommended first-live sequence:

1. Build initial production installer with final public key/endpoint but no newer production update.
2. Install on controlled machines.
3. Publish the next patch as first real update.
4. Verify live chain.
5. Roll out to a small founding-user cohort.
6. Monitor before broad announcement.

---

## 8. Rollback and incident response

Do not normally “roll back” by publishing a lower SemVer. Ship a fixed higher patch.

### Bad release, updater works

1. Pause announcements.
2. Preserve evidence and diagnose.
3. Build fixed N+1.
4. Sign/publish through normal protected pipeline.
5. Verify manifest/assets.
6. Notify affected users.

### Broken manifest/missing asset

1. Declare incident.
2. Determine what GitHub's latest route serves.
3. Publish corrected higher version normally.
4. Avoid unaudited manual mutation of signed metadata.
5. Verify externally and account for caching.

### Compromised/lost updater private key

Existing clients trust the embedded public key; replacement is not trivial.

- If old key remains controlled, a signed transition release can embed a new public key.
- If an attacker has the old key or it is unusable, prepare a manually downloaded OS-signed replacement installer and direct communication.
- Rotate GitHub secrets, audit actions/releases, and do not claim silent rotation is easy.

### GitHub outage

Core application operation must continue. Checks fail quietly and retry later.

### Certificate expiry

Track Apple and Windows certificate expiry with renewal reminders and test renewed identities before expiry.

---

## 9. Release runbook

Confirm exact package commands before execution.

### Prepare

```bash
git status --short --branch
git fetch origin
# Switch/pull only if the worktree is safe.
git switch orca-main
git pull --ff-only origin orca-main
pnpm install --frozen-lockfile
pnpm --filter gg-app <version-bump-command> 0.54.0
pnpm <release-validation-command>
pnpm test
```

If uncommitted work makes switch/pull unsafe, stop and ask Taylor.

### Review

```bash
git diff --check
git diff -- gg-app/package.json gg-app/src-tauri/tauri.conf.json gg-app/src-tauri/Cargo.toml gg-app/src-tauri/Cargo.lock
```

Run candidate workflow; inspect and test its artifacts. No production tag yet.

### Commit/tag only after approval

```bash
git add <only intended release files>
git commit -m "Release OrcaCoder 0.54.0"
git tag desktop-v0.54.0
```

Before push, show Taylor:

- commit hash and exact tag;
- synchronized versions;
- validation/test summary;
- candidate artifact hashes;
- platforms/signing status;
- release notes;
- rollback plan.

Only after explicit approval:

```bash
git push origin orca-main
git push origin desktop-v0.54.0
```

### Post-publication

1. Confirm every matrix/verification job.
2. Inspect release assets.
3. Fetch `latest.json` independently.
4. Validate version/platforms/URLs/signatures.
5. Perform a real update from the previous production build.
6. Record release URL, run ID, commit, tag, hashes, test result, and signing status.

---

## 10. Acceptance criteria

### Repository/config

- [ ] No GG endpoint/key in Orca production code
- [ ] Canonical Orca endpoint tested
- [ ] Orca public key embedded
- [ ] Private material absent from Git/logs
- [ ] Product name/identifier final
- [ ] Developer builds update-disabled/fail closed

### Pipeline

- [ ] Ancestry enforces `orca-main`
- [ ] Desktop tag namespace enforced
- [ ] Tag and version files must match
- [ ] Candidate cannot publish production
- [ ] Production requires protected approval
- [ ] Missing credentials fail before publication
- [ ] Windows x64 builds
- [ ] macOS ARM64 builds if advertised
- [ ] Signed updater artifacts generated
- [ ] `latest.json` generated and validated
- [ ] No GG names/references in assets/manifests
- [ ] Least-privilege permissions
- [ ] Actions pinned/reviewed

### Client

- [ ] Check on launch and hourly
- [ ] Offline failure non-disruptive
- [ ] Intended UI surfaces work
- [ ] Progress accurate
- [ ] Tampering rejected
- [ ] Install/relaunch successful
- [ ] What's New correct
- [ ] User data survives sequential/skipped upgrades

### Operations

- [ ] Private-key backup recovery tested
- [ ] Release runbook complete
- [ ] Incident/key-compromise runbook complete
- [ ] Certificate reminders established
- [ ] First live update controlled and verified
- [ ] Taylor approves broad rollout

---

## 11. Required Claude deliverables

In order:

1. Baseline report: current state, upstream differences, tests, unresolved decisions.
2. Architecture decision record: repository, branch, tag namespace, channels, endpoint, key ownership, platforms, signing.
3. Small reviewed patches: validator, workflows, config strategy, tests, docs.
4. Security review: secret exposure, permissions, action supply chain, key custody, endpoint trust.
5. Candidate workflow run: artifacts only.
6. End-to-end platform report.
7. Production-readiness checklist with PASS/FAIL/BLOCKED evidence.
8. Approval request listing every irreversible action.
9. Post-release verification record after approved publication.

For each patch Claude must state:

- files changed and why;
- tests and results;
- security implications;
- remaining risks;
- effect, if any, on existing users.

---

## 12. Copy-paste Claude prompts

### Initial baseline prompt

> Work in `L:\orcacoderv3` and follow `L:\tmp\ORCACODER_V3_UPDATE_PIPELINE_CLAUDE_PLAN.md`. Begin with Phase 0 only. Inspect repository instructions, current branch/remotes/status, updater configuration, release workflow, versions, and tests. Do not edit until you return a baseline report and list all decisions requiring Taylor's approval. Preserve every current uncommitted change. Never use GG Coder's endpoint/key. Never create, expose, print, or commit private credentials. Do not push, tag, publish, alter GitHub secrets/environments, or enable production updates without explicit stage-specific approval. Work in small phases, fail closed, test each phase, and report files, diffs, evidence, risks, and the next approval gate.

### Code-only phases prompt

> Proceed only with approved non-secret Phases 1–3: release/version contract, candidate-versus-production workflow structure, and adaptation from `main` to `orca-main`. Do not generate production keys, configure secrets, publish releases, or enable runtime polling. Add tests/documentation, self-review for security and accidental GG references, then stop with a readiness report.

### Key/configuration prompt

> Proceed with Phase 4 only under Taylor's supervision. First show the exact documented Tauri v2 commands and GitHub environment changes without executing them or displaying secrets. After approval, guide Taylor through generating/storing the Orca key outside the repository. Commit only public material. Verify no secret appears in status, diff, history, logs, or generated files. Stop before production activation/publication.

### Test rollout prompt

> Execute the isolated test-channel rollout with a test-only key/endpoint. Do not access production secrets or publish production. Test sequential/skipped upgrades, invalid/tampered signatures, interrupted downloads, relaunch, active-process handling, and user-data preservation. Return evidence by platform and all blockers.

### Final production-preparation prompt

> Prepare but do not push or publish the final production release. Show Taylor the exact commit, tag, synchronized versions, workflow, endpoint, public-key fingerprint, notes, platforms, signing state, tests, hashes, rollback process, and irreversible commands. Wait for explicit approval before production secret/environment changes, updater activation, tag push, and publication.

---

## 13. Governing principle

The updater should be boring, auditable, and hard to misuse. OrcaCoder does not need a custom update server. The durable design is:

```text
Tauri v2 updater
+ Orca-owned signing key
+ Orca-owned GitHub Releases
+ protected GitHub Actions publication
+ strict desktop tag/version validation
+ OS signing
+ isolated test rollout
+ tested recovery procedure
```

Optimize for a trustworthy update chain that can serve OrcaCoder users for years, not merely the fastest first release.
