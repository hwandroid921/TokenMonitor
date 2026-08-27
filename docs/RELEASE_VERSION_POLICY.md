# Release Version Policy

This local planning document defines the project milestone version and app/exe release version rules for Token Monitor from `v0.1.0` to the initial complete `v1.0.0` release and later Git-managed releases.

This file is tracked in Git and is used as a shared working reference while planning, implementing, and packaging releases.

README and other user-facing project documents should describe the current final state of the project. Do not list individual task edits, implementation diffs, or change-by-change notes there. Version-level changes are recorded only in release/version sections such as this document's Release History.

## Versioning Goal

- `v0.1.0` is the default starting program version.
- `v1.0.0` is used when the intended initial feature implementation is complete.
- Versions before `v1.0.0` represent staged work toward feature completeness, stability, and release polish.
- Do not predefine fixed feature content for every version up to `v1.0.0`. Record version content when actual implementation, fixes, or documentation work is performed.

## Version Types

Token Monitor uses two related but separate version concepts.

### Project Milestone Version

The project milestone version describes product progress toward `1.0.0`.

Use this version to reason about roadmap stage and completion level. Before `v1.0.0`, keep milestone content flexible and update the release history from actual completed work instead of maintaining a fixed prewritten roadmap.

### App/Exe Release Version

The app/exe release version is the actual distributable version in `package.json`.

Examples:

```text
0.1.3
0.1.5
0.2.2
```

Electron Builder uses this value in the executable file name:

```text
TokenMonitor-<package.version>-x64.exe
```

Do not treat every planning or documentation update as a new app/exe release.

## App/Exe Version Unit Rules

Use semantic versioning style:

```text
MAJOR.MINOR.PATCH
```

- `MAJOR`: Product-level compatibility boundary. Before initial completion, `v1.0.0` marks the first complete release. After that, major changes increment by `1.0.0` units.
- `MINOR`: User-visible feature milestone or meaningful workflow change. Before and after `v1.0.0`, minor changes increment by `0.1.0` units.
- `PATCH`: Bug fix, UI polish, packaging fix, or narrow code adjustment.
- Prerelease versions such as `0.7.0-beta.0` may be used for beta validation before a milestone release is promoted to a stable `MINOR.0` or `MAJOR.0` version.

Documentation-only or instruction-only changes do not require an app/exe version bump unless the user explicitly asks for a new executable.

Portable executable packaging is performed only for milestone release versions such as `0.3.0`, `0.4.0`, and later `MINOR.0` or `MAJOR.0` release points. Patch releases such as `0.3.1`, `0.3.2`, and `0.3.3` do not produce a portable executable by default unless explicitly requested.

For every `MINOR` or `MAJOR` release, release delivery is automatic: update the version files and Release History, run verification and required portable packaging, verify the executable and SHA256 hash, remove prior versioned portable executables from the explicit release output locations, commit, push the release branch, and create the PR without requiring a separate upload request. After the release commit is merged to the stable release branch, create and push the matching Git tag and create the matching GitHub Release. Tags and GitHub Releases must never be created from an unmerged feature branch.

For `PATCH` releases, remote upload, PR creation, tagging, GitHub Release creation, and portable packaging remain opt-in unless the user explicitly requests them.

Beta/prerelease versions may produce portable artifacts when the user explicitly requests tag/release work or when the beta is intended for external validation.

Before `v1.0.0`, do not maintain a fixed version-by-version feature roadmap. When work is completed, decide whether it is patch, minor, or major according to the actual change and record the completed content in Release History.

## Current Release

Current package version:

```text
1.2.0
```

`v1.2.0` is the quota alert milestone. It adds five-minute background collection, user-selected remaining-quota thresholds, verified reset notifications, Windows and always-on-top alert channels, and optional overlay warning colors.

- ChatGPT quota display through the Codex Desktop local usage flow
- Claude quota display
- Antigravity quota display through the Gemini CLI OAuth quota path
- Transparent overlay
- System tray behavior
- Portable Windows executable packaging

## Increment Guidance

Use a patch increment when the work is narrow and does not change the product milestone.

Examples:

- Small CSS fixes
- Packaging retry/process safety fixes
- Minor display copy changes
- Bug fixes that do not add a new user-facing feature

Do not increment the app/exe version for documentation-only or instruction-only work unless explicitly requested.

Use a minor increment when the work represents a new milestone. Minor changes increment by `0.1.0` units.

Examples:

- New provider support
- Major overlay behavior change
- New settings workflow
- New quota source or authentication flow
- Major dashboard layout redesign
- Significant packaging/release workflow change

Reserve `v1.0.0` for the final complete initial release after:

- Provider quota display is stable
- Overlay display is reliable
- Settings and tray behavior are stable
- Packaging is repeatable
- README and troubleshooting docs are complete
- Privacy-sensitive data handling has been reviewed

After `v1.0.0`, release versions should be managed through Git releases and tags. Each post-`v1.0.0` release should have a corresponding Git tag and release entry.

## Post-v1.0.0 Future Feature Backlog

These items are candidates for releases after the initial complete `v1.0.0` milestone. They are not required for `v1.0.0` and should be scoped, versioned, and recorded only when implementation work actually begins or ships.

- Additional usage and credits:
  - Track whether providers expose display-safe additional usage, purchased credits, or flexible usage balances.
  - Show extra usage/credit status only when the source clearly distinguishes it from base plan quota.
  - Do not display billing identifiers, payment details, invoice data, or credential-derived account identifiers.
- macOS migration:
  - Add macOS support after the Windows release path is stable.
  - Review tray, overlay, packaging, provider CLI discovery, local app paths, and platform-specific privacy handling separately for macOS.

## Required Workflow For Each Task

Before finishing a task:

1. Review the user-requested work.
2. Decide whether the work affects the project milestone version, the app/exe release version, both, or neither.
3. If the app/exe release version should change, update:
   - `package.json`
   - `package-lock.json`
   - any release/output references that include the version string
4. If feature additions, fixes, documentation work, or instruction work require a version update after reviewing version history, update the relevant version immediately in the same task.
5. If the change is documentation-only or instruction-only and does not require a version update, do not update `package.json` and do not package a new exe unless explicitly requested.
6. Run verification when code or packaging-related behavior changed:

   ```powershell
   npm run typecheck
   npm run build
   ```

7. Package the portable executable only when the app/exe release version is a milestone package version such as `0.3.0`, `0.4.0`, or another `MINOR.0` / `MAJOR.0` release point, unless the user explicitly requests packaging for another version:

   ```powershell
   $env:CSC_IDENTITY_AUTO_DISCOVERY='false'
   npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false
   ```

8. Verify the generated executable and SHA256 hash when packaging is performed.
9. For `MINOR` and `MAJOR` releases, remove older `TokenMonitor-*-x64.exe` artifacts from `dist-app/` and any user-designated release delivery directory only after the current version artifact and hash have been verified. Preserve the current version artifact.

## Git Releases And Tags From v1.0.0

Starting with `v1.0.0`, release management includes Git tag and remote release creation.

Rules:

- Create a Git tag for each release version.
- Use tag names in the format `vMAJOR.MINOR.PATCH`, for example `v1.0.0` or `v1.1.0`.
- Create a GitHub release or equivalent remote release entry for each tagged release.
- Keep the release description concise and focused on:
  - core work
  - user-visible changes
  - differences from the previous release
  - verification and packaging status
- Ensure `package.json`, `package-lock.json`, Release History, packaged artifacts, Git tag, and remote release entry all refer to the same version.
- `v1.0.0` and every later release must have a corresponding Git tag and remote release entry.
- For `MINOR` and `MAJOR` releases, commit/push/PR are mandatory as part of the release workflow; after stable-branch merge, tag and remote release creation are mandatory without requiring a separate user request.
- Use the merged stable-branch commit as the tag target. Never tag a feature branch, a release candidate, or an open PR head.

## Release Notes Checklist

For each release-worthy version bump, summarize:

- Version
- Date
- Change category: `PATCH`, `MINOR`, or `MAJOR`
- User-visible changes
- Provider/data-source changes
- Packaging notes
- Known limitations

## Release History

### 1.2.0 — 2026-08-27 — MINOR

**Change category:** MINOR (background quota monitoring and notifications)

**User-visible changes:**
- Added five-minute background usage collection while Token Monitor remains running, including tray-only and overlay-only operation.
- Added selectable remaining-quota thresholds from 5% through 50%, separate exhausted-quota alerts, and verified reset notifications.
- Added independent Windows notification, 12-second always-on-top warning, and overlay color-emphasis settings with test notification support.
- Overlay remaining values use gray at 30% or above, red below 30%, and dark gray with an explicit exhausted label at 0% when warning colors are enabled.

**Provider/data-source changes:**
- ChatGPT weekly and periodic windows, fresh Claude weekly and five-hour Status Line windows, and explicit Antigravity periodic/weekly model windows feed a display-safe normalized quota monitor.
- Reset-time collection bypasses short-lived caches and confirms both reset-window rollover and quota recovery before notifying.
- Gemini Apps web usage remains display-only because its manually captured text cache is not a reliable automatic notification source.

**Privacy and security review:**
- Notification settings and deduplication state store only provider/window labels, display-safe percentages, reset times, and notification signatures.
- Raw provider payloads, tokens, account IDs, credential paths, and emails remain excluded from notification state and notification text.

**Packaging notes:**
- Package version updated to `1.2.0`.
- Portable Windows x64 artifact `TokenMonitor-1.2.0-x64.exe` was regenerated and verified.
- SHA256: `47E6FFC3D55215D92C5C58E711E12DE6A3F2F9309A8A3A155C0326B1C4058CC9`.

**Known limitations:**
- Background collection and notifications stop when Token Monitor is fully exited.
- Windows native notification placement and duration remain controlled by Windows notification and focus-assist settings.
- Claude reset confirmation waits for a fresh Claude Code Status Line snapshot after provider quota data changes.

### 1.1.0 — 2026-08-27 — MINOR

**Change category:** MINOR (account alias management and account-aware identity display)

**User-visible changes:**
- Dashboard and overlay account rows now show user-defined aliases and never show email addresses.
- Settings now lists current and previously detected ChatGPT, Claude, and unified Google accounts with masked email addresses for alias assignment, rename, and deletion.
- Newly detected accounts request an alias, while returning accounts restore their saved alias automatically.
- Gemini Apps and Antigravity now share one Google account detection state and one user-defined display name/alias.

**Provider/data-source changes:**
- Provider email values are converted in the Electron main process into HMAC account identities and masked settings-only values before public usage results are created.
- Gemini Apps inspects account-related accessible labels in memory to identify the signed-in Google account without persisting raw page text or raw email.
- Gemini Apps, Antigravity local data, and OAuth fallback identities feed the same Google account identity; legacy separate Google alias records are merged by identity.
- Antigravity local and OAuth fallback identities are treated as verified; the Gemini CLI credential fallback remains explicitly inferred.

**Privacy and security review:**
- Raw email addresses, HMAC account identities, tokens, account IDs, and raw provider payloads remain excluded from the renderer and logs.
- Alias mappings, masked emails, and the local HMAC secret are encrypted with Electron `safeStorage` under the Windows user account.
- Masked emails are available only through the settings account-management IPC; dashboard and overlay usage IPC results contain alias state only.

**Packaging notes:**
- Package version updated to `1.1.0`.
- Portable Windows x64 artifact `TokenMonitor-1.1.0-x64.exe` was regenerated and verified.
- SHA256: `8E80E115B46DCBD87461B68E376EDA862DD81E140F3A58A73F620C3582A12D53`.

**Known limitations:**
- Gemini Apps identity detection depends on Google account-related accessible labels and can report an unknown account when Google changes or omits those labels.
- `antigravity-usage` account identity is marked inferred when only a separate Gemini CLI credential is available.

---

### 1.0.1 — 2026-08-25 — PATCH

**Change category:** PATCH (dashboard and settings UI/UX polish)

**User-visible changes:**
- Prevented Gemini quota rows from being clipped and separated Gemini Apps from Antigravity usage information.
- Added provider status badges, refresh feedback, recent source/detail metadata, and clearer Claude onboarding guidance.
- Simplified settings with collapsible collection guidance, automatic-save feedback, and disabled child options for hidden providers.
- Added a two-column intermediate layout and improved tabs, dialogs, focus visibility, keyboard navigation, and live status announcements.
- Localized the remaining system tray menu labels in Korean.

**Provider/data-source changes:**
- No provider collection source or quota interpretation changes.

**Packaging notes:**
- Package version updated to `1.0.1`.
- No portable executable packaged because patch releases do not produce portable artifacts by default.

**Known limitations:**
- Provider web and CLI surface changes can still require parser or guidance updates.

---

### 1.0.0 — 2026-08-18 — MAJOR

**Change category:** MAJOR (first complete release)

**User-visible changes:**
- Finalized the Windows x64 dashboard, system tray, and lower-right transparent overlay experience.
- Provider-specific overlay settings now independently control masked account email, plan, usage, remaining usage, and reset time.
- Usage summaries present weekly windows before periodic windows where the provider exposes both.

**Provider/data-source changes:**
- ChatGPT uses the local Codex Desktop app-server flow with safe executable discovery.
- Claude uses an app-owned Claude Code Status Line minimum snapshot instead of credential-file or conversation-log collection.
- Gemini Apps and Antigravity remain separate quota sources; Gemini web-page source text is parsed in memory only and is not written as a debug artifact.
- Gemini OAuth credentials are read only and are never refreshed back to provider credential files by Token Monitor.

**Privacy and security review:**
- Removed raw Gemini page-text debug persistence.
- Restricted embedded Gemini navigation to Google-owned host boundaries.
- Replaced raw external CLI/provider error forwarding with display-safe recovery guidance.
- Raw tokens, credential contents, provider-internal account IDs, raw provider payloads, and unmasked emails remain excluded from the renderer, logs, settings, and caches.

**Packaging notes:**
- Package version is `1.0.0`.
- Portable Windows x64 packaging and SHA256 verification are required for this release.
- Git tag `v1.0.0` and the matching remote release are required after the release commit is merged to the stable release branch.

**Known limitations:**
- Provider web/CLI interfaces can change and may require collector updates.
- Gemini Apps usage extraction depends on visible page content and can be unavailable when Google does not render quota data.
- Claude usage becomes available after a Claude Code response produces the Status Line snapshot.

### 0.9.13 — 2026-08-18 — PATCH

- Added a black outline to the 50%-opacity overlay text without restoring text shadows or a background panel.

### 0.9.12 — 2026-08-18 — PATCH

- Removed the overlay background panel and fixed overlay text opacity at 50%.
- Doubled the base overlay font sizes while retaining automatic scaling within the display-height limit.

### 0.9.11 — 2026-08-13 — PATCH

- Restored the overlay to the lower-right corner of the primary display.

### 0.9.10 — 2026-08-13 — PATCH

- Capped the overlay height at one-third of the primary display.
- Applied SBAggro 700 to overlay text, removed all text shadows, and added a 50% translucent contrast background.

### 0.9.9 — 2026-08-13 — PATCH

- Overlay window height now follows its rendered content to prevent provider rows from being clipped.
- Overlay opacity is fixed at 50%, with larger, bolder text and no text outline.

### 0.9.8 — 2026-08-12 — PATCH

- Dashboard and overlay now show provider-supplied account emails only in masked form when available.
- Raw account emails are transformed before IPC and are not written to settings, usage caches, or logs.

### 0.9.7 — 2026-08-12 — PATCH

- Reordered all provider quota displays to show explicit weekly usage before periodic usage.
- ChatGPT rate-limit windows are now classified from the app-server duration rather than the `primary`/`secondary` response position.
- Antigravity weekly usage is displayed only when the provider explicitly identifies a weekly window.

### 0.9.6 — 2026-08-11 — PATCH

- Claude dashboard state now distinguishes a valid Status Line snapshot that is still waiting for its first quota window from a completed quota reading.

### 0.9.5 — 2026-08-11 — PATCH

- Replaced the Claude OAuth usage endpoint and local JSONL log fallback with a Claude Code Status Line snapshot collector.
- The dashboard now prepares a Token Monitor Status Line command during Claude connection, then shows only reviewed model, periodic quota, weekly quota, and reset time.
- Claude credential files, raw Status Line payloads, local conversation logs, and API key authentication are excluded from the collection path.

### 0.9.4 — 2026-08-11 — PATCH

- Claude CLI status checks and login launchers now run with `ANTHROPIC_API_KEY` removed from their child-process environment.
- Claude subscription quota collection remains limited to the Claude.ai OAuth flow; API key values are neither read, stored, logged, nor displayed.

### 0.7.0-beta.0 — 2026-06-15 — BETA

**Change category:** MINOR prerelease (Gemini and Antigravity beta validation)

**User-visible changes:**
- Gemini card separates Gemini Apps usage from Antigravity usage and prioritizes the Gemini usage page plan when available
- Gemini login and usage-check actions open the embedded Gemini browser flow and direct usage page
- Antigravity setup remains a separate CLI login action for Antigravity 5-hour quota collection
- Provider recovery guidance separates Gemini Apps actions from Antigravity CLI actions

**Provider/data-source changes:**
- Gemini subscription plan, Gemini Apps 5-hour quota, weekly quota, and reset text are sourced from `https://gemini.google.com/usage`
- Antigravity 5-hour quota remains sourced from `antigravity-usage` CLI or local fallback
- Cached Gemini web usage remains displayable when Antigravity CLI collection fails

**Packaging notes:**
- Package version updated to `0.7.0-beta.0`
- Portable beta executable should be packaged for release validation
- `win-unpacked` development executable should also be refreshed

**Known limitations:**
- Gemini web parsing remains best-effort and depends on Google page text and DOM behavior
- Claude server quota verification still requires a Claude Pro/Max or higher account with OAuth access

---

### 0.6.5 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini and Antigravity collection separation)

**User-visible changes:**
- Gemini card now prioritizes the plan parsed from the Gemini usage page over Antigravity/CLI-derived plan labels
- Cached Gemini web plan and 5-hour/weekly usage remain visible even when Antigravity CLI collection fails
- Gemini recovery guidance is split into separate Gemini Apps usage and Antigravity usage actions when both are needed

**Provider/data-source changes:**
- Gemini plan and Gemini Apps 5-hour/weekly quota remain sourced from `https://gemini.google.com/usage`
- Antigravity 5-hour quota remains sourced from `antigravity-usage` CLI or local fallback
- Antigravity CLI model names such as `Gemini Pro` are not treated as the user's subscription plan

**Packaging notes:**
- Package version updated to `0.6.5`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Gemini web parsing remains best-effort and depends on the visible usage page text

---

### 0.6.4 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini usage direct page parsing)

**User-visible changes:**
- Gemini usage checks now open `https://gemini.google.com/usage` directly when the Gemini web session is already logged in
- Gemini Apps parsing recognizes the direct usage page text patterns for current usage, reset text such as `오후 6:08에 초기화`, weekly quota reset text such as `6월 15일 오전 11:08에 초기화`, and `Pro` plan candidates
- When the CLI/API plan is unavailable, the Gemini card can use the display-safe plan candidate parsed from the Gemini usage page

**Provider/data-source changes:**
- No new external API source
- Gemini Apps web parsing now treats `현재 사용량`, `주간 한도`, and `초기화` as first-class usage-page markers
- The parser still stores only display-safe usage, reset, and plan summary data

**Packaging notes:**
- Package version updated to `0.6.4`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Gemini usage parsing remains best-effort because the web page DOM and displayed copy can change without notice

---

### 0.6.3 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini Usage Limits parser visibility)

**User-visible changes:**
- Gemini Apps parsing now uses page text plus display/accessibility attributes such as `aria-label`, `title`, progress values, and value attributes
- Parsed percentage candidates are shown in the Gemini card detail after successful collection
- A display-safe parse debug file records percentage candidates and keyword snippets for troubleshooting

**Provider/data-source changes:**
- No new quota source
- Gemini Apps parser can fall back to detected percentage candidates when strict 5-hour/weekly nearby parsing is unavailable
- Parse debug output masks email/token-like strings and does not store raw provider tokens

**Packaging notes:**
- Package version updated to `0.6.3`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- If Google renders quota values outside visible/accessibility text and value attributes, parsing may still require another selector-specific update

---

### 0.6.2 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini usage page overlay window)

**User-visible changes:**
- Gemini usage-check progress now appears as an Electron overlay above the Usage Limits page itself
- The overlay blocks interaction with the usage page while collection is running
- The overlay closes with the embedded Gemini panel when collection completes or the panel is closed

**Provider/data-source changes:**
- No quota source changes

**Packaging notes:**
- Package version updated to `0.6.2`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Usage Limits navigation remains best-effort because Google does not provide a confirmed stable direct URL for the Gemini Apps Usage Limits screen

---

### 0.6.1 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini overlay placement)

**User-visible changes:**
- Gemini login and usage-check panel now overlays the dashboard instead of appearing below the provider cards
- Usage-check progress overlay no longer hides the Gemini Usage Limits page; it blocks interaction while keeping the page visible

**Provider/data-source changes:**
- No quota source changes

**Packaging notes:**
- Package version updated to `0.6.1`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Usage Limits navigation remains best-effort because Google does not provide a confirmed stable direct URL for the Gemini Apps Usage Limits screen

---

### 0.6.0 — 2026-06-10 — MINOR

**Change category:** MINOR (embedded Gemini browser panel)

**User-visible changes:**
- Gemini login and usage-check pages now open inside the dashboard area instead of a separate Electron window
- The embedded Gemini panel keeps the same persistent Gemini web session
- Login completion closes the embedded panel and switches the action to `사용량 확인`
- Usage capture completion closes the embedded panel, refreshes the dashboard, and clears the blocking overlay

**Provider/data-source changes:**
- Gemini Apps Usage Limits collection still stores only display-safe percentage/reset summaries
- No provider secrets, account emails, tokens, or raw page payloads are stored or shown

**Packaging notes:**
- Package version updated to `0.6.0`
- `win-unpacked` development executable should be refreshed because the app version changed
- Portable Windows executable should be packaged because `0.6.0` is a milestone minor release

**Known limitations:**
- Usage Limits navigation remains best-effort because Google does not provide a confirmed stable direct URL for the Gemini Apps Usage Limits screen

---

### 0.5.5 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini usage-check blocking state)

**User-visible changes:**
- Gemini `사용량 확인` now blocks dashboard interaction with an opaque progress overlay while Usage Limits data is being checked
- The blocking overlay is cleared only after usage data is refreshed or the check times out
- Gemini Apps remaining usage is accepted only when it can be parsed as a percentage value

**Provider/data-source changes:**
- No new quota source
- Gemini Apps Usage Limits parsing now requires a display-safe `%` remaining-usage value before treating collection as successful

**Packaging notes:**
- Package version updated to `0.5.5`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Usage Limits direct navigation remains best-effort because Google does not provide a confirmed stable direct URL for the Gemini Apps Usage Limits screen

---

### 0.5.4 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini login and usage-check state flow)

**User-visible changes:**
- Gemini Apps web button now follows a login-aware flow: `Gemini 로그인` before login and `사용량 확인` after login is detected
- Gemini login window closes automatically after login state is detected
- Usage-check window closes automatically after Usage Limits data is captured

**Provider/data-source changes:**
- Added a display-safe Gemini Apps session status cache that stores only login status and check time
- No new quota source

**Packaging notes:**
- Package version updated to `0.5.4`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Usage Limits direct navigation is best-effort because Google does not provide a confirmed stable direct URL for the Gemini Apps Usage Limits screen

---

### 0.5.3 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini login action and refresh capture)

**User-visible changes:**
- Gemini Apps web action label changed from `Gemini 한도 연동` to `Gemini 로그인`
- Dashboard refresh now forces a Gemini Apps Usage Limits capture when the Gemini login window is already open
- README now describes that the in-app Gemini login session can be reused while the Electron session remains valid

**Provider/data-source changes:**
- No new quota source
- Gemini Apps Usage Limits collection still reads only display-safe text from the app-opened Gemini web session

**Packaging notes:**
- Package version updated to `0.5.3`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- If the Gemini login window is closed, dashboard refresh uses the latest cached Gemini Apps Usage Limits value until the user opens the Gemini login window and displays Usage Limits again

---

### 0.5.2 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini card action layout and recovery guide)

**User-visible changes:**
- Gemini card action buttons now have matched widths and enough card height when both Gemini and Antigravity actions are visible
- Provider recovery guidance now shows only user actions such as install, login, and opening Usage Limits
- Guide sections have enough vertical space to avoid clipping action steps

**Provider/data-source changes:**
- No quota source changes

**Packaging notes:**
- Package version updated to `0.5.2`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Gemini Apps collection still requires the user to complete Google login and display the Usage Limits screen in the app-opened Gemini window

---

### 0.5.1 — 2026-06-10 — PATCH

**Change category:** PATCH (Gemini Apps link action visibility)

**User-visible changes:**
- Gemini card keeps the Gemini Apps web action visible even when the card is already live through Antigravity data
- Users can recover from `Gemini Apps Usage Limits` unlinked states without needing the whole Google provider card to be in an error state

**Provider/data-source changes:**
- No quota source changes
- Gemini Apps Usage Limits collection still uses the app-opened `gemini.google.com` web session

**Packaging notes:**
- Package version updated to `0.5.1`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Gemini Apps collection still requires the user to complete Google login and display the Usage Limits screen in the app-opened Gemini window

---

### 0.5.0 — 2026-06-10 — MINOR

**Change category:** MINOR (Gemini Apps web Usage Limits collection)

**User-visible changes:**
- Gemini card includes a separate Gemini Apps web action for Usage Limits
- Gemini 5-hour and weekly rows can show display-safe remaining usage and reset text collected from the logged-in Gemini web Usage Limits screen
- Antigravity CLI setup remains a separate action and continues to drive the Antigravity 5-hour row

**Provider/data-source changes:**
- Added a persistent Electron web session for `gemini.google.com` Usage Limits collection
- Gemini Apps collection stores only display-safe quota summary text, update time, and source metadata
- Gemini CLI, Gemini API, Code Assist, and Antigravity CLI quota data are still not substituted as Gemini Apps quota

**Packaging notes:**
- Package version updated to `0.5.0`
- `win-unpacked` development executable should be refreshed because the app version changed
- Portable Windows executable should be packaged because `0.5.0` is a milestone minor release

**Known limitations:**
- Gemini Apps collection requires the user to complete Google login and display the Usage Limits screen in the app-opened Gemini window
- The parser is best-effort because Google does not provide a confirmed public Gemini Apps Usage Limits API

---

### 0.4.1 — 2026-06-10 — PATCH

**Change category:** PATCH (OpenAI provider label alignment)

**User-visible changes:**
- OpenAI provider card, settings label, tray label, and overlay label now display `ChatGPT` instead of `Codex`
- README provider wording now refers to the user-facing OpenAI item as `ChatGPT`

**Provider/data-source changes:**
- No quota source changes
- Internal Codex Desktop executable discovery and local app-server collection remain unchanged

**Packaging notes:**
- Package version updated to `0.4.1`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- ChatGPT usage collection still depends on a Codex Desktop/Codex CLI-compatible local usage flow

---

### 0.4.0 — 2026-06-10 — MINOR

**Change category:** MINOR (Google/Gemini usage card separation)

**User-visible changes:**
- Google provider card title changed from `Antigravity` to `Gemini`
- Google card now separates Google AI plan, Gemini Apps 5-hour quota, Gemini Apps weekly quota, and Antigravity 5-hour quota
- Gemini quota rows use the `remaining usage / reset time` display format for both 5-hour and weekly windows
- Antigravity 5-hour quota remains visible as a separate row instead of being mixed with Gemini Apps quota

**Provider/data-source changes:**
- Gemini Apps quota is treated as a separate Usage Limits source from `gemini.google.com`
- Gemini CLI, Gemini API, Code Assist, and Antigravity CLI quota data are not substituted as Gemini Apps quota
- Existing Antigravity collection order remains unchanged for the Antigravity 5-hour row: `antigravity-usage` Google, `antigravity-usage` auto/local, embedded Antigravity local probe, then Gemini CLI OAuth fallback

**Packaging notes:**
- Package version updated to `0.4.0`
- `win-unpacked` development executable should be refreshed because the app version changed
- Portable Windows executable should be packaged because `0.4.0` is a milestone minor release

**Known limitations:**
- Gemini Apps Usage Limits automatic collection still requires a verified web-session collection path
- Until that path is implemented, Gemini Apps 5-hour and weekly rows are shown as unlinked instead of reusing Antigravity quota

---

### 0.3.26 — 2026-06-10 — PATCH

**Change category:** PATCH (Antigravity CLI collector shell command fix)

**User-visible changes:**
- Antigravity usage now links after `antigravity-usage login` when Node.js is installed under `C:\Program Files\nodejs`
- The collector no longer falls through to Gemini CLI OAuth when `antigravity-usage quota` is available and authenticated

**Provider/data-source changes:**
- Antigravity CLI quota collection on Windows now executes the fully quoted `npx.cmd` command as one shell string
- Existing fallback order remains unchanged after CLI attempts

**Packaging notes:**
- Package version updated to `0.3.26`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Antigravity weekly quota still requires an explicit weekly/7-day quota window from the provider response

---

### 0.3.25 — 2026-06-10 — PATCH

**Change category:** PATCH (Antigravity CLI quota command quoting fix)

**User-visible changes:**
- Antigravity usage can link after login when Node.js is installed under `C:\Program Files\nodejs`
- The quota collector now launches `antigravity-usage quota` through `call "npx.cmd"` to avoid Windows command quoting failures

**Provider/data-source changes:**
- Antigravity CLI Google and auto/local quota collection commands now use a single Windows command string with `call`
- Existing fallback order remains unchanged

**Packaging notes:**
- Package version updated to `0.3.25`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Antigravity weekly quota still requires an explicit weekly/7-day quota window from the provider response

---

### 0.3.24 — 2026-06-10 — PATCH

**Change category:** PATCH (Windows CLI launcher quoting fix)

**User-visible changes:**
- Antigravity and Claude CLI install/login buttons now run through a generated launcher script instead of nested `start cmd /k` quoting
- The launcher script avoids the `"C:\Program Files\nodejs\npx.cmd"` command-not-found error caused by nested Windows command quoting

**Provider/data-source changes:**
- No quota source changes

**Packaging notes:**
- Package version updated to `0.3.24`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Users still need Node.js/npm installed and available on PATH for integrated CLI setup buttons

---

### 0.3.23 — 2026-06-10 — PATCH

**Change category:** PATCH (Windows CLI login command quoting fix)

**User-visible changes:**
- Antigravity CLI install/login button now launches `npx.cmd` through `call` so paths under `C:\Program Files\nodejs` work correctly
- Claude CLI install/login uses the same safer Windows command wrapper

**Provider/data-source changes:**
- No quota source changes

**Packaging notes:**
- Package version updated to `0.3.23`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Users still need Node.js/npm installed and available on PATH for integrated CLI setup buttons

---

### 0.3.22 — 2026-06-09 — PATCH

**Change category:** PATCH (Antigravity quota window display guidance)

**User-visible changes:**
- Antigravity quota display now separates the 5-hour quota row from the weekly quota row
- The 5-hour row shows model quota remaining percent and reset time when Antigravity CLI/local/API data is available
- The weekly row is shown separately and remains unavailable unless the source response includes an explicit weekly/7-day quota window
- README and in-app collection guidance now describe the prerequisites for each Antigravity quota window

**Provider/data-source changes:**
- Antigravity local API prompt credit parsing now reads available/monthly prompt credits when present
- No weekly quota is inferred from monthly Prompt Credits

**Packaging notes:**
- Package version updated to `0.3.22`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Antigravity weekly quota requires an explicit weekly/7-day quota window from the CLI, local API, or provider API response

---

### 0.3.21 — 2026-06-09 — PATCH

**Change category:** PATCH (Claude Pro/Max quota prerequisite guidance)

**User-visible changes:**
- Claude server quota guidance now states that measurement requires a Claude Pro/Max or higher account
- The dashboard recovery steps now ask users to confirm a Claude Pro/Max or higher account before retrying OAuth setup
- README setup, provider support, Claude collection, and FAQ sections now reflect the same prerequisite

**Provider/data-source changes:**
- No quota source changes
- Claude local JSONL logs remain fallback/history metadata only and are not presented as server quota for lower-plan accounts

**Packaging notes:**
- Package version updated to `0.3.21`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Claude Pro/Max OAuth quota verification still requires access to a qualifying Claude account

---

### 0.3.20 — 2026-06-09 — PATCH

**Change category:** PATCH (Antigravity CLI collection command alignment)

**User-visible changes:**
- Antigravity usage collection now matches the in-app setup flow by using `npx -y antigravity-usage` when Node.js/npm is available
- Users no longer need a separate global `antigravity-usage` install after using the in-app setup/login button

**Provider/data-source changes:**
- Antigravity CLI collection now prefers `npx -y antigravity-usage quota ...`
- A globally installed `antigravity-usage` command remains supported as fallback
- Existing fallback order remains unchanged after CLI attempts: embedded Antigravity local probe, then Gemini CLI OAuth fallback

**Packaging notes:**
- Package version updated to `0.3.20`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Node.js/npm is still required for the integrated `npx` CLI setup and collection path

---

### 0.3.19 — 2026-06-09 — PATCH

**Change category:** PATCH (Node.js prerequisite recovery action)

**User-visible changes:**
- Claude and Antigravity Node.js/npm prerequisite notices can now show a direct `Node.js 설치` button
- The install button opens the official Node.js download page from inside the app

**Provider/data-source changes:**
- No quota source changes
- Existing Claude and Antigravity CLI setup commands are unchanged
- Antigravity local fallback remains available when Antigravity is already running

**Packaging notes:**
- Package version updated to `0.3.19`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- The app opens the Node.js download page but does not silently install Node.js on behalf of the user

---

### 0.3.18 — 2026-06-09 — PATCH

**Change category:** PATCH (Antigravity CLI setup flow)

**User-visible changes:**
- Antigravity setup now uses a combined CLI install/login action through `npx -y antigravity-usage login`
- Antigravity guidance now states that Node.js/npm is required for the integrated CLI setup button
- Antigravity local fallback remains available when Antigravity is already running, even if CLI setup is not available

**Provider/data-source changes:**
- Antigravity login startup now checks for `npx` before opening the CLI setup command
- Existing collection order is preserved: `antigravity-usage` Google, `antigravity-usage` auto, embedded Antigravity local probe, then Gemini CLI OAuth fallback

**Packaging notes:**
- Package version updated to `0.3.18`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Users must install Node.js/npm before the app can run the `antigravity-usage` CLI setup command

---

### 0.3.17 — 2026-06-09 — PATCH

**Change category:** PATCH (Codex prerequisite wording)

**User-visible changes:**
- Codex setup guidance now states that Codex Desktop installation and login are required before usage collection
- Codex troubleshooting copy now directs users to verify Codex Desktop before setting `CODEX_CLI_PATH`

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.17`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Codex quota collection still requires a Codex app-server compatible executable and authenticated Codex session

---

### 0.3.16 — 2026-06-09 — PATCH

**Change category:** PATCH (Claude setup flow clarification)

**User-visible changes:**
- Claude setup now treats Node.js/npm as the required prerequisite before attempting usage collection
- The Claude action button now presents a combined "Claude CLI install and login" flow
- Claude guidance now explains that the app runs the `npx` Claude Code OAuth command when Node.js/npm is available

**Provider/data-source changes:**
- Claude login startup now uses the integrated `npx -y @anthropic-ai/claude-code auth login --claudeai` path instead of preferring an already installed `claude` command
- Claude usage collection still uses the existing OAuth usage API plus local log fallback

**Packaging notes:**
- Package version updated to `0.3.16`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Users must install Node.js/npm before the app can run the Claude CLI setup command

---

### 0.3.15 — 2026-06-08 — PATCH

**Change category:** PATCH (Claude login feedback and timeout)

**User-visible changes:**
- Claude usage linking now stops the pending state after 30 seconds instead of waiting up to 20 minutes
- The dashboard now shows an in-app reason when Claude CLI or `npx` cannot be found, or when OAuth usage linking does not complete in time

**Provider/data-source changes:**
- Claude login startup now checks for `claude` or `npx` on PATH before opening the login command
- Claude usage collection still uses the existing OAuth usage API plus local log fallback

**Packaging notes:**
- Package version updated to `0.3.15`
- `win-unpacked` development executable should be refreshed because the app version changed
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Claude server quota still requires Claude Code OAuth credentials and an OAuth usage response after browser authentication

---

### 0.3.14 — 2026-06-08 — PATCH

**Change category:** PATCH (Codex CLI discovery reliability)

**User-visible changes:**
- Codex quota collection now works across more Windows Codex install layouts without requiring `CODEX_CLI_PATH`
- Codex connection errors now report a clearer missing executable message when no usable CLI is found

**Provider/data-source changes:**
- Codex executable discovery now checks `CODEX_CLI_PATH`, the legacy direct local path, hashed local install folders, WindowsApps bundled resources, and PATH candidates in order
- The app still uses the existing Codex `app-server` quota source after resolving the executable path

**Packaging notes:**
- Package version updated to `0.3.14`
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Codex quota collection still requires a Codex CLI/app-server version that supports account rate limit reads and an authenticated Codex session

---

### 0.3.13 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity CLI-first collection)

**User-visible changes:**
- Antigravity collection now prefers the globally installed `antigravity-usage` CLI
- Antigravity usage linking now opens `antigravity-usage login`
- Dashboard guidance now explains the CLI Google path, CLI local path, and embedded fallbacks

**Provider/data-source changes:**
- Collection order is `antigravity-usage --method google`, then `antigravity-usage --method auto`, then embedded Antigravity local probe, then Gemini CLI OAuth fallback
- `antigravity-usage` model quota fields are normalized into the app's existing remaining/reset display model
- Account email and token fields from CLI output are discarded before renderer display

**Packaging notes:**
- Package version updated to `0.3.13`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- `antigravity-usage` must be installed globally or available on `PATH` for CLI-first collection

---

### 0.3.12 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity normalized plan tiers)

**User-visible changes:**
- Antigravity/Gemini plan labels are normalized to `Free`, `Plus`, `Pro`, or `Ultra`
- Unknown or ambiguous plan responses display `확인 필요`
- Dashboard recovery guidance now directs users to refresh, run `사용량 수집 연동`, complete Google OAuth, or re-check after a recent plan change

**Provider/data-source changes:**
- Gemini Code Assist plan collection now reads `paidTier` and `currentTier` id/name fields, preferring the paid tier when present
- No sensitive account identifiers are displayed or logged

**Packaging notes:**
- Package version updated to `0.3.12`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- `Plus` is shown only when the provider response includes Plus-identifying text

---

### 0.3.11 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity plan naming)

**User-visible changes:**
- Antigravity Gemini OAuth fallback plan labels now use Gemini-oriented names such as `Gemini 유료`, `Gemini Free`, `Gemini Workspace`, and `Gemini Legacy`
- Unknown Gemini OAuth fallback plans now display as `Gemini` instead of `Google AI`

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.11`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- The collector still avoids claiming exact Pro or Ultra names unless the provider response supplies a specific plan name

---

### 0.3.10 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity dashboard field simplification)

**User-visible changes:**
- Antigravity dashboard now shows only plan and Gemini quota
- Non-Gemini quota and collection source rows were removed from the dashboard to avoid overclaiming unstable quota signals
- Gemini shared quota label was shortened to `Gemini 한도`
- Gemini OAuth fallback plan names now use conservative `Google AI` labels instead of source names

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.10`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- Collection source remains available through settings guidance and diagnostics, not as a default dashboard row

---

### 0.3.9 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity guide copy alignment)

**User-visible changes:**
- Antigravity dashboard issue guidance now refers to the `사용량 수집 연동` action directly
- Settings guidance now describes Gemini shared quota display and the local-first/OAuth-fallback collection flow
- Antigravity guidance copy was shortened to action-focused recovery steps

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.9`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- The collection link action starts Gemini CLI OAuth fallback setup; Antigravity local sessions still require Antigravity itself to be running

---

### 0.3.8 — 2026-06-03 — PATCH

**Change category:** PATCH (Antigravity shared quota display and collection linking)

**User-visible changes:**
- Antigravity dashboard fields now show Gemini shared quota instead of separate Pro, Flash, and Flash Lite rows
- Non-Gemini quota is shown separately when the collector can detect it
- Antigravity card now includes a usage collection link action for the Gemini CLI OAuth fallback path
- Collection source is shown as Antigravity local or Gemini OAuth

**Provider/data-source changes:**
- Added a renderer/main IPC path to launch Gemini CLI OAuth setup through `npx -y @google/gemini-cli`
- No new Antigravity public API dependency added

**Packaging notes:**
- Package version updated to `0.3.8`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- The Antigravity local path still depends on a running local language server
- The collection link action can start Gemini CLI OAuth fallback setup, but cannot automatically authenticate Antigravity local sessions

---

### 0.3.7 — 2026-06-03 — PATCH

**Change category:** PATCH (dashboard guide space allocation)

**User-visible changes:**
- Dashboard provider cards now reserve a fixed area for action guidance
- Antigravity's four quota rows stay compact so recovery steps remain visible
- Issue guidance copy was shortened to action-focused steps

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.7`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- Very long provider values are clamped in the card and may need hover/detail support in a future UI pass

---

### 0.3.6 — 2026-06-03 — PATCH

**Change category:** PATCH (dashboard card sizing)

**User-visible changes:**
- Dashboard provider cards now use a fixed visual height so long issue guidance does not resize neighboring cards
- Usage field values are clamped to a compact two-line display
- Longer issue and collection guidance content scrolls inside its own panel

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.6`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- Very long provider diagnostics may require scrolling inside the card

---

### 0.3.5 — 2026-06-03 — PATCH

**Change category:** PATCH (dashboard issue guidance and settings source guide)

**User-visible changes:**
- Routine provider usage collection path guidance moved from dashboard cards to each provider item in Settings
- Dashboard provider cards now show reason and recovery steps only when usage or server quota cannot be displayed
- Antigravity failure guidance now points users to local language server checks first and Gemini CLI OAuth fallback setup after that

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.5`
- No portable executable packaged because patch releases do not produce portable artifacts by default
- `win-unpacked` development executable should be refreshed for local verification

**Known limitations:**
- Antigravity usage still requires either a running local language server or Gemini CLI Google OAuth credentials

---

### 0.3.4 — 2026-06-03 — PATCH

**Change category:** PATCH (dashboard provider guidance)

**User-visible changes:**
- Dashboard provider cards now show usage collection paths directly in the app
- Antigravity guidance explains the local language server path first and Gemini CLI OAuth fallback requirements after it
- Provider error cards show the current collection failure state alongside the guide

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.4`
- No portable executable packaged because patch releases do not produce portable artifacts by default

**Known limitations:**
- Antigravity usage still requires either a running local language server or Gemini CLI Google OAuth credentials

---

### 0.3.3 — 2026-06-03 — PATCH

**Change category:** PATCH (overlay text readability polish)

**User-visible changes:**
- Overlay provider backing was removed so the overlay remains visually lighter on the desktop
- Overlay text now uses brighter gray coloring, a thicker dark stroke, and layered shadow for stronger readability without a background panel

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.3`

**Known limitations:**
- On very bright or similarly gray backgrounds, readability still depends on text stroke and shadow contrast

---

### 0.3.2 — 2026-06-03 — PATCH

**Change category:** PATCH (overlay readability polish)

**User-visible changes:**
- Overlay text uses softer gray coloring with the existing enlarged dark stroke
- Overlay provider groups now have a subtle translucent backing, thin border, and shadow to improve contrast over mixed desktop backgrounds

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.2`

**Known limitations:**
- Very busy or similarly gray desktop backgrounds may still require higher overlay opacity in settings

---

### 0.3.1 — 2026-06-03 — PATCH

**Change category:** PATCH (overlay display alignment, UI polish, documentation policy)

**User-visible changes:**
- Overlay fields now use the same provider field model as the dashboard
- Overlay display settings now filter plan/quota details consistently with the configured provider display items
- Claude connection action remains visible in the card header and keeps the pending "link check" state without rendering a duplicate button
- Overlay text stroke width increased for better readability
- README now documents the current final project state without duplicating change history

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- Package version updated to `0.3.1`

**Known limitations:**
- Antigravity quota still depends on the local language server or Gemini CLI OAuth fallback being available

---

### 0.3.0 — 2026-05-28 — MINOR

**Change category:** MINOR (provider data-source addition)

**User-visible changes:**
- Gemini/Antigravity quota is now read from the local language server process directly when available, removing the dependency on the Gemini CLI OAuth path
- Model window labels are now sourced from the API response (`label` field) instead of being hardcoded, so future model name changes reflect automatically

**Provider/data-source changes:**
- Added `antigravity-local` source: probes the Antigravity language server's listening ports via gRPC-JSON to retrieve quota data without OAuth
- `antigravity-local` is attempted first; falls back to `gemini-cli-oauth` if local probe fails
- Endpoint changed to `daily-cloudcode-pa.googleapis.com` for the OAuth path

**Packaging notes:**
- No executable packaged for this milestone (dev stabilization phase)
- Version reflected in `package.json`, `package-lock.json`, and `RELEASE_VERSION_POLICY.md`

**Known limitations:**
- Antigravity local probe requires the language server process to be running with accessible ports
- Port enumeration relies on `netstat` on Windows; may miss ephemeral ports on first probe

---

### 0.2.7 — 2026-05-27 — PATCH

**Change category:** PATCH (connection flow and IPC polish)

**User-visible changes:**
- Claude CLI login completion detection is more reliable: polls usage after OAuth link opens instead of waiting a fixed delay
- Force-refresh parameters added to `getClaudeUsage` and `getCliSessionStatus` IPC handlers so callers can bypass the 15s cache
- Exit dialog now shows a Minimize button only when `closeToTray` is enabled

**Provider/data-source changes:**
- No provider source changes

**Packaging notes:**
- No executable packaged

**Known limitations:**
- Login polling may time out if the browser flow takes more than ~60 seconds

---

### 0.2.4 — 2026-05-26 — MINOR

**Change category:** MINOR (reliability, tray UX, and internal cleanup)

**User-visible changes:**
- Tray menu: added **Refresh usage** item and **Overlay items** submenu with per-provider checkboxes
- Minimize-to-tray now available via tray IPC handler
- Child processes spawned for Codex are now tracked and killed on app exit/quit

**Provider/data-source changes:**
- Codex IPC no longer double-spawns when overlay and dashboard request usage simultaneously (promise deduplication)
- Stack overflow in Codex usage result formatter fixed (`reduce` replaces spread accumulator)
- Claude log JSONL files now use mtime-based incremental read (avoids full re-parse on every poll)
- Gemini CLI path resolution switched from `spawnSync` to async `spawn` (non-blocking main process)
- Gemini OAuth client credentials cached once per process lifetime

**Packaging notes:**
- No executable packaged

**Known limitations:**
- Tray per-provider toggle writes both `providers` and `providerItems` keys; minor redundancy

---

### 0.1.2 — 2026-05-25/26 — PATCH

**Change category:** PATCH (documentation and workflow)

**User-visible changes:**
- No user-visible code changes

**Provider/data-source changes:**
- None

**Packaging notes:**
- Added `AGENTS.md` with branch workflow, commit format, and security rules
- Added `RELEASE_VERSION_POLICY.md` with versioning rules
- README substantially expanded with setup, tray usage, and overlay instructions

**Known limitations:**
- None added

---

### 0.1.1 — 2026-05-25 — PATCH

**Change category:** PATCH (overlay and monitoring improvements)

**User-visible changes:**
- Overlay display improvements and usage monitoring reliability

**Provider/data-source changes:**
- Gemini integration improvements

**Packaging notes:**
- No executable packaged

**Known limitations:**
- None recorded

---

### 0.1.0 — 2026-05-24 — MAJOR

**Change category:** MAJOR (initial packaged release)

**User-visible changes:**
- Codex quota display
- Claude quota display
- Antigravity (Gemini) quota display via Gemini CLI OAuth path
- Transparent always-on-top overlay (bottom-right, click-through)
- System tray icon with show/hide and exit options
- Single-instance enforcement

**Provider/data-source changes:**
- Codex: JSON-RPC subprocess against Codex CLI
- Claude: OAuth usage API via `~/.claude/.credentials.json`
- Gemini/Antigravity: `cloudcode-pa.googleapis.com` quota API via Gemini CLI OAuth credentials

**Packaging notes:**
- Portable Windows x64 exe: `TokenMonitor-0.1.0-x64.exe`

**Known limitations:**
- Gemini CLI must be installed and authenticated for Antigravity quota to display
- Claude credentials file must exist at the default path

---

## Do Not

- Do not jump to `1.0.0` for partial work.
- Do not change the version for purely experimental changes that are not kept.
- Do not change the app/exe release version for documentation-only or instruction-only work unless explicitly requested.
- Do not package with stale `electron-builder`, `npm run dist:win`, `node`, `makensis`, or `signtool` processes still running.
- Do not keep older `TokenMonitor-*-x64.exe` files when creating a higher version executable.
- Do not log OAuth tokens, refresh tokens, account emails, or account IDs while testing release changes.
