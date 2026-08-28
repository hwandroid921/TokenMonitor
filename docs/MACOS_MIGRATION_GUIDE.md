# Token Monitor macOS 마이그레이션 가이드

- 문서 버전: `v1.0.0`
- 작성일: `2026-08-27`
- 적용 기준: Token Monitor `v1.2.0`
- 현재 도구 버전: Electron `39.2.4`, electron-builder `26.8.1`

## 1. 목적과 범위

이 문서는 Windows 중심으로 구현된 Token Monitor를 macOS에서 개발, 패키징, 서명, 공증하고 검증하기 위한 환경과 테스트 절차를 정의한다.

마이그레이션 완료 범위에는 다음 항목이 포함된다.

- React 대시보드와 Electron 메인 프로세스의 macOS 실행
- Codex, Claude, Antigravity/Gemini 사용량 수집
- 시스템 트레이, Dock, 투명 오버레이, 알림 동작
- Keychain 기반 설정 암호화와 개인정보 보호
- Apple Silicon과 Intel 패키지 생성 및 검증
- Developer ID 코드 서명과 Apple 공증
- DMG 기반 직접 배포

Token Monitor는 외부 CLI를 실행하고 사용자 홈 디렉터리의 로컬 설정을 읽어야 한다. App Sandbox 제약이 있는 Mac App Store보다 Developer ID로 서명·공증한 DMG 직접 배포를 우선한다.

## 2. 현재 상태와 선행 구현 항목

> 업데이트: Token Monitor `v1.3.6`부터 provider 수집기의 macOS 경로 탐색과 Claude Node Status Line, Antigravity `ps`/`lsof` local probe, ARM64 unsigned DMG/ZIP 패키징 설정이 구현되었다. Developer ID 서명과 공증은 별도 구현과 검증이 필요하다.

현재 UI와 공통 TypeScript 로직은 대부분 재사용할 수 있지만, 다음 Windows 전용 구현을 먼저 플랫폼 분기 또는 공통 구현으로 교체해야 한다.

### 2.1 Claude

- Claude 상태 표시줄이 PowerShell `.ps1` 스크립트와 `powershell` 명령을 사용한다.
- Claude 인증 상태 확인의 fallback 명령이 `npx.cmd`로 고정되어 있다.
- macOS에서는 Node 기반 상태 표시줄 스크립트 또는 플랫폼별 스크립트가 필요하다.
- macOS의 fallback 명령은 `npx`를 사용해야 한다.
- OAuth 로그인은 사용자가 조작할 수 있는 Terminal 창에서 실행하고 완료·취소 상태를 확인해야 한다.

### 2.2 Codex

- 비-Windows 실행 파일 탐색은 현재 PATH의 `codex` 명령에 의존한다.
- Finder에서 실행한 앱은 로그인 셸의 PATH를 그대로 상속하지 않을 수 있다.
- `CODEX_CLI_PATH`, Homebrew 경로, npm 전역 경로, 앱 번들 및 알려진 로컬 설치 경로를 확인해야 한다.
- 오류 메시지에서 `codex.exe`와 같은 Windows 전용 표현을 제거해야 한다.

### 2.3 Antigravity/Gemini

- Antigravity 로컬 probe가 `powershell.exe`, `Get-CimInstance`, `Get-NetTCPConnection`을 사용한다.
- macOS에서는 `ps` 또는 `pgrep`로 프로세스를 찾고 `lsof`로 listening port를 확인하는 분기가 필요하다.
- 수집 순서는 다음과 같이 유지한다.
  1. `antigravity-usage` Google 방식
  2. `antigravity-usage` auto/local 방식
  3. 내장 Antigravity 로컬 probe
  4. Gemini CLI OAuth fallback

### 2.4 앱 셸과 패키징

- 트레이와 BrowserWindow 아이콘이 Windows용 `build/icon.ico`로 고정되어 있다.
- macOS 앱용 `.icns`와 메뉴바용 Template PNG 자산이 필요하다.
- `package.json`에 `mac` 대상, DMG/ZIP 구성, 아키텍처와 artifact 이름이 없다.
- Dock, `Cmd+Q`, 창 닫기, 트레이 유지, 다중 Space와 전체 화면 오버레이 동작을 별도로 정의해야 한다.

## 3. 지원 기준 결정

### 3.1 운영체제

현재 Electron 39는 macOS 12 Monterey 이상에서 실행된다. 개발과 서명 환경은 최신 Xcode를 사용할 수 있도록 macOS 14 또는 15 이상을 권장한다.

Electron 39는 이미 공식 지원 기간이 종료되었으므로 실제 macOS 공개 릴리스 전에는 지원 중인 Electron 버전으로 업그레이드해야 한다. Electron 44 이상으로 올리면 최소 지원 운영체제가 macOS 13 Ventura로 변경된다. Electron 업그레이드와 macOS 포팅은 문제 원인을 분리할 수 있도록 별도 커밋 또는 단계로 진행한다.

### 3.2 아키텍처

- 주 개발 및 1차 배포: `arm64`
- 호환성 배포: `x64`
- 단일 배포 파일이 필요할 때: `universal`

현재 프로젝트에는 직접 설치된 네이티브 Node 모듈이 없으므로 Universal 병합 위험은 비교적 낮다. 그래도 `arm64`와 `x64`를 각각 검증한 다음 Universal을 생성한다.

Apple Silicon에서 Rosetta로 x64 실행을 확인할 수 있지만 실제 Intel Mac 테스트를 완전히 대체하지는 않는다. 실제 Intel 장비가 없다면 GitHub Actions의 Intel macOS runner를 사용한다.

## 4. 권장 개발 환경

### 4.1 하드웨어와 계정

- Apple Silicon Mac(M1 이상) 1대
- 여유 디스크 25GB 이상
- Apple Developer Program 계정
- `Developer ID Application` 인증서
- Intel 검증용 실제 Mac 또는 GitHub Actions runner
- Provider별 테스트 계정과 로컬 CLI 로그인 환경

테스트 계정과 자격 증명은 개인 개발 환경 또는 CI Secret에만 저장한다. OAuth token, refresh token, 이메일, account ID를 저장소, 스크린샷, 테스트 fixture 또는 로그에 포함하지 않는다.

### 4.2 필수 소프트웨어

- macOS 14/15 이상 권장
- Xcode 최신 안정 버전
- Xcode Command Line Tools
- Git
- Node.js 22 LTS 권장
- npm
- 필요 시 Rosetta 2

Electron 39는 내부적으로 Node 22를 사용하므로 호스트 빌드 환경도 Node 22 LTS로 맞추는 것을 기본값으로 한다. Node 24를 사용할 경우 `npm ci`, typecheck, build, packaging을 별도로 검증한다.

## 5. 개발 장비 초기 설정

### 5.1 Xcode와 Command Line Tools

App Store에서 Xcode를 설치한 후 다음 명령을 실행한다.

```bash
xcode-select --install
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept

xcodebuild -version
xcrun notarytool --version
git --version
```

Apple Silicon에서 x64 앱을 보조 검증하려면 Rosetta를 설치한다.

```bash
softwareupdate --install-rosetta --agree-to-license
```

### 5.2 Node.js

`fnm` 예시:

```bash
fnm install 22
fnm use 22

node --version
npm --version
```

팀과 CI에서 동일 버전을 사용하도록 구현 단계에서 `.nvmrc` 또는 `.node-version` 추가를 검토한다.

### 5.3 저장소 준비

Windows에서 생성한 `node_modules`, `dist`, `dist-electron`, `dist-app`을 Mac으로 복사하지 않는다. 저장소를 새로 clone하고 의존성을 lockfile 기준으로 설치한다.

```bash
git clone https://github.com/hwandroid921/TokenMonitor.git
cd TokenMonitor

npm ci
npm run typecheck
npm run build
npm run dev
```

## 6. Provider 개발 환경

### 6.1 Codex

- Codex Desktop 또는 Codex CLI를 설치하고 로그인한다.
- Terminal에서 `codex`가 실행되는지 확인한다.
- Finder 실행 테스트를 위해 `/Applications`에 설치한 패키지에서도 CLI 탐색을 확인한다.
- PATH에 없는 설치를 검증할 때만 `CODEX_CLI_PATH`를 사용한다.

환경 변수나 탐색 로그에는 실제 계정 ID와 token을 출력하지 않는다.

### 6.2 Claude

Node.js/npm 설치 후 프로젝트 정책의 OAuth 흐름을 사용한다.

```bash
npx -y @anthropic-ai/claude-code auth login --claudeai
claude auth status --json
```

글로벌 `claude` 명령이 없는 환경과 설치된 환경을 모두 테스트한다. 상태 표시줄 테스트 전 `~/.claude` 설정을 백업하고, 설치·업데이트·제거 후 기존 사용자 설정이 보존되는지 확인한다.

### 6.3 Antigravity/Gemini

Antigravity CLI 로그인 흐름:

```bash
npx -y antigravity-usage login
```

다음 환경을 각각 확인한다.

- `antigravity-usage`가 전역 설치된 환경
- `npx`로만 실행 가능한 환경
- Antigravity 앱이 실행 중인 로컬 probe 환경
- Gemini CLI OAuth fallback 환경
- 로그인 취소, 만료, 재로그인 환경

## 7. macOS 패키징 설정 방향

구현 단계에서 현재 electron-builder `26.8.1` 스키마에 맞춰 다음 항목을 `package.json`에 추가한다.

- `dist:mac` npm script
- `build.mac` 설정
- DMG와 ZIP target
- `arm64`, `x64` 또는 `universal` 아키텍처
- macOS용 artifact 이름
- `.icns` 앱 아이콘
- Hardened Runtime
- entitlements와 child entitlements
- 공증 설정

electron-builder 최신 문서는 v27 기준 내용이 섞일 수 있으므로 v26 설정을 먼저 검증한 후 버전 업그레이드를 진행한다.

권장 자산:

- 앱 패키지: `build/icon.icns`
- 메뉴바 기본 배율: 이름이 `Template.png`로 끝나는 PNG
- 메뉴바 Retina: 이름이 `Template@2x.png`로 끝나는 PNG

## 8. 빌드와 패키징 절차

다음 명령은 macOS 구현과 `build.mac` 설정이 추가된 이후 사용한다.

### 8.1 정적 검증

```bash
npm ci
npm run typecheck
npm run build
```

### 8.2 서명 없는 unpacked smoke build

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false \
npx electron-builder --mac dir --arm64 --publish never
```

이 단계에서는 앱 번들 구조, 리소스 포함 여부와 기본 실행만 확인한다. 알림, Keychain, 로그인 항목과 Gatekeeper 동작은 서명된 앱에서 다시 테스트한다.

### 8.3 아키텍처별 패키징

```bash
npx electron-builder --mac dmg zip --arm64 --publish never
npx electron-builder --mac dmg zip --x64 --publish never
```

### 8.4 Universal 패키징

```bash
npx electron-builder --mac dmg zip --universal --publish never
```

아키텍처별 빌드가 모두 성공한 후 Universal 빌드를 수행한다.

## 9. 코드 서명과 공증

### 9.1 요구사항

- Apple Developer Program 가입
- `Developer ID Application` 인증서
- Hardened Runtime 활성화
- secure timestamp 포함
- 유효한 XML entitlements
- `com.apple.security.get-task-allow` 미포함
- Apple notary service 제출
- 공증 ticket stapling

설치된 코드 서명 인증서를 확인한다.

```bash
security find-identity -v -p codesigning
```

### 9.2 로컬 notarytool 자격 증명

다음 명령의 값은 예시이며 실제 값은 Keychain에만 입력한다.

```bash
xcrun notarytool store-credentials "tokenmonitor-notary" \
  --apple-id "APPLE_ID" \
  --team-id "TEAM_ID" \
  --password "APP_SPECIFIC_PASSWORD"
```

CI에서는 App Store Connect API Key 방식을 우선한다.

- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- 서명 인증서 `.p12` 또는 base64 값
- 인증서 비밀번호

모든 값은 GitHub Actions Secrets로 관리하며 PR 로그에 출력하지 않는다.

## 10. 패키지 검증

아래 경로와 artifact 이름은 실제 electron-builder 출력에 맞춰 조정한다.

### 10.1 앱 서명

```bash
codesign --verify --deep --strict --verbose=2 \
  "dist-app/mac-arm64/Token Monitor.app"

codesign -dv --verbose=4 \
  "dist-app/mac-arm64/Token Monitor.app"
```

출력에서 Developer ID identity, Team ID, Hardened Runtime과 secure timestamp를 확인한다.

### 10.2 Gatekeeper와 공증 ticket

```bash
spctl --assess --type execute --verbose=4 \
  "dist-app/mac-arm64/Token Monitor.app"

xcrun stapler validate \
  "dist-app/TokenMonitor-<version>-arm64.dmg"

hdiutil verify \
  "dist-app/TokenMonitor-<version>-arm64.dmg"
```

### 10.3 아키텍처와 해시

```bash
file "dist-app/mac-arm64/Token Monitor.app/Contents/MacOS/Token Monitor"

lipo -archs \
  "dist-app/mac-universal/Token Monitor.app/Contents/MacOS/Token Monitor"

shasum -a 256 \
  "dist-app/TokenMonitor-<version>-arm64.dmg"
```

## 11. 수동 통합 테스트

### 11.1 기본 실행

- `npm run dev` 실행
- unpacked 앱 직접 실행
- DMG에서 `/Applications`로 설치 후 Finder 실행
- 앱 이름, 아이콘, 버전, 메뉴바 표시 확인
- 중복 실행 방지 확인
- 재부팅 또는 로그아웃 후 재실행 확인

Terminal 실행과 Finder 실행을 반드시 구분한다. Finder 실행은 셸 초기화 파일의 PATH를 상속하지 않을 수 있으므로 Provider CLI 탐색 검증의 기준은 Finder 실행이다.

### 11.2 창, Dock, 트레이

- Dock 클릭으로 기존 창 복구
- 창 닫기와 close-to-tray 설정 확인
- `Cmd+Q`로 완전 종료
- 트레이 클릭과 메뉴의 열기·새로고침·종료 동작
- Dock 메뉴와 macOS 애플리케이션 메뉴 동작
- 앱 종료 후 자식 CLI 프로세스가 남지 않는지 확인

### 11.3 오버레이

- Retina 배율에서 글자와 아이콘 선명도
- 모니터별 표시 위치
- 다중 Space 이동
- 전체 화면 앱 위 표시 여부
- click-through 동작
- always-on-top 유지
- 디스플레이 연결·해제 후 화면 밖 이탈 여부
- 잠자기 복귀 후 표시 상태

### 11.4 알림

- 최초 알림 권한 요청
- 권한 허용과 거부
- 테스트 알림
- 앱이 숨겨진 상태의 알림
- 5분 백그라운드 수집
- 동일 quota window와 threshold의 중복 알림 방지
- quota reset 후 재알림 가능 여부
- 잠자기 복귀 후 알림 폭주 여부

macOS 알림 이벤트는 서명된 앱에서 검증한다. unsigned 또는 ad-hoc 앱 결과만으로 완료 판정하지 않는다.

### 11.5 Keychain과 계정 별칭

- 별칭 저장 후 앱 재실행
- 앱 업데이트 후 별칭 유지
- 동일한 Developer ID로 서명한 버전 간 Keychain 재승인 여부
- 계정 전환과 별칭 수정·삭제
- 손상된 로컬 상태의 복구
- UI와 로그에 token, 이메일 원문, account ID가 나타나지 않는지 확인

### 11.6 Provider 테스트 매트릭스

| Provider | 정상 상태 | 예외 상태 | macOS 고유 확인 |
| --- | --- | --- | --- |
| Codex | 로그인 및 quota 표시 | CLI 미설치, 로그아웃, timeout | Finder 실행 PATH, Homebrew/npm/앱 경로 탐색 |
| Claude | OAuth quota 표시 | 글로벌 CLI 없음, 로그인 취소, 만료 | `npx` fallback, Terminal 로그인, 상태 표시줄 복구 |
| Antigravity | Google/auto/local 수집 | 앱 미실행, CLI 없음, 로그인 만료 | `ps`/`pgrep`/`lsof` probe, 로컬 listening port |
| Gemini fallback | OAuth quota 표시 | 인증 없음, 캐시만 존재 | macOS CLI 경로와 사용자 홈 경로 |

주간 quota는 명시적인 weekly/7-day window가 있을 때만 표시한다. Prompt Credits나 월간 값을 주간 quota로 추론하지 않는다.

## 12. 자동화 테스트 권장안

현재 저장소에는 테스트 프레임워크와 GitHub Actions workflow가 없다. 다음 순서로 자동화를 추가한다.

### 12.1 단위 테스트

- 플랫폼별 CLI 이름과 argument 생성
- PATH 및 알려진 설치 경로 탐색
- macOS `ps`/`lsof` 출력 파싱
- Provider 응답 정규화
- quota threshold와 reset 상태
- 설정 파일 손상 복구
- 개인정보 마스킹

실제 OAuth token이나 로컬 credential 파일 대신 display-safe mock fixture를 사용한다.

### 12.2 Playwright Electron smoke test

- Electron 앱 시작과 첫 창 표시
- 대시보드 렌더링
- 설정 패널 열기
- 오버레이 생성과 닫기
- 주요 IPC 호출
- 앱 종료

Playwright의 Electron 지원은 experimental이며 네이티브 권한 대화상자를 완전히 제어하지 못한다. 알림 권한, Keychain, Dock, 트레이와 Gatekeeper는 수동 통합 테스트로 보완한다.

### 12.3 CI 매트릭스

예시:

```yaml
strategy:
  matrix:
    os:
      - macos-15
      - macos-15-intel
```

- `macos-15`: Apple Silicon ARM64 검증
- `macos-15-intel`: Intel x64 검증
- PR: `npm ci`, typecheck, build, unit/smoke test
- 릴리스: 아키텍처별 package, signing, notarization, hash 검증

Provider 실제 로그인과 quota 조회는 일반 PR CI에서 수행하지 않는다. 실제 계정 통합 테스트는 릴리스 전 전용 Mac에서 수행한다.

## 13. 권장 구현 순서

1. 지원 macOS와 Electron 목표 버전 확정
2. Claude 상태 표시줄을 Node 기반 공통 구현으로 교체
3. `npx.cmd`, PowerShell과 Windows 전용 메시지를 플랫폼 분기
4. macOS Codex CLI 탐색 구현
5. Antigravity macOS 로컬 probe 구현
6. Dock, 트레이, 종료 수명주기 구현
7. 오버레이의 Space·전체 화면·다중 모니터 대응
8. `.icns`와 Template PNG 추가
9. electron-builder v26 기준 `build.mac`과 `dist:mac` 추가
10. ARM64 unsigned `dir` smoke build
11. 단위 테스트와 Playwright smoke test 추가
12. x64 및 Universal package 검증
13. Developer ID 서명과 공증
14. 별도 사용자 계정 또는 다른 Mac에서 DMG 설치 검증
15. README와 릴리스 정책의 macOS 지원 내용 갱신

macOS 지원 추가는 사용자 배포 플랫폼이 늘어나는 기능 마일스톤이므로 구현 완료 시에는 MINOR 앱 릴리스로 처리한다. 실제 버전은 구현 시작 시 최신 Release History와 병합 상태를 기준으로 확정한다.

## 14. 완료 판정 기준

다음 조건을 모두 충족해야 macOS 마이그레이션 완료로 판정한다.

- `npm ci`, `npm run typecheck`, `npm run build` 성공
- ARM64와 x64 또는 Universal 앱 패키징 성공
- Finder 실행 상태에서 Codex, Claude, Antigravity/Gemini 탐색 성공
- 트레이, Dock, `Cmd+Q`, close-to-tray 동작 통과
- 오버레이의 Retina, 다중 모니터, Space, 전체 화면 테스트 통과
- 서명된 앱에서 알림과 Keychain 테스트 통과
- Developer ID 서명과 Apple 공증 통과
- DMG 무결성, stapled ticket, SHA256 검증 완료
- 다른 Mac 또는 새 사용자 계정에서 Gatekeeper 설치 테스트 통과
- ARM64와 Intel CI 통과
- UI, 로그, fixture, 문서와 빌드 로그에 민감 정보가 노출되지 않음

## 15. 공식 참고 자료

- [Electron Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes)
- [Electron 39 Release](https://www.electronjs.org/blog/electron-39-0)
- [Electron Release Schedule](https://releases.electronjs.org/schedule)
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Electron Notifications](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray/)
- [electron-builder macOS](https://www.electron.build/docs/mac/)
- [electron-builder macOS Code Signing](https://www.electron.build/docs/features/code-signing/code-signing-mac/)
- [electron-builder Notarization](https://www.electron.build/docs/notarization/)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple: Resolving common notarization issues](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
- [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
