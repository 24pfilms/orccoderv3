# OrcaCoderV3 Product Context

## Product

- **Name:** OrcaCoderV3
- **Display name:** OrcaCoder
- **Purpose:** A personal AI creative-development workstation built from the MIT-licensed GG Framework.
- **Core promise:** Keep GG Coder's proven coding workflow while adding Orca-native branding, voice, media inspection, and creative-tool integrations.

## Users

- Primary user: Taylor and collaborators working across code, AI media, ComfyUI, Houdini, and Orca projects.
- Context: A Windows desktop workstation with multiple technical and creative projects open concurrently.
- Primary jobs: inspect a repository, plan changes, edit files, run commands, verify results, and later control those workflows by voice.

## Current Scope

1. Preserve the upstream GG Framework behavior and Git history.
2. Rebrand the desktop application as OrcaCoder without globally renaming upstream internal symbols.
3. Apply the canonical Orca Theme Kit with orange as the default accent direction.
4. Replace application artwork, bundle identity, visible product copy, and update ownership.
5. Keep changes modular so upstream updates remain mergeable.

## Future Scope

- OrcaVoice voice interaction.
- Image and video inspection.
- ComfyUI and Houdini workflows.
- Orca project knowledge and creative-technical automation.

## Technical Context

- Monorepo: pnpm workspaces.
- Desktop: Tauri 2, React 19, Vite, TypeScript, Rust.
- Agent engine: existing `@kenkaiiii/*` workspace packages retained initially for compatibility.
- Target platform: Windows first; macOS remains upstream-compatible where practical.

## Product Constraints

- Preserve the upstream MIT license and copyright notice.
- Do not imply affiliation with or endorsement by Ken Kai.
- Keep legacy storage/session compatibility until a tested migration exists.
- Do not use upstream signing keys or release endpoints for Orca builds.
- Do not rename internal `ggcoder` protocol/session identifiers merely for appearance.

## Success Criteria

- Clean TypeScript and Rust builds.
- Windows executable and installer use OrcaCoder names and Orca artwork.
- Visible desktop UI no longer presents the product as GG Coder.
- Orca appearance controls persist safely and default to orange.
- Upstream remains configured as a read-only source remote.
