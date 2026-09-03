# Token Monitor

> 대표 LLM 서비스들의 잔여 사용량과 초기화 시간을 한눈에 확인하는 데스크톱 앱입니다.

Token Monitor는 여러 AI 서비스의 로컬 로그인 상태와 제공자가 제공하는 사용량 정보를 읽어, 플랜·사용량·잔여량·초기화 시간을 대시보드와 화면 우측 하단 오버레이로 표시합니다. 해당 프로그램은 ChatGPT, Claude, Gemini 유료 플랜 이상 구독 사용자를 대상으로 합니다.

**지원 환경:** Windows x64, macOS Apple Silicon · **현재 앱 버전:** `v1.5.7` · **배포 형식:** Windows 포터블 실행 파일, macOS ARM64 DMG/ZIP

[릴리즈 다운로드](https://github.com/hwandroid921/TokenMonitor/releases)

## 핵심 기능

- ChatGPT/Codex, Claude, Gemini, Antigravity의 상태를 분리해 오버레이로 표시
- 접을 수 있는 좌측 메뉴와 공급자별 세로 레인을 사용해 모델·별칭·플랜·수집 상태를 한 화면에서 비교
- 공급자별 주간·주기 잔여량, 초기화까지 남은 시간, 초기화 예정 시각을 같은 강조 수준으로 표시
- 주간 사용량, 주기 사용량 표시
- 설정에서 계정별 별칭을 지정 및 관리하여 대시보드와 오버레이에 표시해서 어떤 계정인지 빠르게 구분 가능
- 사용자 지정 수치별 잔여 사용량 알림

## 다운로드 및 실행

1. [GitHub Releases](https://github.com/hwandroid921/TokenMonitor/releases)에서 사용 중인 운영체제에 맞는 파일을 다운로드합니다.
2. Windows에서는 포터블 `.exe`를 실행합니다. macOS Apple Silicon에서는 ARM64 `.dmg` 또는 `.zip`의 앱을 Applications 폴더로 옮겨 실행합니다.
3. macOS 패키지는 Developer ID 서명과 공증 전까지 보안 경고가 표시될 수 있습니다. 파일 출처를 확인한 뒤 시스템 설정에서 실행을 허용하세요.
4. 대시보드에서 필요한 제공자의 연결 상태와 안내 버튼을 확인합니다.

## 실행 전 요구사항

| 항목 | 필요 대상 | 설명 |
| --- | --- | --- |
| Node.js LTS 및 npm | Claude, Antigravity 설정 | node.js 설치 필수 |
| Codex 또는 ChatGPT Desktop | ChatGPT | 설치 후 로그인해야 합니다. |
| Claude Code 구독 및 OAuth 로그인 | Claude | Claude Code가 Status Line 사용량 정보를 제공하는 계정이 필요합니다. |
| Gemini 로그인 | Gemini Apps | 앱 내 Gemini 로그인 후 사용량 확인을 진행합니다. |

## 유저 사용 흐름

1. Token Monitor를 실행하고 대시보드의 새로고침 버튼을 누릅니다.
2. ChatGPT는 **Codex 연결 설정**에서 실행 파일을 확인하거나 지정한 뒤 Codex 또는 ChatGPT Desktop 로그인 상태를 확인합니다.
3. Claude는 **Claude CLI 설치 및 로그인**으로 OAuth 인증을 완료한 뒤 **Status Line 새로 등록**을 누릅니다. 이 버튼은 Token Monitor 사용량 수집 스크립트를 Claude Code Status Line으로 등록하며 기존 Status Line 명령은 교체될 수 있습니다. 등록이 확인되면 버튼은 사라집니다. 등록 전에 실행 중이던 Claude Code는 모두 종료하고 새 터미널에서 `claude`를 실행해 일반 대화의 첫 응답을 받으세요. 앱은 등록 후 스냅샷 생성 전, 스냅샷 생성 후 quota 미제공, 실제 설정·수집 오류를 구분해 안내합니다.
4. Gemini Apps는 **Gemini 로그인**을 완료한 뒤 **사용량 확인**을 눌러 Usage Limits 화면을 엽니다. 화면의 `N% 사용됨`은 사용률이므로 앱은 이를 잔여량 `100-N%`로 표시합니다.
5. Antigravity는 **Antigravity CLI 로그인**을 눌러 Google 인증을 완료합니다. Antigravity가 이미 실행 중이면 로컬 fallback도 시도합니다.
6. 설정 탭에서 감지된 계정의 마스킹 이메일을 확인하고 계정별 별칭을 지정합니다. Gemini Apps와 Antigravity는 하나의 Google 계정과 별칭으로 관리됩니다.
7. 오버레이와 제공자별 표시 항목을 조정합니다.
8. 사용량 알림을 켜고 5% 단위의 잔여량 임계치, Windows 알림, 전면 경고, 오버레이 색상 강조를 선택합니다.

Claude CLI를 터미널에서 직접 연결하려면 다음 명령을 사용할 수 있습니다.

```powershell
npx -y @anthropic-ai/claude-code auth login --claudeai
```

## 설정, 오버레이 및 로컬 데이터

오버레이는 기본 디스플레이의 우측 하단에 표시되는 클릭 통과형 창입니다. 기본 레이아웃은 선택한 화면 작업 영역의 1/3 크기이며, 텍스트는 하단에 정렬됩니다. 글자 크기 또는 표시 항목이 바뀌면 렌더링된 콘텐츠에 맞춰 창이 자동으로 커지고, 작업 영역 전체를 넘지 않도록 제한됩니다. 텍스트는 50% 투명도·검은 외곽선으로 표시되며, 기본 크기는 서비스 제목 28px·상세 항목 24px입니다. 설정의 **오버레이 글자 크기** 슬라이더로 기본값의 50%부터 150%까지 조절할 수 있고, 표시 항목을 바꿔도 선택한 글자 크기는 바뀌지 않습니다. 설정의 **오버레이 위치**에서 **위치 변경**을 누르면 창 테두리가 강조되고 오버레이를 원하는 화면·위치로 드래그할 수 있으며, 우측 상단의 완료 버튼을 누르면 클릭 통과 상태로 돌아갑니다. **위치 초기화**로 기본 위치로 되돌릴 수 있습니다.

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

앱은 사용자 데이터 폴더에 오버레이·알림 설정, 중복 알림 방지용 표시 안전 quota 상태, 운영체제 보안 저장소로 암호화한 계정 별칭 매핑, Gemini 로그인 상태와 파싱된 사용량 요약, Claude Status Line의 최소 스냅샷만 저장합니다. Gemini 웹 페이지 원문이나 디버그 스니펫은 저장하지 않습니다.

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

Codex 또는 ChatGPT Desktop 설치와 로그인을 확인하세요. 앱은 일반 설치 경로, PATH, 해시된 설치 폴더를 자동 탐색합니다. 탐색에 실패하면 설정 탭의 **Codex 실행 파일 경로**에서 Windows는 `codex.exe`, macOS는 `codex` 실행 파일을 지정하고 연결을 테스트할 수 있습니다. Windows 사용자 환경 변수 `CODEX_CLI_PATH`(예: `C:\Tools\codex.exe`)도 계속 지원합니다.

### Claude 사용량이 표시되지 않습니다

Node.js LTS와 npm을 설치한 뒤 Claude Code OAuth 로그인을 완료하세요. Status Line 등록 전에 열어 둔 Claude Code 세션은 설정을 반영하지 않을 수 있으므로 모두 종료한 뒤 새 터미널에서 `claude`를 실행하세요. 일반 대화의 첫 응답 후 대시보드를 새로고침하면 Status Line 최소 스냅샷이 생성됩니다. 스냅샷이 계속 생성되지 않으면 `claude --debug`로 첫 Status Line 호출의 실행 오류를 확인하세요. `claude -p` 같은 비대화형 호출은 Status Line을 갱신하지 않을 수 있습니다. 5시간·주간 한도는 Claude.ai Pro/Max 구독에서 첫 API 응답 이후 Claude Code가 제공할 때만 표시됩니다.

Claude 카드의 **계정** 항목은 별칭과 로그인 상태를 한 줄로 표시합니다. 별칭은 설정의 **계정 및 별칭 관리**에서 바꾸며, 로그인 상태와 별도의 계정 행은 표시하지 않습니다. 카드에 표시되는 안내는 다음 상태에 맞춰 달라집니다.

| 상태 | 필요한 조치 |
| --- | --- |
| Claude CLI 또는 Node.js/npm을 찾을 수 없음 | Node.js LTS·npm을 설치하고 **Claude CLI 설치 및 로그인**을 실행합니다. |
| Claude CLI 로그아웃 | 버튼으로 Claude.ai OAuth 로그인을 완료한 뒤 새로고침합니다. |
| Status Line 미등록 또는 설정 오류 | **Status Line 새로 등록**을 실행합니다. 설정 파일 오류라면 권한·형식을 확인합니다. |
| 등록 완료, 실행 스냅샷 없음 | 기존 Claude Code를 모두 종료하고 새 터미널에서 `claude`를 실행해 일반 대화의 첫 응답을 받습니다. |
| 스냅샷 읽기 또는 형식 오류 | Token Monitor와 Claude Code를 다시 시작하거나 업데이트하고, `claude --debug`로 Status Line 오류를 확인합니다. |
| 스냅샷은 있으나 quota 없음 | Claude.ai Pro/Max 구독과 OAuth 로그인, 새 대화의 첫 API 응답을 확인합니다. |

### Gemini Apps 한도가 보이지 않습니다

**Gemini 로그인** 후 **사용량 확인**을 다시 실행하세요. Gemini Usage Limits 화면에서 현재 사용량과 주간 한도가 모두 보이는지 확인합니다. Gemini 웹 화면의 언어·구성 변경이나 사용량 값 미표시로 파싱이 실패할 수 있습니다. 이 경우 Gemini Apps 한도는 비어 있을 수 있으며 Antigravity 한도로 대체되지 않습니다.

### Antigravity 사용량이 보이지 않습니다

Node.js LTS를 설치하고 CLI 로그인 과정을 완료하세요. Antigravity가 이미 실행 중이라면 앱을 새로고침해 로컬 fallback을 다시 시도할 수 있습니다.

### Node.js 설치 안내가 표시됩니다

Claude 및 Antigravity CLI 연결에는 `npx`가 필요합니다. 안내 버튼에서 Node.js LTS를 설치한 뒤 앱을 다시 실행하세요.

### 사용량 알림이 표시되지 않습니다

설정에서 **사용량 알림 사용**과 원하는 표시 방식을 켰는지 확인하세요. 임계치 알림은 설정 후 처음 읽은 값을 기준선으로 저장하고, 이후 잔여량이 선택한 임계치를 통과할 때 발생합니다. 앱이 완전히 종료되어 있으면 백그라운드 수집과 알림은 동작하지 않으므로 시스템 트레이에서 실행 중인지 확인하세요. Windows 알림은 Windows 알림 및 집중 지원 설정의 영향을 받습니다.

## 라이선스

이 프로젝트는 [MIT License](LICENSE)로 배포됩니다.
