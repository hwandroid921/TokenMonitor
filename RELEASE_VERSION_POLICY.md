# Release Version Policy

This local planning document defines the project milestone version and app/exe release version rules for Token Monitor from `0.1.0` to the final `1.0.0` release.

This file is tracked in Git and is used as a shared working reference while planning, implementing, and packaging releases.

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
0.2.3
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

6. Package the portable executable for code or user-facing distributable changes unless explicitly skipped:

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

## Do Not

- Do not jump to `1.0.0` for partial work.
- Do not change the version for purely experimental changes that are not kept.
- Do not change the app/exe release version for documentation-only or instruction-only work unless explicitly requested.
- Do not package with stale `electron-builder`, `npm run dist:win`, `node`, `makensis`, or `signtool` processes still running.
- Do not keep older `TokenMonitor-*-x64.exe` files when creating a higher version executable.
- Do not log OAuth tokens, refresh tokens, account emails, or account IDs while testing release changes.
