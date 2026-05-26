# Token Monitor

Windows에서 Codex, Claude, Antigravity quota 상태를 한눈에 확인하는 Electron + React 데스크톱 앱입니다.

Token Monitor는 로컬 LLM 계정/세션 데이터를 읽어 현재 플랜, 남은 quota, reset 시간을 compact dashboard와 투명 always-on-top overlay로 보여줍니다. OAuth access token, refresh token, account email, account ID는 UI에 표시하지 않으며 로그에도 남기지 않는 것을 원칙으로 합니다.

이 저장소는 Token Monitor의 Electron + React 소스 코드입니다. 앱/exe 릴리스 버전은 `package.json`의 `version` 값으로 관리하며, 프로젝트 milestone과 버전 단위 정책은 `RELEASE_VERSION_POLICY.md`를 기준으로 관리합니다.

## UI Preview

스크린샷과 GIF는 추가 예정입니다.

| 화면 | 미리보기 |
| --- | --- |
| Dashboard | 이미지 추가 예정 |
| Settings | 이미지 추가 예정 |
| Overlay | 이미지 추가 예정 |

## Download And Run

배포용 portable exe는 GitHub Releases 또는 `dist-app/` build output 기준으로 제공합니다.

1. `TokenMonitor-<version>-x64.exe` 파일을 다운로드합니다.
2. 원하는 위치에 파일을 둡니다.
3. exe를 실행합니다.
4. provider별 준비 사항을 완료한 뒤 dashboard와 overlay에서 quota 상태를 확인합니다.

Portable build 특성:

- 별도 installer 없이 실행할 수 있습니다.
- Output file name은 English를 유지합니다.
- 강제 종료 시 `%LOCALAPPDATA%/Temp/` 아래에 임시 extraction folder가 남을 수 있습니다.

## Provider 준비 사항

Token Monitor는 provider별 로컬 인증/세션 정보를 사용합니다. 앱은 quota 확인에 필요한 로컬 파일과 CLI flow를 읽지만, 민감정보를 UI에 표시하지 않아야 합니다.

| Provider | Quota source | 준비 상태 |
| --- | --- | --- |
| Codex | Local Codex app/server usage flow | Codex desktop 또는 local CLI 필요 |
| Claude | Claude Code CLI OAuth + local log fallback | Claude Code OAuth login 필요 |
| Antigravity | Gemini CLI Google OAuth quota path | Gemini CLI Google OAuth login 필요 |

### Codex

Codex desktop/local CLI 환경이 필요합니다.

기본 실행 파일 경로:

```text
%LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe
```

실행 파일 경로를 직접 지정하려면 `CODEX_CLI_PATH`를 설정합니다.

### Claude

Claude server quota를 확인하려면 Claude Code CLI OAuth login이 필요합니다.

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

Local Claude data paths:

```text
%USERPROFILE%/.claude/
%USERPROFILE%/.claude.json
```

Claude server quota를 사용할 수 없으면 가능한 범위에서 local token history를 표시하고 server quota는 not linked 상태로 표시합니다.

### Antigravity

Antigravity는 현재 Gemini CLI Google OAuth quota 경로를 통해 Google-side quota surface로 표시됩니다.

Local Gemini data paths:

```text
%USERPROFILE%/.gemini/settings.json
%USERPROFILE%/.gemini/oauth_creds.json
```

API key와 Vertex AI auth mode는 현재 personal quota window source로 사용할 수 없습니다.

## 주요 기능

- Codex, Claude, Antigravity quota dashboard
- Provider별 plan, remaining quota, reset time 표시
- 투명 always-on-top usage overlay
- Provider별 overlay 표시 on/off
- Overlay opacity 설정
- Close-to-tray 설정과 앱 내부 종료 확인
- System tray control
- 중복 tray icon을 방지하는 single-instance guard
- Portable Windows executable output

## 사용 방법

1. Provider별 준비 사항을 완료합니다.
2. Token Monitor를 실행합니다.
3. `Usage Dashboard`에서 provider별 quota 상태를 확인합니다.
4. `Settings`에서 overlay 표시 여부, provider 표시 항목, opacity를 조정합니다.
5. 필요하면 창을 닫아 system tray로 보내고, tray icon으로 다시 엽니다.

## 화면 구성

### Usage Dashboard

Provider별 card를 표시합니다.

- Codex
- Claude
- Antigravity

Card는 login/session state를 의도적으로 숨기고 plan, remaining quota, reset time 중심으로 보여줍니다.

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

### Overlay

Overlay는 transparent always-on-top window입니다. Desktop 위에 가볍게 얹히도록 card background, border, heavy UI chrome 없이 설계되었습니다.

Overlay behavior:

- Transparent background
- Large semi-transparent text
- Click-through window
- Settings에서 provider visibility 제어
- 1분마다 usage data refresh

## Privacy And Security

- OAuth token은 로컬에서 읽으며 UI에 표시하지 않습니다.
- Access token, refresh token, email, account ID는 로그에 남기지 않아야 합니다.
- Usage collection은 local-first이며 provider별로 분리되어 있습니다.
- Gemini OAuth token refresh는 가능한 경우 refresh된 credential을 local Gemini credential file에 다시 씁니다.
- Repository, issue, pull request, build log에 민감정보가 포함되지 않도록 확인해야 합니다.

## FAQ

### 왜 Antigravity가 Gemini CLI OAuth를 사용하나요?

현재 로컬에서 사용할 수 있고 quota window를 노출하는 Google-side quota 경로가 Gemini CLI OAuth flow이기 때문입니다. UI label은 Antigravity를 사용하지만 초기 data source는 Gemini CLI OAuth quota입니다.

### Claude가 Server Quota Not Linked로 보이는 이유는 무엇인가요?

Claude Code CLI OAuth server quota를 사용할 수 없을 때 표시됩니다. 이 경우 local log 기반 token history만 표시될 수 있습니다.

### Overlay가 클릭되지 않는 것이 정상인가요?

정상입니다. Overlay는 desktop 위에 정보를 보여주기 위한 click-through window로 설계되었습니다.

### Task Manager에 여러 process가 보이는 이유는 무엇인가요?

Electron 앱은 renderer, utility, helper process를 여러 개 표시할 수 있습니다. Single-instance guard는 여러 main app instance와 중복 tray icon을 방지합니다.

### Portable app이 임시 파일을 남기면 어떻게 하나요?

강제 종료 후 `%LOCALAPPDATA%/Temp/` 아래에 남은 오래된 Token Monitor temp folder를 정리하면 됩니다.

## Troubleshooting

### Codex Usage Is Not Available

Codex가 설치되어 있고 `codex.exe`가 기본 경로에 있는지 확인하거나 `CODEX_CLI_PATH`를 설정합니다.

### Claude Shows Server Quota Not Linked

Claude login command를 실행하고 browser authentication을 완료합니다.

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

### Antigravity Usage Is Not Available

Gemini CLI Google OAuth로 로그인합니다. API key와 Vertex AI mode만으로는 현재 quota collector에 충분하지 않습니다.

## Known Limitations

- Antigravity quota는 현재 Gemini CLI OAuth quota path를 통해 가져옵니다.
- Gemini API key와 Vertex AI auth mode는 현재 personal quota window source로 사용할 수 없습니다.
- Claude server quota가 연결되지 않으면 local token history만 표시될 수 있습니다.
- README screenshot/GIF는 아직 포함되어 있지 않습니다.

## For Developers

요구 사항:

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

This repository contains the Electron + React source code for Token Monitor. The app/exe release version is managed by the `version` field in `package.json`, and project milestone/version-unit policy is managed in `RELEASE_VERSION_POLICY.md`.

## UI Preview

Screenshots and GIFs will be added later.

| View | Preview |
| --- | --- |
| Dashboard | Image to be added |
| Settings | Image to be added |
| Overlay | Image to be added |

## Download And Run

Portable exe builds are provided through GitHub Releases or the `dist-app/` build output.

1. Download `TokenMonitor-<version>-x64.exe`.
2. Place the file wherever you want to run it.
3. Run the executable.
4. Complete the provider prerequisites, then check quota status in the dashboard and overlay.

Portable build notes:

- It runs without a separate installer.
- Output file names stay in English.
- Forced termination can leave temporary extraction folders under `%LOCALAPPDATA%/Temp/`.

## Provider Prerequisites

Token Monitor uses local authentication/session data per provider. The app reads local files and CLI flows needed for quota checks, but sensitive data should not be shown in the UI.

| Provider | Quota source | Required setup |
| --- | --- | --- |
| Codex | Local Codex app/server usage flow | Codex desktop or local CLI |
| Claude | Claude Code CLI OAuth + local log fallback | Claude Code OAuth login |
| Antigravity | Gemini CLI Google OAuth quota path | Gemini CLI Google OAuth login |

### Codex

Codex desktop/local CLI environment must be available.

Default executable path:

```text
%LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe
```

Set `CODEX_CLI_PATH` to override the executable path.

### Claude

Claude Code CLI OAuth login is required for Claude server quota.

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

Local Claude data paths:

```text
%USERPROFILE%/.claude/
%USERPROFILE%/.claude.json
```

If Claude server quota is not available, Token Monitor shows local token history where possible and marks server quota as not linked.

### Antigravity

Antigravity is currently displayed through the Gemini CLI Google OAuth quota path as a Google-side quota surface.

Local Gemini data paths:

```text
%USERPROFILE%/.gemini/settings.json
%USERPROFILE%/.gemini/oauth_creds.json
```

API-key and Vertex AI auth modes are not supported as personal quota window sources yet.

## Features

- Codex, Claude, and Antigravity quota dashboard
- Provider plan, remaining quota, and reset time display
- Transparent always-on-top usage overlay
- Per-provider overlay visibility
- Overlay opacity setting
- Close-to-tray setting and in-app exit confirmation
- System tray controls
- Single-instance guard to prevent duplicate tray icons
- Portable Windows executable output

## How To Use

1. Complete the provider prerequisites.
2. Run Token Monitor.
3. Check provider quota status in `Usage Dashboard`.
4. Adjust overlay visibility, provider display items, and opacity in `Settings`.
5. Close the main window to keep the app in the system tray, then reopen it from the tray icon when needed.

## App Layout

### Usage Dashboard

Shows one card per provider:

- Codex
- Claude
- Antigravity

Cards intentionally hide login/session state and focus on plan, remaining quota, and reset time.

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

### Overlay

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

## FAQ

### Why does Antigravity use Gemini CLI OAuth?

The current locally available Google-side quota path that exposes quota windows is the Gemini CLI OAuth flow. The UI uses the Antigravity label while the initial data source remains Gemini CLI OAuth quota.

### Why does Claude show Server Quota Not Linked?

This appears when Claude Code CLI OAuth server quota is not available. In that case, only local token history may be shown.

### Is it normal that the overlay is not clickable?

Yes. The overlay is designed as a click-through window for desktop quota visibility.

### Why are there multiple processes in Task Manager?

Electron apps can show multiple renderer, utility, and helper processes. The single-instance guard prevents multiple main app instances and duplicate tray icons.

### What should I do if the portable app leaves temporary files?

Clean old Token Monitor temp folders under `%LOCALAPPDATA%/Temp/` after forced termination.

## Troubleshooting

### Codex Usage Is Not Available

Check that Codex is installed and that `codex.exe` exists at the expected path, or set `CODEX_CLI_PATH`.

### Claude Shows Server Quota Not Linked

Run the Claude login command and complete browser authentication:

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

### Antigravity Usage Is Not Available

Sign in with Gemini CLI Google OAuth. API-key and Vertex AI modes are not enough for the current quota collector.

## Known Limitations

- Antigravity quota is currently collected through the Gemini CLI OAuth quota path.
- Gemini API-key and Vertex AI auth modes are not supported as personal quota window sources.
- Claude may show only local token history when server quota is not linked.
- README screenshots or GIFs are not included yet.

## For Developers

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
