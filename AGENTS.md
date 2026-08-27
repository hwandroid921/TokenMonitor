# AGENTS.md

Project-specific instructions for AI coding agents working in this repository.

## Project Overview

Token Monitor is a Windows Electron + React desktop app for checking Codex, Claude, and Antigravity quota status.

Primary users are Windows users who want to quickly inspect local LLM plan, quota, remaining usage, and reset time. The app must preserve provider usage collection, the compact dashboard, the transparent overlay, system tray behavior, and the privacy rule that sensitive account data is never shown in UI or logs.

## Tech Stack

- Language: TypeScript, JavaScript
- Framework: React, Electron
- Build tool: Vite, electron-builder
- Runtime: Node.js, Electron
- Package manager: npm
- Verification: TypeScript typecheck and production build

## Repository Map

- `electron/`: Electron main process, IPC, tray, overlay, settings, and provider usage collectors
- `src/`: React renderer, dashboard, settings, overlay UI, and shared renderer types
- `build/`: Windows app and tray icon assets
- `dist/`: Vite renderer build output
- `dist-electron/`: Electron TypeScript build output
- `dist-app/`: Windows packaging output
- `README.md`: user-facing final-state documentation
- `docs/RELEASE_VERSION_POLICY.md`: milestone/app version policy and release history
- `package.json`: app/exe release version and npm scripts
- `package-lock.json`: npm dependency lockfile

## Development Commands

- Install: `npm ci`
- Dev: `npm run dev`
- Typecheck: `npm run typecheck`
- Build: `npm run build`

Portable package:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false
```

Unpacked package:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win dir --x64 --publish never --config.win.signAndEditExecutable=false
```

## Working Rules

- Read relevant files before editing and follow existing project patterns.
- Keep changes scoped to the user request. Do not perform unrelated refactors.
- Keep changes small and verifiable.
- Keep UI changes aligned with the current compact dashboard style.
- Do not show access tokens, refresh tokens, or account IDs in the UI or logs.
- Write README and user-facing project docs as final-state documentation. Do not list individual task edits or change-by-change notes there.
- Record version-level changes only in `docs/RELEASE_VERSION_POLICY.md` Release History.
- Keep portable artifact names in English.
- Distinguish the project milestone version from the app/exe release version.
- The project milestone version is managed in `docs/RELEASE_VERSION_POLICY.md`.
- The app/exe release version is managed by `package.json` and is used in packaged executable names.
- Before finishing user-requested work, review `docs/RELEASE_VERSION_POLICY.md` and decide whether the work affects the project milestone version, the app/exe release version, both, or neither.
- Only update `package.json`, `package-lock.json`, and versioned output references when code changes or user-facing distributable changes require a new app/exe version.
- For documentation-only or instruction-only changes, do not update `package.json` and do not package a new executable unless the user explicitly asks.
- Manage version units automatically according to the local release policy unless the user gives a different versioning instruction.

## Versioning Rules

- Each standalone document version starts at `v1.0.0` by default.
- The overall program/project milestone version starts at `v0.1.0`.
- The overall project should move to `v1.0.0` when the intended initial feature implementation is complete.
- Do not predefine fixed feature content for every version up to `v1.0.0`; record version content when actual work is completed.
- Minor project changes increment by `0.1.0` units, for example `0.1.0` to `0.2.0`.
- Major project changes increment by `1.0.0` units, for example `1.0.0` to `2.0.0`.
- For feature additions, feature fixes, documentation work, and instruction work, review the relevant version history before finishing.
- If the work requires a version update, perform the version update immediately as part of the same task.
- After `v1.0.0`, manage releases with matching Git tags and remote release entries.
- For every `MINOR` or `MAJOR` app/exe release, automatically complete the release delivery workflow: update version files and release history, verify and package, commit, push the feature branch, and create the required PR. Do not wait for a separate upload or PR request.
- A `MINOR` or `MAJOR` release must include portable packaging and cleanup of prior versioned portable executables. After the new executable and SHA256 hash are verified, remove only older `TokenMonitor-*-x64.exe` artifacts from `dist-app/` and any user-designated release delivery directory, while preserving the current release artifact.
- After a `MINOR` or `MAJOR` release commit has been merged to the stable release branch, automatically create and push the matching `vMAJOR.MINOR.PATCH` tag and create the matching GitHub Release. Do not tag or publish an unmerged feature branch.
- Write GitHub Release notes in Korean by default. Keep Git tags and portable artifact names in English; use another note language only when the user explicitly requests it.
- For a `PATCH` release, push/PR, tag, GitHub Release, and portable packaging remain opt-in unless the user explicitly requests them or a more specific release instruction applies.
- Keep document versioning, project milestone versioning, and app/exe release versioning distinct.
- The app/exe release version remains managed by `package.json` and `package-lock.json`.
- The project milestone version and release history remain managed by `docs/RELEASE_VERSION_POLICY.md`.

## Coding Rules

- Follow existing naming, folder structure, import style, and error handling conventions.
- Use existing helpers, services, utilities, and provider collectors before adding new abstractions.
- Add a new abstraction only when it removes real duplication or meaningful complexity.
- Electron main process changes should follow the existing IPC, cache, collector, and child process patterns in `electron/`.
- React UI changes should follow the existing compact dashboard and settings patterns in `src/main.tsx` and `src/styles.css`.
- Provider usage collectors must return only display-safe data needed by the renderer.
- External CLI execution should follow the existing command discovery, timeout, and user-facing error detail patterns.
- Write Windows paths and packaging examples for PowerShell unless another shell is explicitly requested.

## Frontend Rules

- Preserve the dashboard card, settings panel, and overlay density.
- Button labels must describe the action visible to the user.
- Provider error and recovery guidance should stay compact inside provider cards.
- Ensure text does not overflow buttons, cards, or compact panels.
- Preserve accessibility attributes, disabled states, pending states, and focus behavior.
- Never display tokens, account IDs, or other credential-derived identifiers.

## Provider Rules

- Codex usage assumes Codex Desktop is installed and signed in.
- Codex executable discovery should consider `CODEX_CLI_PATH`, known local install paths, hashed install folders, Windows app resource paths, and PATH candidates.
- Claude server quota should require a Claude Pro/Max or higher account with Claude Code CLI OAuth. Local Claude JSONL logs are fallback/history metadata only and must not be presented as server quota for lower-plan accounts.
- Claude CLI setup should use the Node.js/npm prerequisite and the `npx -y @anthropic-ai/claude-code auth login --claudeai` flow.
- Claude login completion checks should keep short user-visible feedback when setup cannot complete.
- Antigravity usage collection order should remain:
  - `antigravity-usage` Google method
  - `antigravity-usage` auto/local method
  - embedded Antigravity local probe
  - Gemini CLI OAuth fallback
- Antigravity CLI setup should use the Node.js/npm prerequisite and the `npx -y antigravity-usage login` flow.
- Antigravity local fallback must remain available when Antigravity is already running.
- Antigravity 5-hour quota may be displayed from model quota `remainingFraction`/`remainingPercentage` plus `resetTime`. Weekly quota must only be displayed when an explicit weekly/7-day window is present; do not infer weekly quota from monthly Prompt Credits.

## Security and Privacy

- Do not hardcode secrets, API keys, OAuth tokens, refresh tokens, account IDs.
- Do not modify `.env`, credential, or production config files unless the user explicitly asks and the change is safe.
- Do not log raw provider payloads that may include sensitive data.
- Do not include secrets or account identifiers in README examples, screenshots, test fixtures, issues, PR descriptions, or build logs.
- When documenting local file paths, use generic path patterns and do not include real account identifiers.

## Build and Packaging Process

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

## Packaging Rules

- Package the portable Windows executable only for milestone release versions such as `0.3.0`, `0.4.0`, and later `MINOR.0` or `MAJOR.0` release points, unless the user explicitly requests a portable exe for another version.
- For patch-level changes such as `0.3.1`, `0.3.2`, or `0.3.3`, skip portable packaging by default even when code changed.
- For documentation-only or instruction-only work, skip packaging unless the user explicitly asks for a new executable.
- When the app/exe version changes and the user requested unpacked exe refreshes, regenerate `dist-app/win-unpacked`.
- When creating a portable executable for a higher `MINOR` or `MAJOR` version, verify the new executable and SHA256 hash first, then remove older versioned executables so `dist-app/` and any user-designated release delivery directory keep only the latest portable exe.

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

For unpacked packaging, verify `dist-app\win-unpacked\TokenMonitor.exe` and its SHA256 hash.

## Verification Rules

- Run these before finalizing code changes:

  ```powershell
  npm run typecheck
  npm run build
  ```

- For packaging changes:
  - Check stale packaging processes first.
  - Run the requested packaging command.
  - Verify executable path and SHA256 hash.
- For documentation-only or instruction-only changes:
  - Skip build and packaging unless the user explicitly requests them.
  - Verify changed documents for current version numbers, command accuracy, and obvious broken references.
- If a verification command cannot be run, report why and describe the substitute verification.

## Documentation Rules

- README and user-facing docs should describe the final current behavior, not task-by-task edits.
- New commands, prerequisites, provider collection flows, packaging behavior, or user-visible behavior changes should update the relevant docs.
- Version/release changes belong in `docs/RELEASE_VERSION_POLICY.md` Release History.
- Documentation-only or instruction-only changes do not require an app/exe version bump.
- Keep artifact names in English.

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
- Keep feature branch names lowercase and descriptive.
- Do not commit directly to `main` for implementation work unless the user explicitly asks.
- Do not revert unrelated user changes.

Commit message format for ordinary local commits:

```text
[YYYY-MM-DD] implemented feature
```

Korean commit messages are allowed when they are clearer. Examples:

```text
[2026-05-25] README 문서 구조 개선
[2026-05-25] overlay opacity 설정 추가
```

When the user asks for remote upload work, proceed through commit, push, and pull request creation.

For a `MINOR` or `MAJOR` release, treat the remote delivery sequence as part of the implementation work even when the user does not separately ask for upload:

1. Run the required portable packaging and verify the new executable and SHA256 hash.
2. Remove only older versioned portable artifacts from the explicit release output locations after verification succeeds.
3. Commit and push the release branch.
4. Create a PR to the required integration branch.
5. After the release commit is merged to the stable release branch, create and push the matching annotated Git tag.
6. Create the GitHub Release from that tag with Korean notes, including concise summary, verification, and artifact/hash details.

Never create a release tag or GitHub Release for a feature branch or an unmerged PR. If the merge has not occurred, finish by reporting the PR and that the tag/release is pending the stable-branch merge.

Remote upload commit message format:

```text
[YYYY.MM.DD] feature feature_name
```

Example:

```text
[2026.06.09] feature claude-cli-login
```

Use a short `feature_name` that reflects the main changed item.

After committing, push the feature branch when the user asks for push/PR work:

```powershell
git push -u origin feature/<feature-name>
```

After pushing remote upload work, create the pull request as part of the same requested workflow.

When creating a PR, keep the PR description concise. Focus on the core work and the difference from the previous project behavior.

PR description format:

```markdown
## Summary

- Briefly describe the core work.
- Briefly describe what changed compared with the previous project behavior.

## Verification

- npm run typecheck
- npm run build
- portable exe packaging, if performed

## Notes

- Mention important limitations, version changes, or packaging output.
```

Tell the user the branch name, commit hash, push result, and PR description draft after finishing the Git workflow.

## Do Not Touch

- Do not revert unrelated user changes.
- Do not edit generated build output such as `dist/`, `dist-electron/`, or `dist-app/` unless build/packaging output is explicitly part of the task.
- Do not remove older packaged executables unless packaging policy says to keep only the latest versioned artifact or the user asks.
- Do not change `package.json` or `package-lock.json` for documentation-only or instruction-only tasks.
- Do not expose or copy local credential files from `.claude`, `.gemini`, Codex, Claude, Antigravity, or OAuth storage paths.

## Agent Response Rules

- Completed work reports should include changed files, the core change, verification commands run, and results.
- If verification was skipped or could not be run, clearly state why.
- If packaging was performed, report output path and SHA256 hash.
- If git work was performed, report branch name, commit hash, and push result.
- Suggest only high-priority follow-up work that directly builds on the user request.

## Instruction Priority

- Direct user requests have priority.
- The closest applicable `AGENTS.md` has priority over a parent directory `AGENTS.md`.
- If instructions conflict, follow the more specific instruction.
- Safety, security, privacy, and secret-protection rules always take priority.
