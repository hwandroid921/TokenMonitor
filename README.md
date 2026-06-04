# Token Monitor

Token Monitor는 Windows에서 Codex, Claude, Antigravity quota 상태를 한눈에 확인하는 Electron + React 데스크톱 앱입니다.

앱은 로컬 LLM 계정/세션 데이터를 읽어 현재 플랜, 남은 quota, reset 시간을 compact dashboard와 투명 always-on-top overlay로 보여줍니다. OAuth access token, refresh token, account email, account ID는 UI에 표시하지 않으며 로그에도 남기지 않는 것을 원칙으로 합니다.

이 문서는 프로젝트의 최종 동작 상태를 기준으로 작성합니다. 일반 README와 사용자 문서는 개별 수정 이력을 나열하지 않으며, 버전 단위 변경 사항은 `RELEASE_VERSION_POLICY.md`의 Release History에만 기록합니다.

## Current Version

- App/exe version: `0.3.13`
- Current milestone line: `0.3.x`
- Portable artifact policy: portable exe packaging is reserved for milestone versions such as `0.3.0`, `0.4.0`, or later `MINOR.0` / `MAJOR.0` release points unless explicitly requested.
- Output naming policy: build artifact names stay in English.

## Provider Support

| Provider | Quota source | Requirement |
| --- | --- | --- |
| Codex | Local Codex app/server usage flow | Codex desktop or local CLI |
| Claude | Claude Code CLI OAuth, with local log fallback | Claude Code OAuth login |
| Antigravity | `antigravity-usage` CLI, with embedded local/Gemini fallback | `antigravity-usage` global install, Antigravity running, or Google login |

## Usage Collection Paths

Token Monitor reads usage data from local sessions and provider-owned quota endpoints. It does not ask the user to paste secrets into the app.

### Codex Collection Path

1. The app calls the local Codex usage flow through the Codex executable.
2. The default executable path is `%LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe`.
3. If Codex is installed elsewhere, set `CODEX_CLI_PATH`.
4. The renderer receives only display-safe fields such as plan, quota window, remaining amount, and reset time.

### Claude Collection Path

1. The app first checks Claude Code CLI/OAuth state.
2. When OAuth usage is linked, the app reads server quota windows from Claude's OAuth usage endpoint.
3. Local Claude JSONL logs are used only as fallback/history metadata when server quota is unavailable.
4. If Claude is not linked, use the Claude login action in the app or run:

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

### Antigravity Collection Path

Antigravity quota uses `antigravity-usage` first. The app tries these paths in order.

1. **`antigravity-usage` Google method**

   Uses the globally installed CLI and its Google Cloud Code API login.

   ```powershell
   npm install -g antigravity-usage
   antigravity-usage login
   antigravity-usage quota --json --method google --refresh
   ```

2. **`antigravity-usage` auto/local method**

   If Google login is unavailable, the CLI can read the running Antigravity language server.

   ```powershell
   antigravity-usage quota --json --method auto --refresh
   ```

3. **Embedded fallback collectors**

   Token Monitor keeps the embedded Antigravity local probe and Gemini CLI OAuth quota path as fallback collectors.

If Antigravity usage is not visible, check these in order:

- `antigravity-usage --version` works in PowerShell
- `antigravity-usage login` is completed for Google collection
- Antigravity is running for local collection
- `antigravity-usage quota --json --method auto --refresh` returns model quota
- Gemini CLI OAuth is available only as the final fallback path

### Codex

Token Monitor reads quota from the local Codex app/server usage flow.

Default executable path:

```text
%LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe
```

Set `CODEX_CLI_PATH` to override the executable path.

Displayed fields:

- Plan
- 5-hour quota
- Weekly quota

### Claude

Claude server quota uses Claude Code CLI OAuth when available. Local Claude JSONL logs are used only as fallback/history metadata.

Login command:

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

Local Claude paths:

```text
%USERPROFILE%/.claude/
%USERPROFILE%/.claude.json
```

Displayed fields:

- Plan
- 5-hour quota
- Weekly quota

If server quota is unavailable, the app shows the server quota as not linked and keeps local history available where possible.

### Antigravity

Antigravity quota is read from `antigravity-usage` first. Google mode provides stable model IDs, local mode works when Antigravity is running, and embedded fallback collectors remain available.

Local paths:

```text
%APPDATA%/antigravity-usage/
%USERPROFILE%/.gemini/settings.json
%USERPROFILE%/.gemini/oauth_creds.json
```

Displayed fields:

- Plan
- Gemini quota

The collector can read Antigravity model quota fields such as label, model ID, remaining percentage, exhausted state, reset time, and autocomplete-only status. Local `antigravity-usage` responses can also include prompt credits. Token Monitor does not display or log account emails, tokens, or account identifiers.

Antigravity/Gemini plan names are normalized from the OAuth or local provider response into four user-facing tiers:

- Free
- Plus
- Pro
- Ultra

If the provider response does not include enough plan information, the dashboard shows `확인 필요` and prompts the user to refresh, run `사용량 수집 연동`, complete `antigravity-usage` login, or re-check after a recent subscription change.

API-key and Vertex AI auth modes are not treated as personal quota window sources.

## App Layout

### Usage Dashboard

The dashboard shows provider cards for:

- Codex
- Claude
- Antigravity

Provider cards show the same quota fields used by the overlay. The Claude card keeps a visible CLI/OAuth connection action when linking is required, including the pending state while the app checks whether linking completed. The Antigravity card includes a usage collection link action that opens `antigravity-usage login`.

When usage cannot be displayed, the dashboard shows the current reason and provider-specific recovery steps. Routine usage collection path guidance lives in Settings under each provider item.

Dashboard provider cards keep a fixed visual height and reserve space for compact action guidance. Antigravity shows only the plan and Gemini quota in the dashboard; collection path guidance stays in Settings.

### Settings

Settings include:

- Overlay on/off
- Window close behavior
- Provider visibility in overlay
- Per-provider display items
- Per-provider usage collection path guidance
- Overlay opacity

The overlay display items are aligned with the dashboard field model:

- Plan
- Usage/quota window
- Remaining quota
- Reset time

## Overlay

The overlay is a transparent, always-on-top, click-through window placed near the bottom-right of the primary display.

Overlay behavior:

- Transparent always-on-top window
- Bold gray text with enlarged dark text stroke and layered shadow
- Same provider fields as the dashboard
- Per-provider visibility control
- Refreshes usage data every minute

## System Tray

Token Monitor creates a system tray icon on launch.

- Click the tray icon to open the main window.
- Close the main window to minimize to tray when close-to-tray is enabled.
- If close-to-tray is disabled, closing the window opens an in-app exit confirmation dialog.
- Full exit closes the main window, overlay, tray icon, and active child processes.
- A single-instance lock prevents duplicate main app instances and duplicate tray icons.

## Privacy And Security

- OAuth access tokens and refresh tokens are read locally only when required for provider quota requests.
- Account emails and account IDs must not be shown in the UI or written to logs.
- Provider collectors should return only the display state needed by the renderer.
- Build logs, screenshots, issues, pull requests, and README examples must not include secrets or account identifiers.

## Troubleshooting

### Codex Usage Is Not Available

Check that Codex is installed at the default path or set `CODEX_CLI_PATH`.

### Claude Shows Server Quota Not Linked

Run the Claude login command and complete browser authentication:

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

### Antigravity Usage Is Not Available

Start Antigravity so its local language server is running, or sign in with Gemini CLI Google OAuth.

### Task Manager Shows Multiple Processes

Electron apps use multiple helper processes. This is expected. The single-instance lock prevents duplicate main app instances and duplicate tray icons.

### Portable App Leaves Temporary Files

Forced termination can leave extraction folders under `%LOCALAPPDATA%/Temp/`. Remove old Token Monitor temp folders to reclaim disk space.

## Development

Requirements:

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

Build:

```powershell
npm run build
```

Portable package:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false
```

## Project Structure

```text
electron/
  main.ts              Electron lifecycle, windows, tray, IPC
  codex-usage.ts       Codex usage collector
  claude-usage.ts      Claude OAuth/local log collector
  gemini-usage.ts      Antigravity/Gemini quota collector
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
  TokenMonitor-*-x64.exe
```

## Release Notes

Version-level changes are tracked in `RELEASE_VERSION_POLICY.md`.
