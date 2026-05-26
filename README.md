# Token Monitor

Windows에서 Codex, Claude, Antigravity quota 상태를 한눈에 확인하는 Electron + React 데스크톱 앱입니다.

Token Monitor는 로컬 LLM 계정/세션 데이터를 읽어 현재 플랜, 남은 quota, reset 시간을 compact dashboard와 투명 always-on-top overlay로 보여줍니다. OAuth access token, refresh token, account email, account ID는 UI에 표시하지 않으며 로그에도 남기지 않는 것을 원칙으로 합니다.

현재 앱/exe 버전은 `package.json`의 `version` 값을 기준으로 하며, 프로젝트 milestone 정책은 로컬 `RELEASE_VERSION_POLICY.md` 문서를 기준으로 관리합니다.

## 빠른 시작

요구 사항:

- Windows
- Node.js
- npm

의존성 설치:

```powershell
npm ci
```

개발 모드 실행:

```powershell
npm run dev
```

타입 체크:

```powershell
npm run typecheck
```

빌드:

```powershell
npm run build
```

Windows artifact 빌드:

```powershell
npm run dist:win
```

개발 중 portable-only 빌드:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false
```

## 주요 기능

- Codex quota dashboard
- Claude quota dashboard
- Gemini CLI OAuth quota 경로를 활용한 Antigravity quota dashboard
- 투명 always-on-top usage overlay
- provider별 overlay 표시 설정
- overlay opacity 설정
- close-to-tray 비활성화 시 앱 내부 종료 확인
- system tray control
- 중복 tray icon을 방지하는 single-instance guard
- portable Windows executable output

## 현재 Provider 지원 범위

### Codex

Codex 사용량은 로컬 Codex app/server usage flow에서 읽습니다.

표시 항목:

- Plan
- 5-hour remaining quota and reset time
- Weekly remaining quota and reset time

요구 사항:

- Codex desktop/local CLI 환경이 사용 가능해야 합니다.
- 기본 실행 파일 경로:

  ```text
  %LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe
  ```

- 실행 파일 경로 override:

  ```text
  CODEX_CLI_PATH
  ```

### Claude

Claude 사용량은 사용 가능한 경우 Claude Code CLI OAuth 경로를 사용합니다. 로컬 Claude JSONL 로그는 fallback/history metadata로 사용됩니다.

표시 항목:

- Plan
- 5-hour remaining quota and reset time
- Weekly remaining quota and reset time

Claude server quota를 사용할 수 없으면 Token Monitor는 가능한 범위에서 로컬 token usage를 보여주고 server quota는 not linked 상태로 표시합니다.

Claude login command:

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

로컬 Claude data paths:

```text
%USERPROFILE%/.claude/
%USERPROFILE%/.claude.json
```

### Antigravity

Antigravity는 Google-side quota surface로 표시됩니다. 현재 구현은 로컬에서 사용할 수 있고 quota data를 제공하는 Gemini CLI Google OAuth quota 경로를 사용합니다.

표시 항목:

- Plan
- Gemini Pro remaining quota and reset time
- Gemini Flash remaining quota and reset time
- Gemini Flash Lite remaining quota and reset time

동작 흐름:

1. Gemini CLI에서 Google OAuth로 로그인합니다.
2. Token Monitor가 로컬 Gemini OAuth credential을 읽습니다.
3. 필요한 경우 설치된 Gemini CLI OAuth client metadata를 사용해 access token을 refresh합니다.
4. Google Code Assist quota endpoint를 호출해 model quota window를 가져옵니다.

로컬 Gemini data paths:

```text
%USERPROFILE%/.gemini/settings.json
%USERPROFILE%/.gemini/oauth_creds.json
```

참고:

- API key와 Vertex AI auth mode는 동일한 personal quota window를 제공하지 않습니다.
- UI label은 Antigravity를 사용하지만 초기 data source는 Gemini CLI OAuth quota입니다.

## 앱 화면 구성

메인 창은 두 개의 tab으로 구성됩니다.

### Usage Dashboard

Provider별 card를 표시합니다.

- Codex
- Claude
- Antigravity

Card는 login/session state를 의도적으로 숨기고 plan, remaining quota, reset time만 보여줍니다.

### Settings

설정 항목:

- Overlay on/off
- Window close 시 system tray로 최소화
- Provider별 overlay 표시 여부
- Provider별 표시 항목:
  - Plan
  - Usage
  - Remaining
  - Reset time
- Overlay opacity

## Overlay

Overlay는 투명한 always-on-top window입니다. Desktop 위에 자연스럽게 놓이도록 card background, border, heavy UI chrome 없이 설계되었습니다.

Overlay behavior:

- Transparent background
- Large semi-transparent text
- Click-through window
- Settings에서 provider visibility 제어
- 1분마다 usage data refresh

## 개인정보와 보안

- OAuth token은 로컬에서 읽으며 UI에 표시하지 않습니다.
- Access token, refresh token, email, account ID는 로그에 남기지 않아야 합니다.
- Usage collection은 local-first이며 provider별로 분리되어 있습니다.
- Gemini OAuth token refresh는 가능한 경우 refresh된 credential을 로컬 Gemini credential file에 다시 씁니다.
- Repository, issue, pull request, build log에 민감정보가 포함되지 않도록 확인해야 합니다.

## 알려진 제한 사항

- Antigravity quota는 현재 Gemini CLI OAuth quota 경로를 통해 가져옵니다.
- Gemini API key와 Vertex AI auth mode는 현재 personal quota window source로 사용할 수 없습니다.
- Claude server quota가 연결되지 않으면 local token history만 표시될 수 있습니다.
- Portable build는 강제 종료 시 `%LOCALAPPDATA%/Temp/` 아래에 임시 extraction folder를 남길 수 있습니다.
- Electron은 정상 동작 중에도 Task Manager에 여러 helper process를 표시합니다.
- README screenshot/GIF는 아직 포함되어 있지 않습니다.

## Output

Portable executable:

```text
dist-app/TokenMonitor-<version>-x64.exe
```

Build configuration:

- `productName`: `Token Monitor`
- `executableName`: `TokenMonitor`
- `artifactName`: `TokenMonitor-${version}-${arch}.${ext}`

File name과 build artifact name은 English로 유지합니다.

## 중요 Local Paths

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

## Troubleshooting

### Codex Usage Is Not Available

Codex가 설치되어 있고 `codex.exe`가 기본 경로에 있는지 확인하거나 `CODEX_CLI_PATH`를 설정합니다.

### Claude Shows Server Quota Not Linked

Claude login command를 실행하고 browser authentication을 완료합니다.

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

Local log만 사용 가능한 경우 Token Monitor는 local token history를 표시할 수 있지만 server quota remaining percentage는 표시할 수 없습니다.

### Antigravity Usage Is Not Available

Gemini CLI Google OAuth로 로그인합니다. 현재 quota collector에는 API key와 Vertex AI mode만으로는 충분하지 않습니다.

### Portable App Leaves Temporary Files

Portable build는 강제 종료 후 temporary extraction folder를 남길 수 있습니다. `%LOCALAPPDATA%/Temp/` 아래의 오래된 Token Monitor temp folder를 정리하면 disk space를 회복할 수 있습니다.

### Multiple Processes In Task Manager

Electron은 Task Manager에 여러 helper process를 표시합니다. 이는 정상입니다. Single-instance lock은 여러 main app instance와 중복 tray icon을 방지합니다.

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

## Contributing / Support

아직 별도의 `CONTRIBUTING.md`와 `CODE_OF_CONDUCT.md`는 없습니다. Issue나 pull request를 열기 전에 민감정보가 포함되지 않았는지 확인해 주세요.

Bug report나 feature request를 작성할 때는 다음 정보를 포함하면 좋습니다.

- OS version
- App/exe version
- Provider name
- 실행한 command
- 민감정보를 제거한 error message 또는 screenshot

## License

MIT

---

# Token Monitor

Windows desktop app for checking Codex, Claude, and Antigravity quota at a glance.

Token Monitor is an Electron + React app that reads local LLM account/session data and shows the current plan, remaining quota, and reset time in a compact dashboard and transparent always-on-top overlay. OAuth access tokens, refresh tokens, account emails, and account IDs should not be shown in the UI or written to logs.

The current app/exe version is managed by the `version` field in `package.json`. The project milestone policy is managed in the local `RELEASE_VERSION_POLICY.md` document.

## Quick Start

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

## Features

- Codex quota dashboard
- Claude quota dashboard
- Antigravity quota dashboard through the Gemini CLI OAuth quota path
- Transparent always-on-top usage overlay
- Per-provider overlay visibility settings
- Overlay opacity setting
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

## Privacy And Security

- OAuth tokens are read locally and are not displayed in the UI.
- The app should not log access tokens, refresh tokens, emails, or account IDs.
- Usage collection is local-first and provider-specific.
- Gemini OAuth token refresh writes the refreshed credential back to the local Gemini credential file when possible.
- Sensitive data should not be included in repository history, issues, pull requests, or build logs.

## Known Limitations

- Antigravity quota is currently collected through the Gemini CLI OAuth quota path.
- Gemini API-key and Vertex AI auth modes are not supported as personal quota window sources.
- Claude may show only local token history when server quota is not linked.
- Portable builds can leave temporary extraction folders under `%LOCALAPPDATA%/Temp/` after forced termination.
- Electron normally shows multiple helper processes in Task Manager.
- README screenshots or GIFs are not included yet.

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

Electron shows multiple helper processes in Task Manager. That is normal. The single-instance lock prevents multiple main app instances and duplicate tray icons.

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

## Contributing / Support

This repository does not include separate `CONTRIBUTING.md` or `CODE_OF_CONDUCT.md` files yet. Before opening an issue or pull request, make sure it does not include sensitive account or token data.

Useful bug report or feature request details:

- OS version
- App/exe version
- Provider name
- Command that was run
- Error message or screenshot with sensitive data removed

## License

MIT
