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
- Distinguish the project milestone version from the app/exe release version.
- The project milestone version is managed in the local `RELEASE_VERSION_POLICY.md` document.
- The app/exe release version is managed by `package.json` and is used in packaged executable names.
- Before finishing user-requested work, review `RELEASE_VERSION_POLICY.md` and decide whether the work affects the project milestone, the app/exe release version, both, or neither.
- Only update `package.json`, `package-lock.json`, and versioned output references when code changes or user-facing distributable changes require a new app/exe version.
- For documentation-only or instruction-only changes, do not update `package.json` and do not package a new exe unless the user explicitly asks.
- Manage version units automatically according to the local release policy unless the user gives a different versioning instruction.

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

For feature implementation work, create a task-specific branch under `feature/` for each functional unit.

Rules:

- Keep `main` as the stable base branch.
- Create `dev` from `main` when a development branch is needed.
- Create each implementation branch from `dev`.
- Use `feature/<short-feature-name>` for feature branch names.
- For implementation work, create one `feature/<short-feature-name>` branch per feature or functional unit instead of mixing unrelated changes in one branch.
- Keep feature branch names lowercase and descriptive.
- Do not commit directly to `main` for implementation work unless the user explicitly asks.

Commit message format:

```text
[YYYY-MM-DD] implemented feature
```

When the user asks for remote upload work, commit and push the current feature branch. Write the commit message in the format above, but keep the summary brief and focused on the changed items rather than a broad or generic description.

Korean commit messages are allowed. Examples:

```text
[2026-05-25] README 문서 구조 개선
[2026-05-25] overlay opacity 설정 추가
```

After committing, push the feature branch when the user asks for push/PR work:

```powershell
git push -u origin feature/<feature-name>
```

After pushing, do not create the pull request directly unless the user explicitly asks. Instead, prepare a concise PR description for the user in a markdown code block. Focus on what changed, key implementation notes, and differences from the previous behavior.

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

After completing user-requested code or user-facing distributable work, package the app into the portable Windows executable unless the user explicitly asks not to package.

For documentation-only or instruction-only work, skip packaging unless the user explicitly asks for a new executable.

When packaging during development, prefer the portable-only command:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false
```

When creating an executable for a higher version, remove older versioned executables first so `dist-app/` keeps only the latest portable exe.

PowerShell cleanup example:

```powershell
$currentVersion = (Get-Content -Raw package.json | ConvertFrom-Json).version
Get-ChildItem -Path dist-app -Filter "TokenMonitor-*-x64.exe" -File |
  Where-Object { $_.Name -ne "TokenMonitor-$currentVersion-x64.exe" } |
  Remove-Item -Force
```

After packaging, verify the executable and hash:

```powershell
Get-ChildItem -Force dist-app\TokenMonitor-*-x64.exe
Get-FileHash dist-app\TokenMonitor-*-x64.exe -Algorithm SHA256
```
