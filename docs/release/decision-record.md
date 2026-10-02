# OrcaCoder desktop release decision record

**Approved:** 23 August 2026

**Owner:** 24pfilms

**Authority:** approved updater implementation plan

These decisions are load-bearing. Changing one requires a threat-model, workflow, and test update.

| Decision | Approved value |
| --- | --- |
| Source visibility | Private `24pfilms/orccoderv3` |
| Binary host | Public `24pfilms/orcacoder-releases` |
| First platform | Windows 10/11 x64 only |
| Windows installer | NSIS, current-user install, passive updater |
| Windows publisher signing | Azure Artifact Signing with GitHub OIDC; required before public rollout |
| App process model | One process preserving all project windows |
| Stable identity | `OrcaCoder` / `com.orcacoder.desktop` |
| Bootstrap versions | `0.54.0` followed by `0.54.1` |
| Automatic update cadence | Delayed startup check, then no more than once per 24 hours with jitter |
| Production approval | Second-person approval when available; documented solo break-glass otherwise |
| macOS/Linux | Deferred; not part of the first release contract |
| Telemetry | None |

## Boundaries

- Production updater configuration stays disabled until the final evidence bundle receives a separate go/no-go approval.
- Production publication is separately gated; this approval does not authorize publishing `desktop-v0.54.0`.
- Test and production updater keys, endpoints, bundle identifiers, and storage paths must be unrelated.
- Production Tauri and Authenticode credentials must not enter the source tree, candidate-build jobs, caches, or publication jobs.
- A released version is immutable and is never republished; recovery uses a higher patch version.
- External repository and ruleset configuration must remain under the `24pfilms` GitHub account.

## External operations approved for implementation setup

The owner approved non-production setup under `24pfilms`, including creation/configuration of `24pfilms/orcacoder-releases`, release environments, rulesets, and immutable releases. Credential creation, billing-bearing signing enrollment, production key activation, tag creation, and stable publication remain explicit owner-controlled gates.
