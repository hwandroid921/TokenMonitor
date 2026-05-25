# AGENTS.md

Project-specific instructions for Codex agents working in this repository.

## Project Overview

Token Monitor is a Windows Electron + React desktop app for checking Codex, Claude, and Antigravity quota status.

The app has:

- Electron main process code in `electron/`
- React renderer code in `src/`
- Windows packaging output in `dist-app/`

## Implementation Guidelines

- Keep UI changes aligned with the current compact dashboard style.
- Do not show account emails, access tokens, refresh tokens, or account IDs in the UI or logs.
- Keep portable artifact names in English.
- Before finishing user-requested work, review the local `RELEASE_VERSION_POLICY.md` document and decide whether the work requires a patch, minor, or final `1.0.0` version update.
- If a version update is required, update `package.json`, `package-lock.json`, and any release/output references that include the version string.
- Manage release version units automatically according to the local release policy unless the user gives a different versioning instruction.

## Build And Packaging Process

Before running build or packaging tasks, check whether related processes are already running.

Look for stale packaging processes such as:

- `electron-builder`
- `npm run dist:win`
- `node`
- `makensis`
- `signtool`

Do not start a new packaging task while a previous packaging process is still running. If a stale packaging process is found, stop it before retrying.

PowerShell process check:

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -in @("node.exe", "makensis.exe", "signtool.exe") -and
    $_.CommandLine -match "electron-builder|dist:win"
  } |
  Select-Object ProcessId, Name, CommandLine
```

Stop stale processes by process id:

```powershell
Get-Process -Id <PID> -ErrorAction SilentlyContinue | Stop-Process -Force
```

## Git Workflow

Before starting implementation work, create or switch to the correct feature branch.

Branch flow:

```text
main -> dev -> feature/<feature-name>
```

Rules:

- Keep `main` as the stable base branch.
- Create `dev` from `main` when a development branch is needed.
- Create each implementation branch from `dev`.
- Use `feature/<short-feature-name>` for feature branch names.
- Keep feature branch names lowercase and descriptive.
- Do not commit directly to `main` for implementation work unless the user explicitly asks.

Commit message format:

```text
[YYYY-MM-DD] implemented feature summary
```

Korean commit messages are allowed. Example:

```text
[2026-05-25] 사용량 모니터링 및 오버레이 개선
```

After committing, push the feature branch when the user asks for push/PR work:

```powershell
git push -u origin feature/<feature-name>
```

After pushing, prepare a concise PR description for the user.

PR description format:

```markdown
## Summary

- Briefly describe the implemented feature or change.

## Verification

- npm run typecheck
- npm run build
- portable exe packaging, if performed

## Notes

- Mention important limitations, version changes, or packaging output.
```

Tell the user the branch name, commit hash, push result, and PR description draft after finishing the Git workflow.

## Verification

Run these before finalizing code changes:

```powershell
npm run typecheck
npm run build
```

After completing user-requested work, package the app into the portable Windows executable unless the user explicitly asks not to package.

When packaging during development, prefer the portable-only command:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false
```

After packaging, verify the executable and hash:

```powershell
Get-ChildItem -Force dist-app\TokenMonitor-*-x64.exe
Get-FileHash dist-app\TokenMonitor-*-x64.exe -Algorithm SHA256
```
