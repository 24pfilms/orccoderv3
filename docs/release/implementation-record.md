# OrcaCoder desktop release implementation record

## Contract verification — 23 August 2026

Re-check these contracts and pins immediately before a production candidate. Documentation and mutable upstream tags can change without a repository diff.

### Tauri v2 updater

Verified against the official Tauri v2 updater documentation and installed `tauri-plugin-updater` 2.10.1 source:

- Update signatures are mandatory and cannot be disabled.
- `bundle.createUpdaterArtifacts: true` creates Tauri v2 updater artifacts; `v1Compatible` is not used.
- The updater public key is embedded key content, not a path.
- Production endpoints require HTTPS.
- Windows emits both NSIS and MSI updater signatures when both bundles are built; OrcaCoder will build only NSIS and use `updaterJsonPreferNsis` if `tauri-action` is ever reintroduced.
- The default comparator accepts only a strictly newer SemVer release.
- Rust `Update::download()` verifies the Tauri signature before returning bytes; `Update::install()` exits the Windows app after successfully launching the installer.
- The coordinator must allowlist the manifest and artifact hosts before invoking the updater sink.

Sources:

- <https://v2.tauri.app/plugin/updater/>
- <https://v2.tauri.app/reference/config/#updaterconfig>
- Installed source: `tauri-plugin-updater` 2.10.1, `src/updater.rs`
- <https://v2.tauri.app/distribute/sign/windows/>

### GitHub release integrity and controls

Verified against current GitHub documentation:

- Immutable releases lock their tag and assets after publication and automatically create a release attestation binding the tag, commit SHA, and release assets.
- The safe publication sequence is draft → attach every asset → publish once.
- Deleted immutable release tag names cannot be reused.
- `gh release verify TAG` verifies immutability/attestation; `gh release verify-asset TAG FILE` verifies a downloaded asset.
- Rulesets can protect `orca-main` and `desktop-v*` refs.
- Environment jobs receive secrets only after protection rules pass. Private repositories require an eligible GitHub plan; required-reviewer availability must be verified in repository settings.

Sources:

- <https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases>
- <https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes>
- <https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity>
- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository>
- <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments>
- <https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions>

### Azure Artifact Signing

Verified against Microsoft Learn updated 3 August 2026 and the official Action source:

- Artifact Signing supports SignTool, GitHub Actions, and OIDC workload identity.
- The signing identity needs only the `Artifact Signing Certificate Profile Signer` role on the selected profile.
- The official Action supports `windows-2025` and `windows-2022`, not Windows Arm.
- GitHub OIDC requires the workflow permission named `id-token` to be set to `write`; no long-lived Azure client secret is required.
- Signing enrollment, identity validation, account/profile names, endpoint, tenant, client, and subscription IDs remain owner/provider setup and are not stored in source.
- Required signing and timestamp verification must happen before signed artifacts leave the protected job.

Sources:

- <https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations>
- <https://github.com/Azure/artifact-signing-action>

### Reviewed Action pins

Every external Action is pinned to the full commit below. The comment beside each workflow use retains its human-readable release line.

| Action | Reviewed ref | Commit |
| --- | --- | --- |
| `actions/checkout` | v7 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7 | `820762786026740c76f36085b0efc47a31fe5020` |
| `pnpm/action-setup` | v6 | `0977fd99725f1db4007ccb2928dbb4e90d06cc86` |
| `dtolnay/rust-toolchain` | stable snapshot | `4360b52568e2003a75bf9bc1d59f33a8e3fc893c` |
| `Swatinem/rust-cache` | v2 | `6323deb102c322ba6fcbdcafc7e3dddab59af2b6` |
| `actions/upload-artifact` | v6 | `b7c566a772e6b6bfb58ed0dc250532a479d7789f` |
| `actions/download-artifact` | v7 | `37930b1c2abaa49bbe596cd826c3c89aef350131` |
| `azure/login` | v3 | `f5d393ae46f8fde4be8b75f32e3fc50e654ad0ca` |
| `Azure/artifact-signing-action` | v2 | `c7ab2a863ab5f9a846ddb8265964877ef296ee82` |
| `actions/attest-build-provenance` | v3 | `977bb373ede98d70efdf65b84cb5f73e068dcc2a` |
| `tauri-apps/tauri-action` | v1, recorded but not selected | `1deb371b0cd8bd54025b384f1cd735e725c4060f` |

### Tool and runner baseline

- Node.js `24.15.0`
- pnpm `10.28.2`
- Rust `1.97.1` (`8bab26f4f`, 14 July 2026)
- Cargo `1.97.1`
- GitHub CLI `2.83.2`
- Microsoft SBOM Tool `4.1.5` (SPDX 2.2)
- Minisign `0.12`; Linux archive SHA-256 `9a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88d9822957e73`
- Candidate/signing runner: `windows-2025`
- General CI runners: `ubuntu-24.04`, `macos-15`, `windows-2025`

Exact hosted-runner images are externally maintained even when labels are versioned. Candidate evidence must capture the resolved runner image/version from each run.

## Repository trust-boundary setup — 23 August 2026

Configured through the GitHub API and read back after mutation:

- Public artifact repository: `24pfilms/orcacoder-releases`.
- Immutable releases: enabled.
- Artifact tag ruleset: active for `desktop-v*`; deletion and non-fast-forward updates are denied.
- Default GitHub Actions token permission: read-only in both repositories; Actions cannot approve pull requests.
- Private source branch: `orca-main`. CI push and pull-request triggers target this branch.
- `orca-main` protection: pull requests required, six strict cross-platform CI contexts required, administrators included, linear history required, force-push/deletion denied, and review conversations resolved.
- Source environments: `desktop-signing` and `desktop-publication`; only `orca-main` can deploy and administrators cannot bypass.
- Only `24pfilms` currently collaborates on the source repository. The approved solo break-glass model therefore uses an explicit manual promotion confirmation tied to SHA/version/digests instead of pretending a second-person review occurred.

A cross-repository publication credential is intentionally absent. Before a protected publication run, the owner must configure a short-lived GitHub App/OIDC credential limited to `contents: write` on `24pfilms/orcacoder-releases`, or the documented fallback fine-grained token limited to that repository with an expiry/rotation date. Workflows fail closed when it is absent.