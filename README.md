# Token Monitor

Windows desktop app for checking Codex, Claude, and Antigravity quota at a glance.

Token Monitor is an Electron + React app that reads local LLM account/session data and shows the current plan, remaining quota, and reset time in a compact dashboard and transparent always-on-top overlay.

## Features

- Codex quota dashboard
- Claude quota dashboard
- Antigravity quota dashboard through the Gemini CLI OAuth quota path
- Transparent always-on-top usage overlay
- Per-provider overlay visibility settings
- App-managed exit confirmation when close-to-tray is disabled
- System tray controls
- Single-instance guard to prevent duplicate tray icons
- Portable Windows executable output

## Current Provider Support

### Codex

Codex usage is read from the local Codex app/server usage flow.

Displayed fields:

- Plan
- 5-hour remaining quota and reset time
- Weekly remaining quota and reset time

Requirements:

- Codex desktop/local CLI environment must be available.
- By default, Token Monitor looks for:

  ```text
  %LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe
  ```

- You can override the executable path with:

  ```text
  CODEX_CLI_PATH
  ```

### Claude

Claude usage uses the Claude Code CLI OAuth path when available. Local Claude JSONL logs are used as fallback/history metadata.

Displayed fields:

- Plan
- 5-hour remaining quota and reset time
- Weekly remaining quota and reset time

If Claude server quota is not available, Token Monitor shows local token usage where possible and marks the server quota as not linked.

Claude login command:

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

Local Claude data paths:

```text
%USERPROFILE%/.claude/
%USERPROFILE%/.claude.json
```

### Antigravity

Antigravity is shown as the Google-side quota surface. The current implementation uses the existing Gemini CLI Google OAuth quota path because it is available locally and exposes the needed quota data.

Displayed fields:

- Plan
- Gemini Pro remaining quota and reset time
- Gemini Flash remaining quota and reset time
- Gemini Flash Lite remaining quota and reset time

Flow:

1. Sign in to Gemini CLI with Google OAuth.
2. Token Monitor reads local Gemini OAuth credentials.
3. If needed, it refreshes the access token using the installed Gemini CLI OAuth client metadata.
4. It calls Google Code Assist quota endpoints to fetch model quota windows.

Local Gemini data paths:

```text
%USERPROFILE%/.gemini/settings.json
%USERPROFILE%/.gemini/oauth_creds.json
```

Notes:

- API-key and Vertex AI auth modes do not expose the same personal quota windows.
- The UI uses the Antigravity label while the initial data source remains Gemini CLI OAuth quota.

## App Layout

The main window has two tabs.

### Usage Dashboard

Shows one card per provider:

- Codex
- Claude
- Antigravity

Cards intentionally hide login/session state and show only the plan, remaining quota, and reset time fields.

### Settings

Settings include:

- Overlay on/off
- Close to system tray on window close
- Per-provider overlay visibility
- Per-provider displayed items:
  - Plan
  - Usage
  - Remaining
  - Reset time
- Overlay opacity

## Overlay

The overlay is a transparent always-on-top window. It is designed to sit over the desktop without a card background, border, or heavy UI chrome.

Overlay behavior:

- Transparent background
- Large semi-transparent text
- Click-through window
- Provider visibility controlled from Settings
- Refreshes usage data every minute

## System Tray And Exit Behavior

Token Monitor creates a tray icon on launch.

- Clicking the tray icon opens the main window.
- Closing the main window minimizes to tray by default.
- If close-to-tray is disabled, closing the window shows an in-app confirmation dialog.
- Confirming exit closes the main window, overlay, and tray icon.
- A single-instance lock prevents duplicate app instances and duplicate tray icons.

## Build Requirements

- Windows
- Node.js
- npm

Install dependencies:

```powershell
npm ci
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

## Output

Portable executable:

```text
dist-app/TokenMonitor-<version>-x64.exe
```

Build configuration uses:

- `productName`: `Token Monitor`
- `executableName`: `TokenMonitor`
- `artifactName`: `TokenMonitor-${version}-${arch}.${ext}`

File names and build artifact names should stay in English.

## Important Local Paths

App settings:

```text
%APPDATA%/token-monitor/overlay-settings.json
```

Claude local session/log data:

```text
%USERPROFILE%/.claude/
%USERPROFILE%/.claude.json
```

Gemini/Antigravity quota source data:

```text
%USERPROFILE%/.gemini/settings.json
%USERPROFILE%/.gemini/oauth_creds.json
```

Portable runtime extraction:

```text
%LOCALAPPDATA%/Temp/
```

## Privacy

- OAuth tokens are read locally and are not displayed in the UI.
- The app should not log access tokens, refresh tokens, emails, or account IDs.
- Usage collection is local-first and provider-specific.
- Gemini OAuth token refresh writes the refreshed credential back to the local Gemini credential file when possible.

## Troubleshooting

### Codex Usage Is Not Available

Check that Codex is installed and that `codex.exe` exists at the expected path, or set `CODEX_CLI_PATH`.

### Claude Shows Server Quota Not Linked

Run the Claude login command and complete browser authentication:

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

If only local logs are available, Token Monitor can show local token history but not server quota remaining percentage.

### Antigravity Usage Is Not Available

Sign in with Gemini CLI Google OAuth. API-key and Vertex AI modes are not enough for the current quota collector.

### Portable App Leaves Temporary Files

Portable builds can leave temporary extraction folders after forced termination. Cleaning old Token Monitor temp folders under `%LOCALAPPDATA%/Temp/` can recover disk space.

### Multiple Processes In Task Manager

Electron shows multiple helper processes in Task Manager. That is normal. The single-instance lock prevents multiple main app instances.

## Project Structure

```text
electron/
  main.ts              Electron lifecycle, windows, tray, IPC
  codex-usage.ts       Codex usage collector
  claude-usage.ts      Claude OAuth/local log collector
  gemini-usage.ts      Antigravity/Gemini OAuth quota collector
  cli-session.ts       CLI login/session checks
  overlay-settings.ts  Overlay settings schema and migration
  preload.ts           Source preload bridge
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

## License

MIT
