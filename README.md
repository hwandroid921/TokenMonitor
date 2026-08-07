# Token Monitor

> Windows에서 ChatGPT, Claude, Gemini, Antigravity 사용량과 quota 상태를 한 화면에서 확인하는 데스크톱 앱입니다.

Token Monitor는 로컬 LLM 계정/세션 데이터를 읽어 현재 플랜, 남은 quota, reset 시간을 compact dashboard와 투명 always-on-top overlay로 보여줍니다. 사용자가 여러 계정을 빠르게 구분할 수 있도록 provider가 제공하는 이름, 닉네임, 이메일을 검토된 계정 식별 정보로 UI에 표시할 수 있습니다. OAuth access token, refresh token, credential contents, provider-internal account ID는 UI와 로그에 노출하지 않습니다.

이 문서는 프로젝트의 최종 동작 상태를 기준으로 작성합니다. 일반 README와 사용자 문서는 개별 수정 이력을 나열하지 않으며, 버전 단위 변경 사항은 [RELEASE_VERSION_POLICY.md](docs/RELEASE_VERSION_POLICY.md)의 Release History에만 기록합니다.

## 현재 버전

- App/exe version: `0.9.3`
- Current milestone line: `0.9.x` (pre-1.0 development line)
- Portable artifact policy: portable exe packaging is reserved for milestone versions such as `0.3.0`, `0.4.0`, or later `MINOR.0` / `MAJOR.0` release points unless explicitly requested.
- Output naming policy: build artifact names stay in English.

## 주요 기능

- ChatGPT, Claude, Google/Gemini quota 상태를 provider card로 표시
- 현재 플랜, 사용량, 남은 quota, reset 시간을 compact dashboard에 표시
- 투명 always-on-top overlay로 주요 사용량 정보를 화면 위에 표시
- 시스템 트레이 최소화와 단일 인스턴스 실행 지원
- Claude와 Antigravity CLI 설치/로그인 흐름을 앱 버튼에서 시작
- Gemini Apps Usage Limits 창을 앱 버튼에서 열고 표시 가능한 5시간/주간 한도 요약을 캐시
- Node.js/npm이 없을 때 앱 안에서 Node.js 다운로드 페이지 열기
- 이름, 닉네임, 이메일을 계정 구분이 필요한 UI에 표시할 수 있음
- access token, refresh token, credential contents, provider-internal account ID는 UI와 로그에서 제외

## 주요 화면

### 사용량 대시보드

대시보드는 ChatGPT, Claude, Gemini 카드를 보여줍니다. Gemini 카드는 사용자의 Gemini 사용량 페이지에서 확인한 구독 플랜과 Gemini Apps 한도, Antigravity CLI에서 확인한 Antigravity 5시간 한도를 별도 항목으로 보여줍니다. 각 카드는 provider별 플랜, quota, reset 상태를 표시하고, provider가 검토 가능한 값을 제공하면 이름, 닉네임, 이메일을 계정 구분 정보로 함께 표시할 수 있습니다. 연동이 필요한 경우에는 카드 안에서 필요한 조치를 안내합니다.

### 설정

Settings에서는 ChatGPT 항목 아래의 Codex 연결 상태와 실행 경로 확인·검증·자동 복원, overlay 켜기/끄기, 창 닫기 동작, provider별 overlay 표시 여부, provider별 표시 항목, overlay 투명도를 조정할 수 있습니다.

### 오버레이

Overlay는 primary display의 오른쪽 아래 근처에 표시되는 투명 always-on-top 창입니다. 클릭을 방해하지 않으면서 dashboard와 같은 provider 필드를 간단하게 보여줍니다.

## 실행 전 요구사항

| 항목 | 필요 여부 | 설명 |
| --- | --- | --- |
| Windows | 필수 | Windows 데스크톱 앱으로 실행됩니다. |
| Codex Desktop | ChatGPT 사용량 수집 시 필수 | ChatGPT/Codex 사용량 수집에는 Codex Desktop 설치와 로그인이 필요합니다. |
| Node.js/npm | Claude, Antigravity CLI 설정 시 필수 | 앱의 `Claude CLI 설치 및 로그인`, `Antigravity CLI 설치 및 로그인` 버튼이 `npx`를 사용합니다. |
| Claude Pro/Max 이상 계정 | Claude server quota 측정 시 필수 | Pro 이상 플랜 계정에서 Claude Code OAuth usage quota를 읽을 수 있습니다. Pro 미만 계정은 server quota 측정 대상이 아닐 수 있습니다. |
| Claude Code OAuth login | Claude server quota 확인 시 필수 | Pro 이상 계정으로 앱 버튼 또는 `npx -y @anthropic-ai/claude-code auth login --claudeai` 명령을 진행합니다. |
| Gemini Apps 로그인 | Gemini Apps 한도 확인 시 필요 | 로그인 전에는 `Gemini 로그인` 버튼을 사용하고, 로그인 확인 후에는 `사용량 확인` 버튼으로 Usage Limits 화면을 열어 수집합니다. |
| Antigravity 실행 상태 | Antigravity local fallback 사용 시 필요 | CLI 수집이 안 될 때 실행 중인 Antigravity local server를 fallback으로 확인합니다. |

Node.js/npm이 없으면 Claude 또는 Gemini 카드에서 안내가 표시되며, 하단의 `Node.js 설치` 버튼으로 공식 Node.js 다운로드 페이지를 열 수 있습니다.

## 다운로드 및 실행 방법

Token Monitor는 Windows 실행 파일로 배포됩니다.

1. 배포된 `TokenMonitor-*-x64.exe` 또는 `TokenMonitor.exe` 파일을 준비합니다.
2. 포터블 실행 파일인 경우 원하는 위치에 파일을 둡니다.
3. `TokenMonitor.exe`를 실행합니다.
4. Windows 보안 경고가 표시되면 파일 출처를 확인한 뒤 실행을 허용합니다.

개발 중 생성되는 unpacked 빌드는 아래 경로에서 실행할 수 있습니다.

```text
dist-app/win-unpacked/TokenMonitor.exe
```

## 사용 방법

1. `TokenMonitor.exe`를 실행합니다.
2. 대시보드에서 ChatGPT, Claude, Gemini 카드를 확인합니다.
   - 각 카드는 `로그인`, `플랜`, `5시간`, `주간` 순서로 표시합니다.
   - 로그인된 계정에서 검토된 이메일을 제공하면 `로그인` 값에 이메일을 표시하며, 이메일이 없으면 로그인 상태 문구를 표시합니다.
3. ChatGPT 사용량이 필요하면 Codex Desktop 설치와 로그인을 먼저 완료합니다.
4. Claude server quota가 필요하면 Claude Pro/Max 이상 계정으로 `Claude CLI 설치 및 로그인` 버튼을 누르고 브라우저 인증을 완료합니다.
5. Gemini Apps 한도는 `Gemini 로그인`으로 로그인 상태를 확인한 뒤 `사용량 확인` 버튼으로 Usage Limits 화면을 열어 확인합니다.
6. Antigravity quota가 필요하면 `Antigravity CLI 설치 및 로그인` 버튼을 눌러 `antigravity-usage` CLI 설정과 Google 로그인을 진행합니다.
7. Node.js/npm 안내가 표시되면 `Node.js 설치` 버튼으로 Node.js를 설치한 뒤 앱을 다시 실행합니다.
8. Codex 실행 파일을 자동으로 찾지 못하면 Settings의 `Codex Desktop` 영역에서 `codex.exe` 경로를 선택하고 연결 테스트를 진행합니다.
9. Settings에서 overlay 표시 여부와 provider별 표시 항목을 조정합니다.
10. 창을 닫으면 설정에 따라 시스템 트레이로 최소화되거나 종료 확인 창이 표시됩니다.

## Provider 지원

| Provider | Quota source | Requirement |
| --- | --- | --- |
| ChatGPT | Local ChatGPT/Codex app-server usage flow | Codex Desktop install and login |
| Claude | Claude Code CLI OAuth, with local log fallback | Node.js/npm for CLI setup, Claude Pro/Max or higher account, and Claude Code OAuth login |
| Gemini | Google AI plan, Gemini Apps Usage Limits, and Antigravity 5-hour quota | Gemini Apps login for Gemini limits, Node.js/npm for Antigravity CLI setup, or Antigravity running for local fallback |

## 사용량 수집 경로

Token Monitor는 로컬 세션과 provider 소유 quota endpoint에서 사용량 데이터를 읽습니다. 사용자가 앱에 secret 값을 직접 붙여넣도록 요구하지 않습니다.

계정 식별 정보는 provider별 응답과 로그인 흐름에서 확인된 이름, 닉네임, 이메일 중 실제 UI에서 계정 구분에 필요한 값만 사용합니다. 일반 대시보드와 개발자 모드의 로그인 항목은 검토된 이메일을 우선 표시하고 이메일이 없으면 로그인 상태 문구를 표시합니다. 인증 토큰이나 provider-internal account ID와 구분하며 application logs와 raw parser diagnostics에는 기록하지 않습니다.

### ChatGPT

1. Codex Desktop이 설치되어 있고 로그인되어 있어야 합니다.
2. 앱은 Codex 실행 파일을 통해 local Codex usage flow를 호출합니다.
3. 앱은 hashed local install folder를 포함한 알려진 Codex Desktop 실행 경로를 자동 탐색합니다.
4. 자동 탐색이 실패하면 일반 대시보드의 `경로 설정` 버튼으로 Settings의 `ChatGPT > Codex 연결` 영역을 엽니다.
5. Settings에서는 파일 선택 또는 직접 입력한 `codex.exe`를 app-server 연결로 검증한 뒤 로컬 provider 설정에 저장할 수 있습니다.
6. `자동 설정으로 복원`은 사용자 지정 경로를 제거하고 Codex Desktop 설치 경로 탐색으로 돌아갑니다.
7. 5시간과 주간 창은 `primary`/`secondary` 위치가 아니라 실제 window duration으로 구분합니다.
8. renderer에는 plan, quota window, remaining amount, reset time처럼 표시 가능한 필드만 전달합니다.

Default executable path:

```text
%LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe
```

Displayed fields:

- Plan
- 5-hour quota
- Weekly quota

### Claude

Claude server quota는 Claude Pro/Max 이상 계정에서 Claude Code CLI OAuth가 가능할 때 읽습니다. Pro 미만 계정은 server quota 측정 대상이 아닐 수 있으며, 이 경우 local Claude JSONL logs는 fallback/history metadata로만 사용합니다.

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

### Gemini / Antigravity

Gemini 카드는 Gemini 사용량 페이지에서 파싱한 구독 플랜을 우선 표시하고, Gemini Apps 한도와 Antigravity 한도를 별도 항목으로 구분합니다.

Gemini 구독 플랜과 Gemini Apps 한도는 `https://gemini.google.com/usage`에서 확인되는 플랜, 5시간 사용량, 주간 사용량, 초기화 시간을 기준으로 합니다. 이 한도는 Gemini Apps 웹/모바일 사용량에 해당하며 Gemini CLI, Gemini API, Code Assist, Antigravity quota와 같은 데이터로 취급하지 않습니다.

Displayed Gemini Apps fields:

- 5-hour remaining usage and reset time
- Weekly remaining usage and reset time

앱의 `Gemini 로그인` 버튼은 대시보드를 덮는 Gemini 브라우저 패널에서 `gemini.google.com`을 열고, 로그인 상태가 확인되면 패널을 닫은 뒤 버튼을 `사용량 확인`으로 전환합니다. `사용량 확인` 버튼은 같은 대시보드 overlay 패널에서 `https://gemini.google.com/usage`를 직접 열며, 확인 중에는 사용량 페이지 위를 Electron 진행 오버레이가 덮어 조작을 막습니다. 화면의 현재 사용량 `%`, 초기화 시간, 주간 한도, 웹 페이지에 표시되는 `Pro` 같은 플랜 후보가 확인되면 display-safe 캐시로 저장하고 패널과 진행 오버레이를 닫습니다. 파서는 화면 텍스트와 `aria-label`, `title`, progress/value 속성의 `%` 후보를 함께 확인하며, 확인된 후보는 카드 상세와 `%APPDATA%/token-monitor/gemini-apps-parse-debug.json`에서 확인할 수 있습니다. Google 공식 공개 API가 확인되기 전까지 Gemini CLI 또는 Antigravity CLI 값을 Gemini Apps 한도로 대체하지 않습니다.

Antigravity quota는 `antigravity-usage`를 먼저 사용합니다. 앱의 통합 설정 버튼은 Node.js/npm이 필요하며, `npx`를 통해 CLI 설치/실행과 로그인을 시작합니다. CLI 수집이 불가능해도 Antigravity가 실행 중이면 embedded local fallback을 계속 시도합니다.

Antigravity 5시간 한도는 모델별 quota 응답의 `remainingFraction` 또는 `remainingPercentage`와 `resetTime`으로 표시합니다.

1. `antigravity-usage` Google method

   ```powershell
   npx -y antigravity-usage login
   npx -y antigravity-usage quota --json --method google --refresh
   ```

2. `antigravity-usage` auto/local method

   ```powershell
   npx -y antigravity-usage quota --json --method auto --refresh
   ```

3. Embedded fallback collectors

   Token Monitor keeps the embedded Antigravity local probe and Gemini CLI OAuth quota path as fallback collectors.

Local paths:

```text
%APPDATA%/antigravity-usage/
%USERPROFILE%/.gemini/settings.json
%USERPROFILE%/.gemini/oauth_creds.json
```

Displayed fields:

- Plan
- Gemini Apps 5-hour quota
- Gemini Apps weekly quota
- Antigravity 5-hour quota
- Prompt Credits, when available from `antigravity-usage` or the local Antigravity API

Antigravity/Gemini plan names are normalized from the OAuth or local provider response into four user-facing tiers:

- Free
- Plus
- Pro
- Ultra

API-key and Vertex AI auth modes are not treated as personal quota window sources.

## 오버레이와 시스템 트레이

Overlay behavior:

- Transparent always-on-top window
- Bold gray text with enlarged dark text stroke and layered shadow
- Same provider fields as the dashboard
- Per-provider visibility control
- Refreshes usage data every minute

System tray behavior:

- Tray icon click opens the main window.
- Close-to-tray가 켜져 있으면 main window close 시 tray로 최소화됩니다.
- Close-to-tray가 꺼져 있으면 close 시 in-app exit confirmation dialog가 표시됩니다.
- Full exit은 main window, overlay, tray icon, active child processes를 종료합니다.
- Single-instance lock이 duplicate main app instance와 duplicate tray icon을 방지합니다.

## 개인정보와 보안

- OAuth access token과 refresh token은 provider quota request가 필요할 때 로컬에서만 읽습니다.
- 사용자가 현재 모니터링 중인 계정을 빠르게 구분할 수 있도록 이름, 닉네임, 이메일을 대시보드나 오버레이 같은 사용자 UI에 표시할 수 있습니다.
- 이름, 닉네임, 이메일은 개인정보로 취급하며 provider 출처, 계정 구분 필요성, 표시 위치, 값이 없을 때의 동작을 검토한 필드만 사용합니다.
- 계정 식별 정보는 일반 UI와 개발자 모드의 전용 계정 요약에서 사용할 수 있습니다. 불필요하게 저장하거나 application logs, raw parser diagnostics, analytics, build logs, error messages에 기록하지 않습니다.
- Provider collector는 renderer에서 실제로 사용하는 계정 식별 정보와 quota 데이터만 반환해야 합니다.
- Access token, refresh token, API key, session secret, credential contents, raw provider payload, provider-internal account ID는 UI와 로그에 노출하지 않습니다.
- Screenshots, issues, pull requests, README examples, test fixtures에는 실제 개인정보나 secret을 넣지 않습니다. 예시는 명확한 가상 값을 사용합니다.

## 자주 묻는 질문

### ChatGPT 사용량이 보이지 않습니다.

Codex Desktop이 설치되어 있고 로그인되어 있는지 확인하세요. 앱이 Codex 실행 파일을 찾지 못하면 ChatGPT 카드의 `경로 설정`을 눌러 Settings의 `ChatGPT > Codex 연결`에서 `codex.exe` 경로를 선택하고 연결 테스트를 진행하세요. 사용자 지정 경로가 더 이상 유효하지 않으면 `자동 설정으로 복원`으로 기본 탐색을 다시 사용할 수 있습니다.

### Claude server quota가 연결되지 않습니다.

Claude server quota는 Claude Pro/Max 이상 계정에서 측정할 수 있습니다. Node.js/npm을 설치한 뒤 Pro 이상 계정으로 앱의 `Claude CLI 설치 및 로그인` 버튼을 누르고 브라우저 인증을 완료하세요. 직접 실행할 때는 아래 명령을 사용할 수 있습니다.

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

### Gemini 한도가 보이지 않습니다.

Gemini Apps 5시간/주간 한도는 `Gemini 로그인` 후 표시되는 `사용량 확인` 버튼으로 Usage Limits 화면을 열어야 수집됩니다. 로그인 또는 사용량 확인 창이 열린 상태에서는 대시보드 새로고침으로 현재 화면을 다시 읽습니다. Gemini CLI, Gemini API, Code Assist, Antigravity CLI의 quota는 Gemini Apps 한도로 대체 표시하지 않습니다.

### Antigravity 사용량이 보이지 않습니다.

Node.js/npm을 설치한 뒤 앱의 `Antigravity CLI 설치 및 로그인` 버튼을 실행하세요. Antigravity가 이미 실행 중이면 local language server fallback을 통해 수집을 계속 시도할 수 있습니다.

### Node.js 설치 버튼이 보이는 이유는 무엇인가요?

Claude와 Antigravity CLI 설정 버튼은 `npx`를 사용합니다. 시스템에서 Node.js/npm을 찾을 수 없으면 앱이 Node.js 설치 안내와 다운로드 버튼을 표시합니다.

### 작업 관리자에 프로세스가 여러 개 보입니다.

Electron 앱은 여러 helper process를 사용합니다. 이는 정상 동작입니다. Single-instance lock은 main app instance와 tray icon이 중복 생성되는 것을 방지합니다.

### 포터블 앱 실행 후 임시 파일이 남습니다.

강제 종료가 발생하면 `%LOCALAPPDATA%/Temp/` 아래에 extraction folder가 남을 수 있습니다. 오래된 Token Monitor temp folder를 삭제하면 디스크 공간을 회수할 수 있습니다.

## 개발

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

Developer mode for local debugging:

```powershell
Copy-Item .env.development.example .env
# Set TOKEN_MONITOR_DEV_MODE=1 in .env
npm run dev
```

Developer mode is for debugging provider collection, Gemini parsing, packaged exe reproduction, and current dashboard state review in the current local development environment. The app reads `TOKEN_MONITOR_DEV_MODE` from the process environment first and then from local `.env` files near the current working directory, local executable path, or portable executable source folder. When enabled, the `개발 환경 상태` section explains whether developer mode is active, which setting source was applied, the loaded environment filename, the number of candidate locations checked, total diagnostic duration, snapshot time, and each provider cache's age and validity period. Only the environment filename and candidate count are shown; full local paths and environment file contents remain excluded. The developer-only tab also shows collection checks, structured Gemini parser markers, current dashboard state, and reviewed names, nicknames, and emails for account distinction. Account identity is extracted only from allowlisted provider fields. Tokens, provider-internal account IDs, credential file contents, raw CLI output, raw page snippets, and raw provider responses remain excluded.

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
npm run package:portable
```

Unpacked package:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run package:unpacked
```

## 프로젝트 구조

```text
electron/
  main.ts              Electron lifecycle, windows, tray, IPC
  codex-usage.ts       ChatGPT/Codex usage collector
  claude-usage.ts      Claude OAuth/local log collector
  gemini-apps-usage.ts Gemini Apps Usage Limits parser and cache
  gemini-usage.ts      Google/Gemini plan and Antigravity quota collector
  cli-session.ts       CLI login/session checks
  overlay-settings.ts  Overlay settings schema and migration
  preload.cjs          Packaged preload bridge

src/
  main.tsx             React dashboard, settings, overlay view
  styles.css           App and overlay styles
  global.d.ts          Shared renderer types

build/
  icon.ico             Windows app/tray icon

./
  TokenMonitor-*-x64.exe

dist-app/
  win-unpacked/
```

## 라이선스

`package.json` metadata는 MIT license로 설정되어 있습니다. 별도 LICENSE 파일이 추가되면 이 섹션에서 해당 파일을 함께 안내합니다.

## 릴리즈 노트

Version-level changes are tracked in [RELEASE_VERSION_POLICY.md](docs/RELEASE_VERSION_POLICY.md).
