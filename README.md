# Token Monitor

> ChatGPT, Claude, Gemini 및 Antigravity의 남은 사용량과 초기화 시간을 한눈에 확인하는 데스크톱 앱입니다.

Token Monitor는 여러 AI 서비스의 로컬 로그인 상태와 제공자가 노출하는 사용량 정보를 읽어, 플랜·사용량·잔여량·초기화 시간을 하나의 대시보드와 화면 우측 하단 오버레이로 정리합니다. 로그인 계정은 설정에서 마스킹 이메일을 확인해 별칭을 지정하며, 대시보드와 오버레이에는 별칭만 표시합니다.

**지원 환경:** Windows x64 · **정식 릴리즈:** `v1.2.0` · **배포 형식:** 포터블 실행 파일 및 설치형 Windows 패키지

[릴리즈 다운로드](https://github.com/hwandroid921/TokenMonitor/releases) · [릴리즈 정책](docs/RELEASE_VERSION_POLICY.md)

## 핵심 기능

- ChatGPT/Codex, Claude, Gemini, Antigravity의 상태를 공급자 카드로 분리해 표시
- 주간 사용량을 먼저, 주기 사용량을 다음에 표시
- 설정에서 계정별 마스킹 이메일을 확인하고 별칭을 지정·변경·삭제
- 대시보드와 오버레이에는 이메일 대신 계정 별칭만 표시
- Gemini Apps와 Antigravity의 Google 계정 감지 및 별칭을 하나로 통합
- 5분 백그라운드 수집과 사용자 지정 잔여량 임계치·소진·실제 초기화 알림
- 잔여량 30% 미만과 소진 상태를 구분하는 선택형 오버레이 색상 강조
- 화면 우측 하단의 클릭 통과형 오버레이와 시스템 트레이 최소화
- Claude Code 및 Antigravity CLI의 로그인 흐름을 앱에서 시작
- Gemini Apps 사용량을 앱 내 브라우저에서 로그인·확인

## 제공자별 범위

| 제공자 | 수집 방식 | 표시 범위 | 전제 조건 |
| --- | --- | --- | --- |
| ChatGPT | Codex Desktop 로컬 app-server | 플랜, 주간/주기 사용량·잔여량·초기화 | Codex Desktop 설치 및 로그인 |
| Claude | Claude Code Status Line 최소 스냅샷 | 플랜, 주간/주기 사용량·잔여량·초기화 | Node.js/npm, Claude Code OAuth 로그인, Claude Code 응답 1회 이상 |
| Gemini Apps | Gemini 사용량 페이지의 표시 텍스트 | 플랜, 주간/주기 잔여량·초기화 | Gemini 로그인 |
| Antigravity | `antigravity-usage`, 로컬 probe, Gemini CLI OAuth fallback | 명시적으로 제공된 주간 한도 및 5시간 한도 | Node.js/npm 로그인 또는 실행 중인 Antigravity |

Gemini Apps와 Antigravity의 한도는 서로 다른 서비스의 값입니다. 한쪽의 값을 다른 쪽 한도로 대체하지 않습니다.

## 다운로드 및 실행

1. [GitHub Releases](https://github.com/hwandroid921/TokenMonitor/releases)에서 `TokenMonitor-1.2.0-x64.exe`를 다운로드합니다.
2. 포터블 파일은 원하는 폴더에 두고 실행합니다. 설치형 패키지를 받은 경우에는 설치 과정을 완료합니다.
3. Windows 보안 경고가 표시되면 게시자와 다운로드 출처를 확인한 뒤 실행을 허용합니다.
4. 대시보드에서 필요한 제공자의 연결 상태와 안내 버튼을 확인합니다.

## 실행 전 요구사항

| 항목 | 필요 대상 | 설명 |
| --- | --- | --- |
| Windows x64 | 모든 사용자 | 현재 Windows 전용으로 배포됩니다. |
| 인터넷 연결 | 사용량 새로고침 | 각 제공자 로그인·사용량 확인에 필요합니다. |
| Codex Desktop | ChatGPT | 설치 후 로그인해야 합니다. |
| Node.js LTS 및 npm | Claude, Antigravity 설정 | 앱의 CLI 로그인 버튼이 `npx`를 사용합니다. |
| Claude Code 구독 및 OAuth 로그인 | Claude | Claude Code가 Status Line 사용량 정보를 제공하는 계정이 필요합니다. |
| Gemini 로그인 | Gemini Apps | 앱 내 Gemini 로그인 후 사용량 확인을 진행합니다. |

## 첫 사용 흐름

1. Token Monitor를 실행하고 대시보드의 새로고침 버튼을 누릅니다.
2. ChatGPT는 Codex Desktop이 설치·로그인되어 있으면 자동으로 확인됩니다.
3. Claude는 **Claude CLI 설치 및 로그인**을 눌러 인증한 뒤 Claude Code에서 대화를 시작하고 첫 응답을 받습니다.
4. Gemini Apps는 **Gemini 로그인**을 완료한 뒤 **사용량 확인**을 눌러 Usage Limits 화면을 엽니다.
5. Antigravity는 **Antigravity CLI 설치 및 로그인**을 눌러 Google 인증을 완료합니다. Antigravity가 이미 실행 중이면 로컬 fallback도 시도합니다.
6. 설정 탭에서 감지된 계정의 마스킹 이메일을 확인하고 계정별 별칭을 지정합니다. Gemini Apps와 Antigravity는 하나의 Google 계정과 별칭으로 관리됩니다.
7. 오버레이와 제공자별 표시 항목을 조정합니다.
8. 사용량 알림을 켜고 5% 단위의 잔여량 임계치, Windows 알림, 전면 경고, 오버레이 색상 강조를 선택합니다.

Claude CLI를 터미널에서 직접 연결하려면 다음 명령을 사용할 수 있습니다.

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

## 설정, 오버레이 및 로컬 데이터

오버레이는 기본 디스플레이의 우측 하단에 표시되는 클릭 통과형 창입니다. 텍스트는 50% 투명도·검은 외곽선으로 표시되며, 내용에 맞춰 화면 높이의 1/3을 넘지 않도록 자동 조절됩니다.

설정 탭에서는 다음을 공급자별로 켜거나 끌 수 있습니다.

- 오버레이 표시
- 계정 별칭
- 현재 플랜
- 사용량
- 잔여량
- 초기화 시간

설정의 **계정 및 별칭 관리**에서는 ChatGPT, Claude, Google 계정을 관리합니다. Gemini Apps와 Antigravity에서 감지한 계정은 하나의 Google 계정으로 합쳐지며, 현재 계정 감지 여부와 마스킹 이메일, 사용자가 지정한 표시 이름/별칭, 감지 방식을 확인할 수 있습니다. 현재 로그인 계정의 등록을 삭제해도 공급자 로그인이나 credential은 삭제되지 않습니다.

설정의 **사용량 알림**에서는 ChatGPT, Claude, Antigravity의 자동 알림 대상을 선택하고 잔여량 5%부터 50%까지 5% 단위 임계치를 복수로 지정할 수 있습니다. 앱이 실행 중이면 Electron 메인 프로세스가 5분마다 사용량을 수집합니다. 잔여량이 선택한 임계치를 실제로 통과할 때 한 번 알리고, 모두 소진되거나 공급자의 다음 quota 주기가 실제로 확인되었을 때 별도 알림을 보냅니다.

Windows 알림, 12초 동안 표시되는 비포커스 전면 경고, 오버레이 잔여량 색상 강조는 각각 선택할 수 있습니다. Windows 네이티브 알림의 위치와 노출 시간은 Windows 알림 및 집중 지원 설정을 따릅니다. 색상 강조를 사용하면 잔여량 30% 이상은 회색, 30% 미만은 빨간색, 0%는 진한 회색과 `소진` 문구로 표시됩니다.

초기화 예정 시간이 확인되면 해당 시각 직후 사용량을 다시 수집합니다. 공급자의 reset 시각이 다음 주기로 이동하고 잔여량이 실제로 회복된 경우에만 초기화 알림을 보냅니다. 절전이나 공급자 반영 지연이 있으면 제한적으로 다시 확인합니다. Claude는 최근 Claude Code Status Line 스냅샷이 있어야 하며, Gemini Apps 웹 캐시는 자동 알림 대상이 아닙니다.

앱은 사용자 데이터 폴더에 오버레이·알림 설정, 중복 알림 방지용 표시 안전 quota 상태, Windows 사용자 계정으로 암호화한 계정 별칭 매핑, Gemini 로그인 상태와 파싱된 사용량 요약, Claude Status Line의 최소 스냅샷만 저장합니다. Gemini 웹 페이지 원문이나 디버그 스니펫은 저장하지 않습니다.

Claude Status Line은 Token Monitor가 만든 로컬 스크립트에 최소 상태 입력을 전달합니다. 이 스크립트는 표시용 모델·사용량·초기화 정보만 추려 저장하며, 원본 입력·대화 로그·자격 증명은 저장하거나 표시하지 않습니다.

## 개인정보 및 보안

- OAuth access token, refresh token, API key, provider-internal account ID 및 원본 provider payload는 UI·로그·설정·캐시에 기록하지 않습니다.
- 이메일은 수집 직후 내부 계정 식별키와 마스킹 값으로 변환하며 원문은 저장하지 않습니다.
- 마스킹 이메일은 설정의 계정 관리 화면에서만 확인할 수 있고, 대시보드와 오버레이에는 사용자가 지정한 별칭만 표시됩니다.
- 내부 계정 식별키와 마스킹 이메일·별칭 매핑은 Windows 사용자 계정 기반 암호화로 보호하며 계정 식별키는 renderer나 로그에 전달하지 않습니다.
- Gemini CLI credential 파일은 읽기 전용으로 취급하며 Token Monitor가 갱신하거나 덮어쓰지 않습니다.
- 앱은 사용량 확인에 필요한 제공자 요청만 수행하며, 별도의 Token Monitor 서버로 계정·사용량 데이터를 전송하지 않습니다.
- Claude 관련 CLI 프로세스에는 `ANTHROPIC_API_KEY`를 전달하지 않습니다.

## 문제 해결

### ChatGPT 사용량이 보이지 않습니다

Codex Desktop 설치와 로그인을 확인하세요. 앱은 일반 설치 경로, PATH, 해시된 설치 폴더를 자동 탐색합니다. 탐색에 실패하면 Windows 사용자 환경 변수 `CODEX_CLI_PATH`에 Codex 실행 파일의 전체 경로(예: `C:\Tools\codex.exe`)를 설정하고 Token Monitor를 다시 시작하세요.

### Claude 사용량이 표시되지 않습니다

Node.js LTS와 npm을 설치한 뒤 Claude Code OAuth 로그인을 완료하세요. Claude Code에서 첫 응답을 받은 뒤 대시보드를 새로고침해야 Status Line 최소 스냅샷이 생성됩니다. 사용량 정보는 Claude Code와 구독 상태가 제공하는 범위 안에서만 표시됩니다.

### Gemini Apps 한도가 보이지 않습니다

**Gemini 로그인** 후 **사용량 확인**을 다시 실행하세요. Gemini 웹 화면의 언어·구성 변경이나 사용량 값 미표시로 파싱이 실패할 수 있습니다. 이 경우 Gemini Apps 한도는 비어 있을 수 있으며 Antigravity 한도로 대체되지 않습니다.

### Antigravity 사용량이 보이지 않습니다

Node.js LTS를 설치하고 CLI 로그인 과정을 완료하세요. Antigravity가 이미 실행 중이라면 앱을 새로고침해 로컬 fallback을 다시 시도할 수 있습니다.

### Node.js 설치 안내가 표시됩니다

Claude 및 Antigravity CLI 연결에는 `npx`가 필요합니다. 안내 버튼에서 Node.js LTS를 설치한 뒤 앱을 다시 실행하세요.

### 사용량 알림이 표시되지 않습니다

설정에서 **사용량 알림 사용**과 원하는 표시 방식을 켰는지 확인하세요. 임계치 알림은 설정 후 처음 읽은 값을 기준선으로 저장하고, 이후 잔여량이 선택한 임계치를 통과할 때 발생합니다. 앱이 완전히 종료되어 있으면 백그라운드 수집과 알림은 동작하지 않으므로 시스템 트레이에서 실행 중인지 확인하세요. Windows 알림은 Windows 알림 및 집중 지원 설정의 영향을 받습니다.

## 라이선스

이 프로젝트는 [MIT License](LICENSE)로 배포됩니다.
