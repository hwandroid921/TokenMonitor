# Release Version Policy

This local planning document defines the project milestone version and app/exe release version rules for Token Monitor from `0.1.0` to the final `1.0.0` release.

This file is tracked in Git and is used as a shared working reference while planning, implementing, and packaging releases.

README and other user-facing project documents should describe the current final state of the project. Do not list individual task edits, implementation diffs, or change-by-change notes there. Version-level changes are recorded only in release/version sections such as this document's Release History.

## Versioning Goal

- `0.1.0` is the first packaged baseline.
- `1.0.0` is the final complete release target for the initial product scope.
- Versions before `1.0.0` represent staged milestones toward feature completeness, stability, and release polish.

## Version Types

Token Monitor uses two related but separate version concepts.

### Project Milestone Version

The project milestone version describes product progress toward `1.0.0`.

Examples:

```text
0.1  Packaged baseline
0.2  Overlay usability
0.3  Provider quota reliability
0.4  Settings and tray stabilization
1.0  Initial complete release
```

Use this version to reason about roadmap stage and completion level.

### App/Exe Release Version

The app/exe release version is the actual distributable version in `package.json`.

Examples:

```text
0.1.3
0.1.5
0.2.2
```

Electron Builder uses this value in the executable file name:

```text
TokenMonitor-<package.version>-x64.exe
```

Do not treat every planning or documentation update as a new app/exe release.

## App/Exe Version Unit Rules

Use semantic versioning style:

```text
MAJOR.MINOR.PATCH
```

- `MAJOR`: Product-level compatibility or final release boundary.
- `MINOR`: User-visible feature milestone or meaningful workflow change.
- `PATCH`: Bug fix, UI polish, packaging fix, or narrow code adjustment.

Documentation-only or instruction-only changes do not require an app/exe version bump unless the user explicitly asks for a new executable.

Portable executable packaging is performed only for milestone release versions such as `0.3.0`, `0.4.0`, and later `MINOR.0` or `MAJOR.0` release points. Patch releases such as `0.3.1`, `0.3.2`, and `0.3.3` do not produce a portable executable by default unless explicitly requested.

Before `1.0.0`, use minor versions as milestone gates:

```text
0.1.x  Packaged baseline and core provider display
0.2.x  Overlay usability and display refinement
0.3.x  Provider quota reliability improvements
0.4.x  Settings and tray behavior stabilization
0.5.x  Error handling, fallback, and troubleshooting improvements
0.6.x  Packaging workflow and release artifact consistency
0.7.x  UI polish and accessibility pass
0.8.x  Provider data validation and privacy hardening
0.9.x  Release candidate stabilization
1.0.0  Final complete initial release
```

## Current Baseline

Current package version:

```text
0.3.13
```

Baseline `0.1.0` includes:

- Codex quota display
- Claude quota display
- Antigravity quota display through the Gemini CLI OAuth quota path
- Transparent overlay
- System tray behavior
- Portable Windows executable packaging

## Increment Guidance

Use a patch increment when the work is narrow and does not change the product milestone.

Examples:

- Small CSS fixes
- Packaging retry/process safety fixes
- Minor display copy changes
- Bug fixes that do not add a new user-facing feature

Do not increment the app/exe version for documentation-only or instruction-only work unless explicitly requested.

Use a minor increment when the work represents a new milestone.

Examples:

- New provider support
- Major overlay behavior change
- New settings workflow
- New quota source or authentication flow
- Major dashboard layout redesign
- Significant packaging/release workflow change

Reserve `1.0.0` for the final complete initial release after:

- Provider quota display is stable
- Overlay display is reliable
- Settings and tray behavior are stable
- Packaging is repeatable
- README and troubleshooting docs are complete
- Privacy-sensitive data handling has been reviewed

## Required Workflow For Each Task

Before finishing a task:

1. Review the user-requested work.
2. Decide whether the work affects the project milestone version, the app/exe release version, both, or neither.
3. If the app/exe release version should change, update:
   - `package.json`
   - `package-lock.json`
   - any release/output references that include the version string
4. If the change is documentation-only or instruction-only, do not update `package.json` and do not package a new exe unless explicitly requested.
5. Run verification when code or packaging-related behavior changed:

   ```powershell
   npm run typecheck
   npm run build
   ```

6. Package the portable executable only when the app/exe release version is a milestone package version such as `0.3.0`, `0.4.0`, or another `MINOR.0` / `MAJOR.0` release point, unless the user explicitly requests packaging for another version:

   ```powershell
   $env:CSC_IDENTITY_AUTO_DISCOVERY='false'
   npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false
   ```

7. Verify the generated executable and SHA256 hash when packaging is performed.

## Release Notes Checklist

For each release-worthy version bump, summarize:

- Version
- Date
- Change category: `PATCH`, `MINOR`, or `MAJOR`
- User-visible changes
- Provider/data-source changes
- Packaging notes
- Known limitations

## Release History

### 0.3.13 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity CLI-first collection)

**User-visible changes:**
- Antigravity collection now prefers the globally installed `antigravity-usage` CLI
- Antigravity usage linking now opens `antigravity-usage login`
- Dashboard guidance now explains the CLI Google path, CLI local path, and embedded fallbacks

**Provider/data-source changes:**
- Collection order is `antigravity-usage --method google`, then `antigravity-usage --method auto`, then embedded Antigravity local probe, then Gemini CLI OAuth fallback
- `antigravity-usage` model quota fields are normalized into the app's existing remaining/reset display model
- Account email and token fields from CLI output are discarded before renderer display

**Packaging notes:**
- Package version updated to `0.3.13`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- `antigravity-usage` must be installed globally or available on `PATH` for CLI-first collection

---

### 0.3.12 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity normalized plan tiers)

**User-visible changes:**
- Antigravity/Gemini plan labels are normalized to `Free`, `Plus`, `Pro`, or `Ultra`
- Unknown or ambiguous plan responses display `확인 필요`
- Dashboard recovery guidance now directs users to refresh, run `사용량 수집 연동`, complete Google OAuth, or re-check after a recent plan change

**Provider/data-source changes:**
- Gemini Code Assist plan collection now reads `paidTier` and `currentTier` id/name fields, preferring the paid tier when present
- No sensitive account identifiers are displayed or logged

**Packaging notes:**
- Package version updated to `0.3.12`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- `Plus` is shown only when the provider response includes Plus-identifying text

---

### 0.3.11 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity plan naming)

**User-visible changes:**
- Antigravity Gemini OAuth fallback plan labels now use Gemini-oriented names such as `Gemini 유료`, `Gemini Free`, `Gemini Workspace`, and `Gemini Legacy`
- Unknown Gemini OAuth fallback plans now display as `Gemini` instead of `Google AI`

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.11`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- The collector still avoids claiming exact Pro or Ultra names unless the provider response supplies a specific plan name

---

### 0.3.10 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity dashboard field simplification)

**User-visible changes:**
- Antigravity dashboard now shows only plan and Gemini quota
- Non-Gemini quota and collection source rows were removed from the dashboard to avoid overclaiming unstable quota signals
- Gemini shared quota label was shortened to `Gemini 한도`
- Gemini OAuth fallback plan names now use conservative `Google AI` labels instead of source names

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.10`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- Collection source remains available through settings guidance and diagnostics, not as a default dashboard row

---

### 0.3.9 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity guide copy alignment)

**User-visible changes:**
- Antigravity dashboard issue guidance now refers to the `사용량 수집 연동` action directly
- Settings guidance now describes Gemini shared quota display and the local-first/OAuth-fallback collection flow
- Antigravity guidance copy was shortened to action-focused recovery steps

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.9`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- The collection link action starts Gemini CLI OAuth fallback setup; Antigravity local sessions still require Antigravity itself to be running

---

### 0.3.8 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity shared quota display and collection linking)

**User-visible changes:**
- Antigravity dashboard fields now show Gemini shared quota instead of separate Pro, Flash, and Flash Lite rows
- Non-Gemini quota is shown separately when the collector can detect it
- Antigravity card now includes a usage collection link action for the Gemini CLI OAuth fallback path
- Collection source is shown as Antigravity local or Gemini OAuth

**Provider/data-source changes:**
- Added a renderer/main IPC path to launch Gemini CLI OAuth setup through `npx -y @google/gemini-cli`
- No new Antigravity public API dependency added

**Packaging notes:**
- Package version updated to `0.3.8`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- The Antigravity local path still depends on a running local language server
- The collection link action can start Gemini CLI OAuth fallback setup, but cannot automatically authenticate Antigravity local sessions

---

### 0.3.7 — 2026-06-03 — PATCH

**Change category:** PATCH (dashboard guide space allocation)

**User-visible changes:**
- Dashboard provider cards now reserve a fixed area for action guidance
- Antigravity's four quota rows stay compact so recovery steps remain visible
- Issue guidance copy was shortened to action-focused steps

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.7`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- Very long provider values are clamped in the card and may need hover/detail support in a future UI pass

---

### 0.3.6 — 2026-06-03 — PATCH

**Change category:** PATCH (dashboard card sizing)

**User-visible changes:**
- Dashboard provider cards now use a fixed visual height so long issue guidance does not resize neighboring cards
- Usage field values are clamped to a compact two-line display
- Longer issue and collection guidance content scrolls inside its own panel

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.6`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- Very long provider diagnostics may require scrolling inside the card

---

### 0.3.5 — 2026-06-03 — PATCH

**Change category:** PATCH (dashboard issue guidance and settings source guide)

**User-visible changes:**
- Routine provider usage collection path guidance moved from dashboard cards to each provider item in Settings
- Dashboard provider cards now show reason and recovery steps only when usage or server quota cannot be displayed
- Antigravity failure guidance now points users to local language server checks first and Gemini CLI OAuth fallback setup after that

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.5`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- Antigravity usage still requires either a running local language server or Gemini CLI Google OAuth credentials

---

### 0.3.4 — 2026-06-03 — PATCH

**Change category:** PATCH (dashboard provider guidance)

**User-visible changes:**
- Dashboard provider cards now show usage collection paths directly in the app
- Antigravity guidance explains the local language server path first and Gemini CLI OAuth fallback requirements after it
- Provider error cards show the current collection failure state alongside the guide

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.4`
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Antigravity usage still requires either a running local language server or Gemini CLI Google OAuth credentials

---

### 0.3.3 — 2026-06-03 — PATCH

**Change category:** PATCH (overlay text readability polish)

**User-visible changes:**
- Overlay provider backing was removed so the overlay remains visually lighter on the desktop
- Overlay text now uses brighter gray coloring, a thicker dark stroke, and layered shadow for stronger readability without a background panel

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.3`

**Known limitations:**
- On very bright or similarly gray backgrounds, readability still depends on text stroke and shadow contrast

---

### 0.3.2 — 2026-06-03 — PATCH

**Change category:** PATCH (overlay readability polish)

**User-visible changes:**
- Overlay text uses softer gray coloring with the existing enlarged dark stroke
- Overlay provider groups now have a subtle translucent backing, thin border, and shadow to improve contrast over mixed desktop backgrounds

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.2`

**Known limitations:**
- Very busy or similarly gray desktop backgrounds may still require higher overlay opacity in settings

---

### 0.3.1 — 2026-06-03 — PATCH

**Change category:** PATCH (overlay display alignment, UI polish, documentation policy)

**User-visible changes:**
- Overlay fields now use the same provider field model as the dashboard
- Overlay display settings now filter plan/quota details consistently with the configured provider display items
- Claude connection action remains visible in the card header and keeps the pending "link check" state without rendering a duplicate button
- Overlay text stroke width increased for better readability
- README now documents the current final project state without duplicating change history

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.1`

**Known limitations:**
- Antigravity quota still depends on the local language server or Gemini CLI OAuth fallback being available

---

### 0.3.0 — 2026-05-28 — MINOR

**Change category:** MINOR (provider data-source addition)

**User-visible changes:**
- Gemini/Antigravity quota is now read from the local language server process directly when available, removing the dependency on the Gemini CLI OAuth path
- Model window labels are now sourced from the API response (`label` field) instead of being hardcoded, so future model name changes reflect automatically

**Provider/data-source changes:**
- Added `antigravity-local` source: probes the Antigravity language server's listening ports via gRPC-JSON to retrieve quota data without OAuth
- `antigravity-local` is attempted first; falls back to `gemini-cli-oauth` if local probe fails
- Endpoint changed to `daily-cloudcode-pa.googleapis.com` for the OAuth path

**Packaging notes:**
- No executable packaged for this milestone (dev stabilization phase)
- Version reflected in `package.json`, `package-lock.json`, and `RELEASE_VERSION_POLICY.md`

**Known limitations:**
- Antigravity local probe requires the language server process to be running with accessible ports
- Port enumeration relies on `netstat` on Windows; may miss ephemeral ports on first probe

---

### 0.2.7 — 2026-05-27 — PATCH

**Change category:** PATCH (connection flow and IPC polish)

**User-visible changes:**
- Claude CLI login completion detection is more reliable: polls usage after OAuth link opens instead of waiting a fixed delay
- Force-refresh parameters added to `getClaudeUsage` and `getCliSessionStatus` IPC handlers so callers can bypass the 15s cache
- Exit dialog now shows a Minimize button only when `closeToTray` is enabled

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- No executable packaged

**Known limitations:**
- Login polling may time out if the browser flow takes more than ~60 seconds

---

### 0.2.4 — 2026-05-26 — MINOR

**Change category:** MINOR (reliability, tray UX, and internal cleanup)

**User-visible changes:**
- Tray menu: added **Refresh usage** item and **Overlay items** submenu with per-provider checkboxes
- Minimize-to-tray now available via tray IPC handler
- Child processes spawned for Codex are now tracked and killed on app exit/quit

**Provider/data-source changes:**
- Codex IPC no longer double-spawns when overlay and dashboard request usage simultaneously (promise deduplication)
- Stack overflow in Codex usage result formatter fixed (`reduce` replaces spread accumulator)
- Claude log JSONL files now use mtime-based incremental read (avoids full re-parse on every poll)
- Gemini CLI path resolution switched from `spawnSync` to async `spawn` (non-blocking main process)
- Gemini OAuth client credentials cached once per process lifetime

**Packaging notes:**
- No executable packaged

**Known limitations:**
- Tray per-provider toggle writes both `providers` and `providerItems` keys; minor redundancy

---

### 0.1.2 — 2026-05-25/26 — PATCH

**Change category:** PATCH (documentation and workflow)

**User-visible changes:**
- No user-visible code changes

**Provider/data-source changes:**
- None

**Packaging notes:**
- Added `AGENTS.md` with branch workflow, commit format, and security rules
- Added `RELEASE_VERSION_POLICY.md` with versioning rules
- README substantially expanded with setup, tray usage, and overlay instructions

**Known limitations:**
- None added

---

### 0.1.1 — 2026-05-25 — PATCH

**Change category:** PATCH (overlay and monitoring improvements)

**User-visible changes:**
- Overlay display improvements and usage monitoring reliability

**Provider/data-source changes:**
- Gemini integration improvements

**Packaging notes:**
- No executable packaged

**Known limitations:**
- None recorded

---

### 0.1.0 — 2026-05-24 — MAJOR

**Change category:** MAJOR (initial packaged release)

**User-visible changes:**
- Codex quota display
- Claude quota display
- Antigravity (Gemini) quota display via Gemini CLI OAuth path
- Transparent always-on-top overlay (bottom-right, click-through)
- System tray icon with show/hide and exit options
- Single-instance enforcement

**Provider/data-source changes:**
- Codex: JSON-RPC subprocess against Codex CLI
- Claude: OAuth usage API via `~/.claude/.credentials.json`
- Gemini/Antigravity: `cloudcode-pa.googleapis.com` quota API via Gemini CLI OAuth credentials

**Packaging notes:**
- Portable Windows x64 exe: `TokenMonitor-0.1.0-x64.exe`

**Known limitations:**
- Gemini CLI must be installed and authenticated for Antigravity quota to display
- Claude credentials file must exist at the default path

---

## Do Not

- Do not jump to `1.0.0` for partial work.
- Do not change the version for purely experimental changes that are not kept.
- Do not change the app/exe release version for documentation-only or instruction-only work unless explicitly requested.
- Do not package with stale `electron-builder`, `npm run dist:win`, `node`, `makensis`, or `signtool` processes still running.
- Do not keep older `TokenMonitor-*-x64.exe` files when creating a higher version executable.
- Do not log OAuth tokens, refresh tokens, account emails, or account IDs while testing release changes.
