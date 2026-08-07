import { app, BrowserView, BrowserWindow, Menu, Tray, dialog, ipcMain, screen, shell, type OpenDialogOptions } from "electron";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClaudeUsage } from "./claude-usage.js";
import { getCliSessionStatus } from "./cli-session.js";
import {
  getCodexPathStatus,
  getCodexUsage,
  killAllActiveChildProcesses,
  setAppVersion,
  setCodexExecutablePath,
  validateCodexExecutablePath,
  type CodexPathStatus,
  type CodexUsageErrorCode
} from "./codex-usage.js";
import { getDeveloperEnvStatus, isDeveloperMode } from "./dev-mode.js";
import {
  parseGeminiAppsUsageText,
  readGeminiAppsParseDebug,
  readGeminiAppsSessionStatus,
  writeGeminiAppsParseDebug,
  writeGeminiAppsSessionStatus,
  writeGeminiAppsUsageCache
} from "./gemini-apps-usage.js";
import { getGeminiUsage } from "./gemini-usage.js";
import { defaultOverlaySettings, normalizeOverlaySettings, type OverlaySettings, type ProviderId } from "./overlay-settings.js";
import {
  defaultProviderSettings,
  loadProviderSettings,
  saveProviderSettings,
  type ProviderSettings
} from "./provider-settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const preloadPath = path.join(__dirname, "../electron/preload.cjs");
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let overlaySettings: OverlaySettings = defaultOverlaySettings;
let providerSettings: ProviderSettings = defaultProviderSettings;
let codexPathConnection: CodexPathStatus["connection"] = "unchecked";
let codexPathDetail = "Codex 실행 파일을 확인하고 있습니다.";
let isQuitting = false;
let usagePromise: ReturnType<typeof getCodexUsage> | null = null;
let usageCache: Awaited<ReturnType<typeof getCodexUsage>> | null = null;
let usageCacheTime = 0;
let claudeUsagePromise: ReturnType<typeof getClaudeUsage> | null = null;
let claudeUsageCache: Awaited<ReturnType<typeof getClaudeUsage>> | null = null;
let claudeUsageCacheTime = 0;
let geminiUsagePromise: ReturnType<typeof getGeminiUsage> | null = null;
let geminiUsageCache: Awaited<ReturnType<typeof getGeminiUsage>> | null = null;
let geminiUsageCacheTime = 0;
let geminiBrowserView: BrowserView | null = null;
let geminiBrowserMode: "login" | "usage" | null = null;
let geminiBrowserTimer: NodeJS.Timeout | null = null;
let geminiBlockingWindow: BrowserWindow | null = null;
let geminiBrowserBounds: GeminiViewBounds | null = null;
let cliSessionPromise: ReturnType<typeof getCliSessionStatus> | null = null;
let cliSessionCache: Awaited<ReturnType<typeof getCliSessionStatus>> | null = null;
let cliSessionCacheTime = 0;
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const initialOverlayDelayMs = 1200;
const codexDiagnosticIssues = new Map<string, {
  code: string;
  order: number;
  title: string;
  detail: string;
  resolution: string[];
  occurredAt: string;
  lastOccurredAt: string;
  count: number;
  resolvedAt: string | null;
}>();
const trayProviderLabels: Record<ProviderId, string> = {
  codex: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini"
};

function terminateDuplicatePortableParent() {
  if (process.platform !== "win32" || !app.isPackaged || process.ppid <= 0) {
    return;
  }

  const parent = readWindowsProcessInfo(process.ppid);
  if (!parent?.executablePath) {
    return;
  }

  const parentName = path.basename(parent.executablePath);
  if (!/^TokenMonitor-\d+\.\d+\.\d+-x64\.exe$/i.test(parentName)) {
    return;
  }

  try {
    process.kill(process.ppid);
  } catch {
    // The duplicate portable wrapper may already be exiting.
  }
}

function readWindowsProcessInfo(processId: number) {
  if (!Number.isInteger(processId) || processId <= 0) {
    return null;
  }

  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process -Filter "ProcessId = ${processId}" | Select-Object ParentProcessId,ExecutablePath | ConvertTo-Json -Compress`
      ],
      { encoding: "utf8", timeout: 1500, windowsHide: true }
    ).trim();
    if (!output) {
      return null;
    }

    const parsed = JSON.parse(output) as { ParentProcessId?: unknown; ExecutablePath?: unknown };
    return {
      parentProcessId: typeof parsed.ParentProcessId === "number" ? parsed.ParentProcessId : 0,
      executablePath: typeof parsed.ExecutablePath === "string" ? parsed.ExecutablePath : null
    };
  } catch {
    return null;
  }
}

function installKoreanMenu() {
  Menu.setApplicationMenu(null);
}

function getOverlaySettingsPath() {
  return path.join(app.getPath("userData"), "overlay-settings.json");
}

function loadOverlaySettings() {
  try {
    const raw = fs.readFileSync(getOverlaySettingsPath(), "utf8");
    overlaySettings = normalizeOverlaySettings(JSON.parse(raw) as Partial<OverlaySettings>);
  } catch {
    overlaySettings = defaultOverlaySettings;
  }
}

function saveOverlaySettings() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(getOverlaySettingsPath(), JSON.stringify(overlaySettings, null, 2));
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function minimizeMainWindowToTray() {
  createTray();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function quitApp() {
  isQuitting = true;
  killAllActiveChildProcesses();

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }

  tray?.destroy();
  tray = null;
  app.quit();
}

function closeOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  closeEmbeddedGeminiView("hidden");
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const menu = Menu.buildFromTemplate([
    {
      label: "Open Token Monitor",
      click: showMainWindow
    },
    {
      label: overlaySettings.enabled ? "오버레이 끄기" : "오버레이 켜기",
      click: () => applyOverlaySettings({ ...overlaySettings, enabled: !overlaySettings.enabled })
    },
    {
      label: "Refresh usage",
      click: requestUsageRefresh
    },
    {
      label: "Overlay items",
      submenu: (Object.keys(trayProviderLabels) as ProviderId[]).map((id) => ({
        label: trayProviderLabels[id],
        type: "checkbox" as const,
        checked: overlaySettings.providerItems[id]?.enabled ?? overlaySettings.providers[id],
        click: () => toggleTrayProvider(id)
      }))
    },
    { type: "separator" },
    {
      label: "종료",
      click: quitApp
    }
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip("Token Monitor");
}

function toggleTrayProvider(id: ProviderId) {
  const currentItem = overlaySettings.providerItems[id] ?? defaultOverlaySettings.providerItems[id];
  const enabled = !(currentItem.enabled ?? overlaySettings.providers[id]);

  applyOverlaySettings({
    ...overlaySettings,
    providers: {
      ...overlaySettings.providers,
      [id]: enabled
    },
    providerItems: {
      ...overlaySettings.providerItems,
      [id]: {
        ...currentItem,
        enabled
      }
    }
  });
}

function clearUsageCaches() {
  usageCache = null;
  usageCacheTime = 0;
  claudeUsageCache = null;
  claudeUsageCacheTime = 0;
  geminiUsageCache = null;
  geminiUsageCacheTime = 0;
  cliSessionCache = null;
  cliSessionCacheTime = 0;
}

function requestUsageRefresh() {
  clearUsageCaches();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("usage:refresh-requested");
    }
  }
}

function createTray() {
  if (tray) {
    updateTrayMenu();
    return tray;
  }

  tray = new Tray(path.join(__dirname, "../build/icon.ico"));
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
  updateTrayMenu();
  return tray;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "Token Monitor",
    icon: path.join(__dirname, "../build/icon.ico"),
    show: true,
    backgroundColor: "#f7f7f2",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173");
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  window.once("ready-to-show", () => {
    window.focus();
  });

  window.webContents.once("did-finish-load", () => {
    if (!window.isVisible()) {
      window.show();
      window.focus();
    }
  });

  mainWindow = window;
  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    if (!overlaySettings.closeToTray) {
      event.preventDefault();
      showMainWindow();
      window.webContents.send("app-exit:confirm-requested");
      return;
    }

    event.preventDefault();
    window.hide();
  });

  window.on("closed", () => {
    mainWindow = null;
  });
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 310,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    title: "Token Monitor Overlay",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  positionOverlayWindow();

  if (isDev) {
    void overlayWindow.loadURL("http://127.0.0.1:5173/?view=overlay#overlay");
  } else {
    void overlayWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      hash: "overlay",
      query: { view: "overlay" }
    });
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  overlayWindow.webContents.once("did-finish-load", () => {
    overlayWindow?.webContents.send("overlay-settings:changed", overlaySettings);
  });

  return overlayWindow;
}

function positionOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const margin = 4;
  const [width, height] = overlayWindow.getSize();

  overlayWindow.setBounds({
    x: area.x + area.width - width - margin,
    y: area.y + area.height - height - margin,
    width,
    height
  });
}

function applyOverlaySettings(settings: OverlaySettings) {
  overlaySettings = normalizeOverlaySettings(settings);
  saveOverlaySettings();

  if (overlaySettings.enabled) {
    const window = createOverlayWindow();
    positionOverlayWindow();
    window.showInactive();
  } else if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }

  overlayWindow?.webContents.send("overlay-settings:changed", overlaySettings);
  updateTrayMenu();
}

function readCodexUsageShared(force = false) {
  const now = Date.now();
  if (!force && usageCache && now - usageCacheTime < 15_000) {
    return Promise.resolve(usageCache);
  }

  if (!usagePromise) {
    usagePromise = getCodexUsage()
      .then((result) => {
        updateCodexRuntimeStatus(result);
        usageCache = result;
        usageCacheTime = Date.now();
        return result;
      })
      .finally(() => {
        usagePromise = null;
      });
  }

  return usagePromise;
}

function readClaudeUsageShared(force = false) {
  const now = Date.now();
  if (!force && claudeUsageCache && now - claudeUsageCacheTime < 15_000) {
    return Promise.resolve(claudeUsageCache);
  }

  if (!claudeUsagePromise) {
    claudeUsagePromise = getClaudeUsage()
      .then((result) => {
        claudeUsageCache = result;
        claudeUsageCacheTime = Date.now();
        return result;
      })
      .finally(() => {
        claudeUsagePromise = null;
      });
  }

  return claudeUsagePromise;
}

function scheduleInitialOverlayLoad() {
  if (!overlaySettings.enabled) {
    return;
  }

  setTimeout(() => {
    if (!isQuitting && overlaySettings.enabled) {
      applyOverlaySettings(overlaySettings);
    }
  }, initialOverlayDelayMs);
}

function readGeminiUsageShared(force = false) {
  const now = Date.now();
  if (!force && geminiUsageCache && now - geminiUsageCacheTime < 15_000) {
    return Promise.resolve(geminiUsageCache);
  }

  if (!geminiUsagePromise) {
    geminiUsagePromise = Promise.resolve()
      .then(async () => {
        return getGeminiUsage();
      })
      .then((result) => {
        geminiUsageCache = result;
        geminiUsageCacheTime = Date.now();
        return result;
      })
      .finally(() => {
        geminiUsagePromise = null;
      });
  }

  return geminiUsagePromise;
}

function readCliSessionShared(force = false) {
  const now = Date.now();
  if (!force && cliSessionCache && now - cliSessionCacheTime < 60_000) {
    return Promise.resolve(cliSessionCache);
  }

  if (!cliSessionPromise) {
    cliSessionPromise = readCodexUsageShared()
      .then((codexResult) => getCliSessionStatus(codexResult))
      .then((result) => {
        cliSessionCache = result;
        cliSessionCacheTime = Date.now();
        return result;
      })
      .finally(() => {
        cliSessionPromise = null;
      });
  }

  return cliSessionPromise;
}

function invalidateCodexCaches() {
  usageCache = null;
  usageCacheTime = 0;
  cliSessionCache = null;
  cliSessionCacheTime = 0;
}

function updateCodexRuntimeStatus(result: Awaited<ReturnType<typeof getCodexUsage>>) {
  if (result.ok) {
    codexPathConnection = "connected";
    codexPathDetail = "Codex Desktop 연결을 확인했습니다.";
    const resolvedAt = new Date().toISOString();
    for (const issue of codexDiagnosticIssues.values()) {
      if (!issue.resolvedAt) {
        issue.resolvedAt = resolvedAt;
      }
    }
    return;
  }

  codexPathConnection = result.errorCode === "login-required" ? "login-required" : "failed";
  codexPathDetail = result.error;
  recordCodexIssue(result.errorCode, result.updatedAt);
}

function recordCodexIssue(code: CodexUsageErrorCode | "settings-save-failed", occurredAt = new Date().toISOString()) {
  const definition = getCodexIssueDefinition(code);
  const existing = codexDiagnosticIssues.get(code);
  if (existing) {
    existing.count += 1;
    existing.lastOccurredAt = occurredAt;
    existing.resolvedAt = null;
    return;
  }
  codexDiagnosticIssues.set(code, {
    code,
    ...definition,
    occurredAt,
    lastOccurredAt: occurredAt,
    count: 1,
    resolvedAt: null
  });
}

function getCodexIssueDefinition(code: CodexUsageErrorCode | "settings-save-failed") {
  const definitions = {
    "desktop-not-installed": {
      order: 10,
      title: "Codex Desktop 미설치",
      detail: "Codex Desktop 설치를 확인하지 못했습니다.",
      resolution: ["Codex Desktop을 설치합니다.", "ChatGPT 계정으로 로그인한 뒤 다시 확인합니다."]
    },
    "executable-not-found": {
      order: 20,
      title: "Codex 실행 파일 자동 탐색 실패",
      detail: "설치된 Codex Desktop에서 codex.exe를 찾지 못했습니다.",
      resolution: ["자동 탐색을 다시 실행합니다.", "계속 실패하면 설정 탭에서 codex.exe 경로를 선택합니다."]
    },
    "invalid-configured-path": {
      order: 30,
      title: "사용자 지정 Codex 경로 오류",
      detail: "설정된 codex.exe가 이동되었거나 삭제되었습니다.",
      resolution: ["설정 탭에서 다른 경로를 선택합니다.", "자동 설정으로 복원합니다."]
    },
    "access-denied": {
      order: 40,
      title: "Codex 실행 파일 접근 거부",
      detail: "선택한 Codex 실행 파일을 현재 권한으로 시작할 수 없습니다.",
      resolution: ["다른 Codex Desktop 경로를 선택합니다.", "Windows 보안 또는 조직 정책을 확인합니다."]
    },
    "app-server-start-failed": {
      order: 50,
      title: "Codex 로컬 서버 시작 실패",
      detail: "Codex 실행 파일은 발견했지만 로컬 사용량 서버를 시작하지 못했습니다.",
      resolution: ["Codex Desktop을 최신 버전으로 업데이트합니다.", "Codex Desktop을 한 번 실행한 뒤 다시 시도합니다."]
    },
    "app-server-timeout": {
      order: 55,
      title: "Codex 로컬 서버 응답 시간 초과",
      detail: "Codex 로컬 사용량 서버가 제한시간 안에 응답하지 않았습니다.",
      resolution: ["Codex Desktop을 실행한 상태에서 다시 시도합니다.", "계속되면 공식 사용량 대시보드에서 확인합니다."]
    },
    "login-required": {
      order: 60,
      title: "Codex 로그인 필요",
      detail: "Codex Desktop의 ChatGPT 로그인을 확인하지 못했습니다.",
      resolution: ["Codex Desktop에서 ChatGPT 계정으로 로그인합니다.", "로그인 후 다시 확인합니다."]
    },
    "usage-read-failed": {
      order: 70,
      title: "Codex 사용량 조회 실패",
      detail: "현재 Codex 사용량을 읽을 수 없습니다.",
      resolution: ["잠시 후 다시 시도합니다.", "공식 Codex 사용량 대시보드에서 확인합니다."]
    },
    "unsupported-response": {
      order: 80,
      title: "Codex 응답 형식 확인 필요",
      detail: "현재 Codex Desktop의 사용량 응답을 해석할 수 없습니다.",
      resolution: ["Token Monitor와 Codex Desktop 업데이트를 확인합니다.", "공식 사용량 대시보드에서 확인합니다."]
    },
    "settings-save-failed": {
      order: 90,
      title: "Codex 경로 설정 저장 실패",
      detail: "검증한 Codex 경로를 로컬 설정에 저장하지 못했습니다.",
      resolution: ["설정 저장을 다시 시도합니다.", "자동 설정으로 복원합니다."]
    }
  } satisfies Record<CodexUsageErrorCode | "settings-save-failed", {
    order: number;
    title: string;
    detail: string;
    resolution: string[];
  }>;
  return definitions[code];
}

function readCodexPathSettings() {
  return getCodexPathStatus(codexPathConnection, codexPathDetail);
}

async function applyCodexExecutablePath(candidate: string) {
  const validation = await validateCodexExecutablePath(candidate);
  if (!validation.ok) {
    recordCodexIssue("invalid-configured-path");
    return { ok: false, canceled: false, status: readCodexPathSettings(), detail: validation.detail };
  }

  try {
    providerSettings = saveProviderSettings({ ...providerSettings, codexExecutablePath: candidate.trim() });
    setCodexExecutablePath(providerSettings.codexExecutablePath);
    codexPathConnection = validation.connection;
    codexPathDetail = validation.detail;
    invalidateCodexCaches();
    const usage = await readCodexUsageShared(true);
    return { ok: true, canceled: false, status: readCodexPathSettings(), usage };
  } catch {
    recordCodexIssue("settings-save-failed");
    return {
      ok: false,
      canceled: false,
      status: readCodexPathSettings(),
      detail: "Codex 경로 설정을 저장하지 못했습니다."
    };
  }
}

async function selectCodexExecutablePath() {
  const options: OpenDialogOptions = {
    title: "Codex 실행 파일 선택",
    properties: ["openFile"],
    filters: [{ name: "Codex 실행 파일", extensions: ["exe"] }]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, canceled: true, status: readCodexPathSettings() };
  }
  return applyCodexExecutablePath(result.filePaths[0]);
}

async function resetCodexExecutablePath() {
  try {
    providerSettings = saveProviderSettings({ ...providerSettings, codexExecutablePath: null });
    setCodexExecutablePath(null);
    codexPathConnection = "unchecked";
    codexPathDetail = "Codex 실행 경로를 자동으로 탐색합니다.";
    invalidateCodexCaches();
    const usage = await readCodexUsageShared(true);
    return { ok: usage.ok, canceled: false, status: readCodexPathSettings(), usage };
  } catch {
    recordCodexIssue("settings-save-failed");
    return {
      ok: false,
      canceled: false,
      status: readCodexPathSettings(),
      detail: "자동 경로 설정을 저장하지 못했습니다."
    };
  }
}

async function readDeveloperDiagnosticsBase() {
  if (!isDeveloperMode()) {
    return { enabled: false, generatedAt: new Date().toISOString(), providers: [], geminiParser: null };
  }

  const [codex, claude, gemini, sessions] = await Promise.all([
    readCodexUsageShared(),
    readClaudeUsageShared(true),
    readGeminiUsageShared(true),
    readCliSessionShared(true)
  ]);

  return {
    enabled: true,
    generatedAt: new Date().toISOString(),
    providers: [
      {
        id: "codex",
        name: "ChatGPT",
        account: codex.ok ? codex.account : null,
        userPrerequisites: [
          "Codex Desktop 설치",
          "OpenAI/ChatGPT 계정 로그인",
          "Codex app-server 사용량 응답 가능 상태"
        ],
        checks: [
          {
            method: "Codex Desktop app-server",
            status: codex.ok ? "success" : "failed",
            detail: codex.ok
              ? `plan=${codex.planType ?? "unknown"}, fiveHour=${codex.fiveHour ? `${codex.fiveHour.remainingPercent}%` : "none"}, weekly=${codex.weekly ? `${codex.weekly.remainingPercent}%` : "none"}`
              : codex.error
          },
          {
            method: "Codex CLI session",
            status: sessions.codex.loggedIn ? "success" : sessions.codex.installed ? "failed" : "skipped",
            detail: sessions.codex.detail
          }
        ]
      },
      {
        id: "claude",
        name: "Claude",
        account: sessions.claude.account,
        userPrerequisites: [
          "Node.js/npm 설치",
          "Claude Pro/Max 이상 계정",
          "Claude Code OAuth 로그인"
        ],
        checks: [
          {
            method: "Claude CLI session",
            status: sessions.claude.loggedIn ? "success" : sessions.claude.installed ? "failed" : "skipped",
            detail: sessions.claude.detail
          },
          {
            method: "Claude OAuth usage",
            status: claude.ok && claude.oauth ? "success" : "failed",
            detail: claude.ok && claude.oauth
              ? `fiveHour=${claude.oauth.fiveHour ? `${claude.oauth.fiveHour.remainingPercent}%` : "none"}, weekly=${claude.oauth.sevenDay ? `${claude.oauth.sevenDay.remainingPercent}%` : "none"}`
              : claude.ok ? "OAuth quota 없음. local logs는 server quota 대체값이 아닙니다." : claude.error
          },
          {
            method: "Claude local logs",
            status: claude.ok ? "success" : "failed",
            detail: claude.ok ? `logFiles=${claude.logFileCount}, lastActivity=${claude.lastActivityAt ?? "none"}` : claude.error
          }
        ]
      },
      {
        id: "gemini",
        name: "Gemini / Antigravity",
        account: gemini.ok ? gemini.account : null,
        userPrerequisites: [
          "Gemini Apps 웹 로그인",
          "Usage Limits 화면에서 Gemini 5시간/주간 한도 표시",
          "Node.js/npm 설치",
          "Antigravity CLI 로그인 또는 Antigravity 실행 상태"
        ],
        checks: [
          {
            method: "Gemini Apps Usage Limits",
            status: gemini.geminiApps ? "success" : gemini.geminiAppsSession.loggedIn ? "failed" : "skipped",
            detail: gemini.geminiApps
              ? `plan=${gemini.geminiApps.plan ?? "unknown"}, fiveHour=${gemini.geminiApps.fiveHour?.remaining ?? "none"}, weekly=${gemini.geminiApps.weekly?.remaining ?? "none"}`
              : gemini.geminiAppsSession.loggedIn ? "로그인됨. 사용량 확인 버튼으로 Usage Limits 수집 필요" : "Gemini 웹 로그인 필요"
          },
          {
            method: gemini.ok ? `Antigravity quota (${gemini.source})` : `Antigravity quota (${gemini.source})`,
            status: gemini.ok ? "success" : "failed",
            detail: gemini.ok
              ? `models=${gemini.models.length}, primary=${gemini.primary ? `${gemini.primary.remainingPercent}%` : "none"}, secondary=${gemini.secondary ? `${gemini.secondary.remainingPercent}%` : "none"}`
              : gemini.error
          }
        ]
      }
    ],
    geminiParser: {
      sessionLoggedIn: gemini.geminiAppsSession.loggedIn,
      cacheAvailable: Boolean(gemini.geminiApps),
      planParsed: Boolean(gemini.geminiApps?.plan),
      fiveHourParsed: Boolean(gemini.geminiApps?.fiveHour),
      weeklyParsed: Boolean(gemini.geminiApps?.weekly),
      detail: gemini.geminiApps?.detail ?? null,
      updatedAt: gemini.geminiApps?.updatedAt ?? null
    }
  };
}

async function readDeveloperDiagnostics() {
  const startedAt = Date.now();
  const base = await readDeveloperDiagnosticsBase();
  const geminiParseDebug = readGeminiAppsParseDebug();
  const generatedAt = new Date().toISOString();
  const cacheSummary = {
    codex: usageCache && generatedAt ? describeCacheAge(usageCacheTime, 15_000) : "empty",
    claude: claudeUsageCache && generatedAt ? describeCacheAge(claudeUsageCacheTime, 15_000) : "empty",
    gemini: geminiUsageCache && generatedAt ? describeCacheAge(geminiUsageCacheTime, 15_000) : "empty",
    cliSession: cliSessionCache && generatedAt ? describeCacheAge(cliSessionCacheTime, 60_000) : "empty"
  };

  return {
    ...base,
    generatedAt,
    environment: getDeveloperEnvStatus(),
    totalDurationMs: Date.now() - startedAt,
    cacheSummary,
    codexIssues: [...codexDiagnosticIssues.values()]
      .sort((left, right) => left.order - right.order)
      .map((issue) => ({ ...issue })),
    geminiParser: base.geminiParser
      ? {
          ...base.geminiParser,
          debugUpdatedAt: geminiParseDebug?.updatedAt ?? null,
          usageDetected: geminiParseDebug?.usageDetected ?? false,
          percentCandidates: geminiParseDebug?.percentCandidates ?? [],
          snippets: geminiParseDebug?.snippets ?? []
        }
      : null
  };
}

function describeCacheAge(cacheTime: number, ttlMs: number) {
  if (!cacheTime) {
    return "empty";
  }

  const ageMs = Date.now() - cacheTime;
  return ageMs < ttlMs ? `fresh ${ageMs}ms` : `stale ${ageMs}ms`;
}

async function startClaudeLogin() {
  const sessionStatus = await getCliSessionStatus();
  const claudeUsage = await readClaudeUsageShared(true);
  cliSessionCache = sessionStatus;
  cliSessionCacheTime = Date.now();

  if (claudeUsage.ok && claudeUsage.oauth) {
    return {
      ok: true,
      command: "claude oauth usage",
      skipped: true,
      detail: "Existing Claude OAuth usage link detected"
    };
  }

  if (process.platform === "win32") {
    const npxCommand = findCommandOnPath("npx.cmd") ?? findCommandOnPath("npx.exe") ?? findCommandOnPath("npx");

    if (!npxCommand) {
      return {
        ok: false,
        command: "npx -y @anthropic-ai/claude-code auth login --claudeai",
        detail: "Claude 연동에는 Node.js/npm이 필요합니다. Node.js LTS 설치 후 Token Monitor를 다시 실행하세요."
      };
    }

    const { command, launcherPath } = writeWindowsCliLauncher(
      "claude-login",
      npxCommand,
      ["-y", "@anthropic-ai/claude-code", "auth", "login", "--claudeai"]
    );
    launchWindowsCliWindow(launcherPath);
    return { ok: true, command };
  }

  const child = spawn("npx", ["-y", "@anthropic-ai/claude-code", "auth", "login", "--claudeai"], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return { ok: true, command: "npx -y @anthropic-ai/claude-code auth login --claudeai" };
}

function findCommandOnPath(command: string) {
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, command);
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Try the next PATH entry.
    }
  }
  return null;
}

function quoteCmdArg(value: string) {
  if (/^[A-Za-z0-9_\-./:@]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function writeWindowsCliLauncher(name: string, commandPath: string, args: string[]) {
  const launcherPath = path.join(app.getPath("temp"), `token-monitor-${name}.cmd`);
  const command = [`call "${commandPath}"`, ...args.map(quoteCmdArg)].join(" ");
  const content = [
    "@echo off",
    command,
    "set TOKEN_MONITOR_EXIT_CODE=%ERRORLEVEL%",
    "echo.",
    "if not \"%TOKEN_MONITOR_EXIT_CODE%\"==\"0\" echo Command exited with code %TOKEN_MONITOR_EXIT_CODE%.",
    "echo You can close this window after login finishes."
  ].join("\r\n");
  fs.writeFileSync(launcherPath, content, "utf8");
  return { command, launcherPath };
}

function launchWindowsCliWindow(launcherPath: string) {
  const child = spawn("cmd.exe", ["/k", launcherPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
}

async function startGeminiLogin() {
  const npxCommand = findCommandOnPath(process.platform === "win32" ? "npx.cmd" : "npx")
    ?? findCommandOnPath("npx.exe")
    ?? findCommandOnPath("npx");

  if (!npxCommand) {
    return {
      ok: false,
      command: "npx -y antigravity-usage login",
      detail: "Antigravity CLI 설정에는 Node.js/npm이 필요합니다. Node.js LTS 설치 후 Token Monitor를 다시 실행하세요. Antigravity가 이미 실행 중이면 local fallback 수집은 계속 시도됩니다."
    };
  }

  if (process.platform === "win32") {
    const { command, launcherPath } = writeWindowsCliLauncher("antigravity-login", npxCommand, ["-y", "antigravity-usage", "login"]);
    launchWindowsCliWindow(launcherPath);
    return { ok: true, command };
  }

  const child = spawn(npxCommand, ["-y", "antigravity-usage", "login"], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return { ok: true, command: "npx -y antigravity-usage login" };
}

type GeminiViewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function startGeminiAppsLogin(bounds?: Partial<GeminiViewBounds>) {
  const mode: "login" | "usage" = readGeminiAppsSessionStatus().loggedIn ? "usage" : "login";
  return openEmbeddedGeminiView(mode, bounds);
}

function openEmbeddedGeminiView(mode: "login" | "usage", bounds?: Partial<GeminiViewBounds>) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, detail: "Token Monitor 대시보드 창을 찾을 수 없습니다." };
  }

  geminiBrowserMode = mode;
  if (!geminiBrowserView) {
    geminiBrowserView = new BrowserView({
      webPreferences: {
        partition: "persist:gemini-usage",
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    mainWindow.addBrowserView(geminiBrowserView);
    configureGeminiBrowserView(geminiBrowserView);
  } else if (!mainWindow.getBrowserViews().includes(geminiBrowserView)) {
    mainWindow.addBrowserView(geminiBrowserView);
  }

  mainWindow.setTopBrowserView(geminiBrowserView);
  updateEmbeddedGeminiBounds(bounds);
  startGeminiBrowserTimer();
  void geminiBrowserView.webContents.loadURL(mode === "usage" ? "https://gemini.google.com/usage" : "https://gemini.google.com/app");
  if (mode === "usage") {
    showGeminiBlockingWindow();
  } else {
    closeGeminiBlockingWindow();
  }

  return {
    ok: true,
    detail: mode === "usage"
      ? "대시보드 안에서 Gemini 사용량 확인 화면을 열었습니다."
      : "대시보드 안에서 Gemini 로그인 화면을 열었습니다."
  };
}

function configureGeminiBrowserView(view: BrowserView) {
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isGoogleOrGeminiUrl(url)) {
      void view.webContents.loadURL(url);
      return { action: "deny" };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  view.webContents.on("did-finish-load", () => {
    void inspectEmbeddedGeminiView();
  });
  view.webContents.on("did-navigate", () => {
    void inspectEmbeddedGeminiView();
  });
  view.webContents.on("did-navigate-in-page", () => {
    void inspectEmbeddedGeminiView();
  });
}

function updateEmbeddedGeminiBounds(bounds?: Partial<GeminiViewBounds>) {
  if (!mainWindow || mainWindow.isDestroyed() || !geminiBrowserView) {
    return { ok: false };
  }

  const contentBounds = mainWindow.getContentBounds();
  const next = normalizeGeminiBounds(bounds, contentBounds.width, contentBounds.height);
  geminiBrowserBounds = next;
  geminiBrowserView.setBounds(next);
  updateGeminiBlockingWindowBounds();
  return { ok: true };
}

function normalizeGeminiBounds(bounds: Partial<GeminiViewBounds> | undefined, width: number, height: number): GeminiViewBounds {
  const fallback = {
    x: 24,
    y: 140,
    width: Math.max(640, width - 48),
    height: Math.max(480, height - 170)
  };

  const next = {
    x: Math.round(Number.isFinite(bounds?.x) ? Number(bounds?.x) : fallback.x),
    y: Math.round(Number.isFinite(bounds?.y) ? Number(bounds?.y) : fallback.y),
    width: Math.round(Number.isFinite(bounds?.width) ? Number(bounds?.width) : fallback.width),
    height: Math.round(Number.isFinite(bounds?.height) ? Number(bounds?.height) : fallback.height)
  };

  next.x = Math.max(0, Math.min(next.x, width - 120));
  next.y = Math.max(0, Math.min(next.y, height - 120));
  next.width = Math.max(320, Math.min(next.width, width - next.x));
  next.height = Math.max(320, Math.min(next.height, height - next.y));
  return next;
}

function startGeminiBrowserTimer() {
  if (geminiBrowserTimer) {
    clearInterval(geminiBrowserTimer);
  }

  geminiBrowserTimer = setInterval(() => {
    void inspectEmbeddedGeminiView();
  }, 2500);
}

async function inspectEmbeddedGeminiView() {
  if (!geminiBrowserView || !geminiBrowserMode || geminiBrowserView.webContents.isDestroyed()) {
    return;
  }

  const state = await readEmbeddedGeminiState(geminiBrowserView);
  if (geminiBrowserMode === "login" && state.loggedIn) {
    writeGeminiAppsSessionStatus({ loggedIn: true, checkedAt: new Date().toISOString() });
    closeEmbeddedGeminiView("login-complete");
    requestUsageRefresh();
    return;
  }

  if (geminiBrowserMode === "usage") {
    if (state.usage) {
      writeGeminiAppsUsageCache(state.usage);
      closeEmbeddedGeminiView("usage-complete");
      requestUsageRefresh();
      return;
    }

    if (state.loggedIn) {
      await focusUsageLimitsInEmbeddedView(geminiBrowserView);
    }
  }
}

async function readEmbeddedGeminiState(view: BrowserView) {
  try {
    const text = await view.webContents.executeJavaScript(geminiReadableTextScript(), true) as string;
    writeGeminiAppsParseDebug(text);
    return {
      loggedIn: isGeminiLoggedInText(text),
      usage: parseGeminiAppsUsageText(text)
    };
  } catch {
    return { loggedIn: false, usage: null };
  }
}

function geminiReadableTextScript() {
  return `
    (() => {
      const values = [];
      const push = (value) => {
        if (value == null) return;
        const text = String(value).replace(/\\s+/g, " ").trim();
        if (text) values.push(text);
      };
      push(document.body && document.body.innerText ? document.body.innerText : "");
      const nodes = Array.from(document.querySelectorAll("*"));
      for (const node of nodes) {
        push(node.getAttribute && node.getAttribute("aria-label"));
        push(node.getAttribute && node.getAttribute("aria-valuetext"));
        push(node.getAttribute && node.getAttribute("title"));
        push(node.getAttribute && node.getAttribute("alt"));
        push(node.getAttribute && node.getAttribute("data-test-id"));
        push(node.getAttribute && node.getAttribute("data-testid"));
        push(node.getAttribute && node.getAttribute("data-value"));
        push(node.getAttribute && node.getAttribute("value"));
        push(node.getAttribute && node.getAttribute("aria-valuenow"));
        push(node.getAttribute && node.getAttribute("aria-valuemax"));
        push(node.getAttribute && node.getAttribute("aria-valuemin"));
      }
      return Array.from(new Set(values)).join("\\n");
    })()
  `;
}

function isGeminiLoggedInText(text: string) {
  const hasLoginPrompt = /sign in|log in|로그인|계정 선택/i.test(text);
  const hasGeminiSurface = /gemini|usage limits|사용량|new chat|새 채팅/i.test(text);
  return Boolean(hasGeminiSurface && !hasLoginPrompt);
}

async function focusUsageLimitsInEmbeddedView(view: BrowserView) {
  try {
    await view.webContents.executeJavaScript(`
      (() => {
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
        const candidates = Array.from(document.querySelectorAll("a, button, [role='button'], [role='menuitem']"));
        const usage = candidates.find((item) => /usage limits|usage limit|사용량 한도|사용량 제한/.test(normalize(item.innerText || item.getAttribute("aria-label"))));
        if (usage) {
          usage.click();
          return "usage";
        }
        const settings = candidates.find((item) => /settings|설정|help|도움말/.test(normalize(item.innerText || item.getAttribute("aria-label"))));
        if (settings) {
          settings.click();
          return "settings";
        }
        return "none";
      })()
    `, true);
  } catch {
    // Keep the embedded page visible so the user can open Usage Limits manually.
  }
}

function showGeminiBlockingWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (!geminiBlockingWindow || geminiBlockingWindow.isDestroyed()) {
    geminiBlockingWindow = new BrowserWindow({
      parent: mainWindow,
      modal: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      skipTaskbar: true,
      show: false,
      transparent: true,
      backgroundColor: "#00000000",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    geminiBlockingWindow.setMenu(null);
    void geminiBlockingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(geminiBlockingHtml())}`);
  }

  updateGeminiBlockingWindowBounds();
  geminiBlockingWindow.showInactive();
}

function updateGeminiBlockingWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || !geminiBlockingWindow || geminiBlockingWindow.isDestroyed() || !geminiBrowserBounds) {
    return;
  }

  const contentBounds = mainWindow.getContentBounds();
  geminiBlockingWindow.setBounds({
    x: contentBounds.x + geminiBrowserBounds.x,
    y: contentBounds.y + geminiBrowserBounds.y,
    width: geminiBrowserBounds.width,
    height: geminiBrowserBounds.height
  });
}

function closeGeminiBlockingWindow() {
  if (geminiBlockingWindow && !geminiBlockingWindow.isDestroyed()) {
    geminiBlockingWindow.destroy();
  }
  geminiBlockingWindow = null;
}

function geminiBlockingHtml() {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: rgba(247, 247, 242, 0.74);
    }
    body {
      display: grid;
      place-items: center;
      color: #20231f;
    }
    .panel {
      display: grid;
      justify-items: center;
      gap: 10px;
      width: min(360px, calc(100% - 48px));
      padding: 22px;
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid #dfe5dc;
      border-radius: 8px;
      box-shadow: 0 18px 46px rgba(23, 26, 23, 0.22);
      text-align: center;
    }
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #d8e1d7;
      border-top-color: #24483b;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    strong {
      font-size: 16px;
      font-weight: 850;
    }
    p {
      margin: 0;
      color: #68716a;
      font-size: 13px;
      line-height: 1.45;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <section class="panel" role="alert" aria-live="assertive" aria-busy="true">
    <div class="spinner" aria-hidden="true"></div>
    <strong>Gemini 사용량 확인 중</strong>
    <p>Usage Limits 화면에서 남은 사용량 %를 확인하고 대시보드에 반영하는 중입니다.</p>
  </section>
</body>
</html>`;
}

function closeEmbeddedGeminiView(reason: "login-complete" | "usage-complete" | "manual" | "hidden") {
  if (geminiBrowserTimer) {
    clearInterval(geminiBrowserTimer);
    geminiBrowserTimer = null;
  }
  closeGeminiBlockingWindow();

  if (mainWindow && !mainWindow.isDestroyed() && geminiBrowserView && mainWindow.getBrowserViews().includes(geminiBrowserView)) {
    mainWindow.removeBrowserView(geminiBrowserView);
  }

  if (geminiBrowserView && !geminiBrowserView.webContents.isDestroyed()) {
    geminiBrowserView.webContents.stop();
  }
  geminiBrowserMode = null;
  mainWindow?.webContents.send("gemini-view:closed", { reason });
}

function isGoogleOrGeminiUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith("google.com") || hostname.endsWith("gemini.google.com");
  } catch {
    return false;
  }
}

if (!gotSingleInstanceLock) {
  terminateDuplicatePortableParent();
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    setAppVersion(app.getVersion());
    loadOverlaySettings();
    providerSettings = loadProviderSettings();
    setCodexExecutablePath(providerSettings.codexExecutablePath);
    installKoreanMenu();
    createTray();

    ipcMain.handle("codex-usage:read", (_event, force?: boolean) => readCodexUsageShared(Boolean(force)));
    ipcMain.handle("claude-usage:read", (_event, force?: boolean) => readClaudeUsageShared(Boolean(force)));
    ipcMain.handle("gemini-usage:read", (_event, force?: boolean) => readGeminiUsageShared(Boolean(force)));
    ipcMain.handle("cli-session:read", (_event, force?: boolean) => readCliSessionShared(Boolean(force)));
    ipcMain.handle("developer-mode:read", () => ({ enabled: isDeveloperMode() }));
    ipcMain.handle("developer-diagnostics:read", () => readDeveloperDiagnostics());
    ipcMain.handle("claude-login:start", () => startClaudeLogin());
    ipcMain.handle("gemini-login:start", () => startGeminiLogin());
    ipcMain.handle("gemini-apps-login:start", (_event, bounds?: Partial<GeminiViewBounds>) => startGeminiAppsLogin(bounds));
    ipcMain.handle("gemini-view:bounds", (_event, bounds?: Partial<GeminiViewBounds>) => updateEmbeddedGeminiBounds(bounds));
    ipcMain.handle("gemini-view:close", () => closeEmbeddedGeminiView("manual"));
    ipcMain.handle("app:minimize-to-tray", () => minimizeMainWindowToTray());
    ipcMain.handle("app:quit", () => quitApp());
    ipcMain.handle("codex-usage:open-dashboard", () => shell.openExternal("https://chatgpt.com/codex/settings/usage"));
    ipcMain.handle("codex-path:read", () => readCodexPathSettings());
    ipcMain.handle("codex-path:select", () => selectCodexExecutablePath());
    ipcMain.handle("codex-path:update", (_event, candidate: string) => applyCodexExecutablePath(candidate));
    ipcMain.handle("codex-path:reset", () => resetCodexExecutablePath());
    ipcMain.handle("nodejs:open-download", () => shell.openExternal("https://nodejs.org/ko/download"));
    ipcMain.handle("overlay-settings:read", () => overlaySettings);
    ipcMain.handle("overlay-settings:update", (_event, nextSettings: OverlaySettings) => {
      applyOverlaySettings(nextSettings);
      return overlaySettings;
    });

    createWindow();
    scheduleInitialOverlayLoad();

    screen.on("display-metrics-changed", positionOverlayWindow);

    app.on("activate", () => {
      showMainWindow();
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  killAllActiveChildProcesses();
  closeOverlayWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !overlaySettings.closeToTray) {
    app.quit();
  }
});

process.on("exit", () => {
  killAllActiveChildProcesses();
});
