# Token Monitor

Desktop overlay app for quickly checking LLM plan, usage, remaining quota, and reset times.

Token Monitor is an Electron + React app focused on local-first usage monitoring for Codex, Claude, and future Gemini integration. It provides a compact dashboard, a transparent desktop overlay, and system tray controls.

## Features

- Usage dashboard for Codex, Claude, and Gemini placeholders
- Transparent always-on-top overlay
- Per-provider overlay display settings
- System tray management
- Close-to-tray behavior with confirmation when disabled
- Single-instance guard to prevent duplicate tray icons
- Claude CLI login launcher
- Portable Windows executable output

## Current Provider Support

### Codex

Codex usage is read from the Codex app/server usage flow used by the local desktop session.

Displayed fields:

- Current plan
- CLI/session state
- 5-hour usage and remaining percentage
- Weekly usage and remaining percentage
- Reset times

### Claude

Claude usage uses a local-first OAuth flow through Claude Code CLI.

Flow:

1. Click `Claude CLI login` in the Claude card when the session is missing.
2. The app runs:

   ```powershell
   npx -y @anthropic-ai/claude-code auth login --claudeai
   ```

3. Complete the browser login.
4. Claude Code stores local OAuth credentials under the user profile.
5. Token Monitor reads the local session and requests Claude usage data.
6. Local Claude JSONL logs are used only as fallback/history metadata.

Displayed fields:

- Current Claude plan
- CLI/session state
- 5-hour usage and remaining percentage
- Weekly usage and remaining percentage
- Reset times
- Extra usage limit when available

### Gemini

Gemini is currently shown as a planned integration. The intended path is Gemini CLI OAuth/Google login, then quota usage collection through the local CLI/session path.

## App Layout

The main window has two tabs:

- `Usage Dashboard`: provider cards and current status
- `Settings`: overlay and tray behavior

Settings include:

- Overlay on/off
- Close to system tray on window close
- Per-provider overlay visibility
- Per-provider displayed fields:
  - Plan
  - CLI session
  - Usage
  - Remaining
  - Reset time
- Overlay opacity

## System Tray Behavior

Token Monitor creates a tray icon on launch.

- Clicking the tray icon opens the main window.
- Closing the main window minimizes to tray by default.
- If close-to-tray is disabled, closing the window shows a confirmation dialog.
- Choosing full exit closes the main window, overlay, and tray icon.
- A single-instance lock prevents duplicate app instances and duplicate tray icons.

## Build Requirements

- Windows
- Node.js
- npm

Install dependencies:

```powershell
npm install
```

Run in development:

```powershell
npm run dev
```

Type check:

```powershell
npm run typecheck
```

Build renderer and Electron main process:

```powershell
npm run build
```

Build Windows artifacts:

```powershell
npm run dist:win
```

Portable-only build used during development:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false
```

## Output Naming Policy

File names and build artifact names should stay in English.

Current portable artifact:

```text
dist-app/TokenMonitor-0.1.0-x64.exe
```

Build configuration uses:

- `productName`: `Token Monitor`
- `executableName`: `TokenMonitor`
- `artifactName`: `TokenMonitor-${version}-${arch}.${ext}`

## Important Local Paths

App settings:

```text
%APPDATA%/token-monitor/overlay-settings.json
```

Claude local session/log data:

```text
%USERPROFILE%/.claude/
```

Portable runtime extraction:

```text
%LOCALAPPDATA%/Temp/
```

## Notes

- OAuth tokens are read locally and are not displayed in the UI.
- The app should not log access tokens, refresh tokens, emails, or account IDs.
- Portable builds can leave temporary extraction folders after forced termination. Cleaning old Token Monitor temp folders can recover disk space.
- Electron shows multiple helper processes in Task Manager. That is normal. The single-instance lock prevents multiple main app instances.

## Project Structure

```text
electron/
  main.ts              Electron lifecycle, windows, tray, IPC
  codex-usage.ts       Codex usage collector
  claude-usage.ts      Claude OAuth/local log collector
  cli-session.ts       CLI login/session checks
  overlay-settings.ts  Overlay settings schema and migration
  preload.cjs          Packaged preload bridge

src/
  main.tsx             React dashboard, settings, overlay view
  styles.css           App and overlay styles
  global.d.ts          Shared renderer types

build/
  icon.ico             Windows app/tray icon

dist-app/
  TokenMonitor-*.exe   Windows build artifacts
```

