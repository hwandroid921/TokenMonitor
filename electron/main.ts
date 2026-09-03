import { app, BrowserView, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, powerMonitor, screen, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClaudeUsage } from "./claude-usage.js";
import { getCliSessionStatus } from "./cli-session.js";
import { createClaudeOAuthEnvironment, getClaudeOAuthEnvironmentResetCommands } from "./claude-oauth-env.js";
import { ensureClaudeStatusLine, getClaudeStatusLineRegistrationStatus, getClaudeStatusLineSnapshotPath, restoreClaudeStatusLine } from "./claude-statusline.js";
import {
  getCodexPathStatus,
  getCodexUsage,
  killAllActiveChildProcesses,
  setAppVersion,
  setCodexExecutablePath,
  validateCodexExecutablePath,
  type CodexPathStatus
} from "./codex-usage.js";
import {
  getDeveloperEnvStatus,
  isDeveloperMode,
  loadDeveloperEnv,
  type DeveloperProviderDiagnostic
} from "./dev-mode.js";
import { defaultProviderSettings, loadProviderSettings, saveProviderSettings, type ProviderSettings } from "./provider-settings.js";
import {
  deleteAccountAlias,
  deleteAllAccountAliases,
  deleteProviderAliases,
  initializeAccountAliases,
  listAccountAliases,
  observeAccount,
  renameAccountAlias,
  type AccountProvider
} from "./account-aliases.js";
import {
  clearGeminiAppsUsageCache,
  parseGeminiAppsUsageText,
  readGeminiAppsSessionStatus,
  writeGeminiAppsSessionStatus,
  writeGeminiAppsUsageCache
} from "./gemini-apps-usage.js";
import { getGeminiUsage } from "./gemini-usage.js";
import { defaultOverlaySettings, normalizeOverlaySettings, type OverlaySettings, type ProviderId } from "./overlay-settings.js";
import {
  defaultNotificationSettings,
  getNotificationSettings,
  initializeNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings
} from "./notification-settings.js";
import {
  evaluateQuotaAlerts,
  getUpcomingResetTimes,
  initializeQuotaAlertState,
  normalizeQuotaSamples,
  type NormalizedQuotaSample,
  type QuotaAlertEvent
} from "./quota-alerts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const preloadPath = path.join(__dirname, "../electron/preload.cjs");
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let isOverlayPositioning = false;
let tray: Tray | null = null;
let overlaySettings: OverlaySettings = defaultOverlaySettings;
let notificationSettings: NotificationSettings = defaultNotificationSettings;
let providerSettings: ProviderSettings = defaultProviderSettings;
let codexPathConnection: CodexPathStatus["connection"] = "unchecked";
let codexPathDetail: string | undefined;
let isQuitting = false;
let usagePromise: ReturnType<typeof getCodexUsage> | null = null;
let usageCache: Awaited<ReturnType<typeof getCodexUsage>> | null = null;
let usageCacheTime = 0;
let claudeUsagePromise: Promise<ReturnType<typeof getClaudeUsage>> | null = null;
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
let usageMonitorTimer: NodeJS.Timeout | null = null;
let resetMonitorTimer: NodeJS.Timeout | null = null;
let alertWindowTimer: NodeJS.Timeout | null = null;
let alertWindow: BrowserWindow | null = null;
let backgroundUsagePromise: Promise<void> | null = null;
let backgroundUsageEventsPromise: Promise<QuotaAlertEvent[]> | null = null;
let latestQuotaSamples: NormalizedQuotaSample[] = [];
let resetRetryAttempt = 0;
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const initialOverlayDelayMs = 1200;
const usageMonitorIntervalMs = 60 * 1000;
const resetGraceMs = 20_000;
const resetRetryDelaysMs = [60_000, 5 * 60_000, 10 * 60_000];
const trayProviderLabels: Record<ProviderId, string> = {
  codex: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini"
};

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
      label: "Token Monitor 열기",
      click: showMainWindow
    },
    {
      label: overlaySettings.enabled ? "오버레이 끄기" : "오버레이 켜기",
      click: () => applyOverlaySettings({ ...overlaySettings, enabled: !overlaySettings.enabled })
    },
    {
      label: "사용량 새로고침",
      click: requestUsageRefresh
    },
    {
      label: "오버레이 항목",
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

  const trayIcon = nativeImage.createFromPath(getAppIconPath());
  if (process.platform === "darwin") {
    trayIcon.setTemplateImage(true);
  }
  tray = new Tray(trayIcon);
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
  updateTrayMenu();
  return tray;
}

function getAppIconPath() {
  return path.join(__dirname, "../build", process.platform === "darwin" ? "TrayTemplate.png" : "icon.ico");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "Token Monitor",
    icon: getAppIconPath(),
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
    width: 620,
    height: 180,
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
    isOverlayPositioning = false;
  });

  overlayWindow.webContents.once("did-finish-load", () => {
    overlayWindow?.webContents.send("overlay-settings:changed", overlaySettings);
    overlayWindow?.webContents.send("overlay-positioning:changed", isOverlayPositioning);
  });

  return overlayWindow;
}

function positionOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const display = getOverlayDisplay();
  const area = display.workArea;
  const [width, height] = overlayWindow.getSize();
  const { right, bottom } = getOverlayOffsets(area, width, height);

  overlayWindow.setBounds({
    x: area.x + area.width - width - right,
    y: area.y + area.height - height - bottom,
    width,
    height
  });
}

function getOverlayDisplay() {
  if (overlaySettings.position.mode === "custom" && overlaySettings.position.displayId !== undefined) {
    const savedDisplay = screen.getAllDisplays().find((display) => display.id === overlaySettings.position.displayId);
    if (savedDisplay) {
      return savedDisplay;
    }
  }
  return screen.getPrimaryDisplay();
}

function getOverlayOffsets(area: Electron.Rectangle, width: number, height: number) {
  const defaultMargin = 4;
  const maximumRight = Math.max(defaultMargin, area.width - width - defaultMargin);
  const maximumBottom = Math.max(defaultMargin, area.height - height - defaultMargin);
  const right = overlaySettings.position.mode === "custom" ? overlaySettings.position.right ?? defaultMargin : defaultMargin;
  const bottom = overlaySettings.position.mode === "custom" ? overlaySettings.position.bottom ?? defaultMargin : defaultMargin;
  return {
    right: Math.min(Math.max(defaultMargin, right), maximumRight),
    bottom: Math.min(Math.max(defaultMargin, bottom), maximumBottom)
  };
}

function beginOverlayPositioning() {
  const window = createOverlayWindow();
  isOverlayPositioning = true;
  window.setIgnoreMouseEvents(false);
  window.setFocusable(true);
  window.showInactive();
  window.webContents.send("overlay-positioning:changed", true);
  return { ok: true };
}

function finishOverlayPositioning() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return { ok: false };
  }

  const bounds = overlayWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  overlaySettings = normalizeOverlaySettings({
    ...overlaySettings,
    position: {
      mode: "custom",
      displayId: display.id,
      right: Math.max(4, area.x + area.width - bounds.x - bounds.width),
      bottom: Math.max(4, area.y + area.height - bounds.y - bounds.height)
    }
  });
  saveOverlaySettings();
  isOverlayPositioning = false;
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setFocusable(false);
  overlayWindow.webContents.send("overlay-positioning:changed", false);
  overlayWindow.webContents.send("overlay-settings:changed", overlaySettings);
  return { ok: true };
}

function resetOverlayPosition() {
  overlaySettings = normalizeOverlaySettings({ ...overlaySettings, position: { mode: "default" } });
  saveOverlaySettings();
  positionOverlayWindow();
  overlayWindow?.webContents.send("overlay-settings:changed", overlaySettings);
  return overlaySettings;
}

function notifyAccountAliasesChanged() {
  const aliases = listAccountAliases();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("account-aliases:changed", aliases);
  }
  requestUsageRefresh();
}

function isMainWindowSender(event: Electron.IpcMainInvokeEvent) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
}

function isOverlayWindowSender(event: Electron.IpcMainInvokeEvent) {
  return Boolean(overlayWindow && !overlayWindow.isDestroyed() && event.sender === overlayWindow.webContents);
}

function isAppWindowSender(event: Electron.IpcMainInvokeEvent) {
  return isMainWindowSender(event) || isOverlayWindowSender(event);
}

function resizeOverlayWindow(request: { width?: number; height?: number }) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return { ok: false };
  }

  const workArea = getOverlayDisplay().workArea;
  const maximumWidth = Math.max(360, workArea.width - 8);
  const maximumHeight = Math.max(120, workArea.height - 8);
  const baseWidth = Math.min(maximumWidth, Math.max(360, Math.floor(workArea.width / 3)));
  const baseHeight = Math.min(maximumHeight, Math.max(120, Math.floor(workArea.height / 3)));
  const requestedWidth = Number.isFinite(request.width) ? Number(request.width) : baseWidth;
  const requestedHeight = Number.isFinite(request.height) ? Number(request.height) : baseHeight;
  const width = Math.max(baseWidth, Math.min(Math.round(requestedWidth), maximumWidth));
  const height = Math.max(baseHeight, Math.min(Math.round(requestedHeight), maximumHeight));
  overlayWindow.setSize(width, height);
  positionOverlayWindow();
  return { ok: true };
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

// Matches clearUsageCaches(): drop the cached value but leave any in-flight
// read alone so its .finally can still clear usagePromise.
function invalidateCodexCache() {
  usageCache = null;
  usageCacheTime = 0;
}

function readCodexPathSettings() {
  return getCodexPathStatus(codexPathConnection, codexPathDetail);
}

// Non-main-window senders (overlay) never need the configured path.
function blankCodexPathStatus(): CodexPathStatus {
  return {
    configuredPath: null,
    activePath: null,
    source: "none",
    desktopInstalled: false,
    executableFound: false,
    configuredPathValid: null,
    connection: "unchecked",
    detail: "",
    checkedAt: new Date().toISOString()
  };
}

async function applyCodexExecutablePath(candidate: string) {
  const validation = await validateCodexExecutablePath(candidate);
  if (!validation.ok) {
    return { ok: false, canceled: false, status: readCodexPathSettings(), detail: validation.detail };
  }

  try {
    providerSettings = saveProviderSettings({ ...providerSettings, codexExecutablePath: candidate.trim() });
    setCodexExecutablePath(providerSettings.codexExecutablePath);
    codexPathConnection = validation.connection;
    codexPathDetail = validation.detail;
    // validation already fetched usage for this exact path; reuse it and let the
    // shared cache re-fetch lazily on the next read.
    invalidateCodexCache();
    const usage = validation.usage ?? (await readCodexUsageShared(true));
    return { ok: true, canceled: false, status: readCodexPathSettings(), detail: validation.detail, usage };
  } catch {
    return {
      ok: false,
      canceled: false,
      status: readCodexPathSettings(),
      detail: "Codex 경로 설정을 저장하지 못했습니다."
    };
  }
}

async function selectCodexExecutablePath() {
  const options: Electron.OpenDialogOptions = {
    title: "Codex 실행 파일 선택",
    properties: ["openFile"],
    filters: [{ name: "Codex 실행 파일", extensions: process.platform === "win32" ? ["exe"] : ["*"] }]
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
    invalidateCodexCache();
    const usage = await readCodexUsageShared(true);
    return { ok: true, canceled: false, status: readCodexPathSettings(), usage };
  } catch {
    return {
      ok: false,
      canceled: false,
      status: readCodexPathSettings(),
      detail: "자동 경로 설정을 저장하지 못했습니다."
    };
  }
}

function readClaudeUsageShared(force = false) {
  const now = Date.now();
  if (!force && claudeUsageCache && now - claudeUsageCacheTime < 15_000) {
    return Promise.resolve(claudeUsageCache);
  }

  if (!claudeUsagePromise) {
    claudeUsagePromise = Promise.resolve(getClaudeUsage(getClaudeStatusLineSnapshotPath(app.getPath("userData"))) )
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

function describeCacheAge(cacheTime: number) {
  if (!cacheTime) {
    return "empty";
  }
  const seconds = Math.round((Date.now() - cacheTime) / 1000);
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
}

async function readDeveloperDiagnostics() {
  const startedAt = Date.now();

  if (!isDeveloperMode()) {
    return {
      enabled: false,
      generatedAt: new Date().toISOString(),
      environment: getDeveloperEnvStatus(),
      providers: [] as DeveloperProviderDiagnostic[],
      geminiParser: null
    };
  }

  const [codex, claude, gemini, sessions] = await Promise.all([
    readCodexUsageShared(true),
    readClaudeUsageShared(true),
    readGeminiUsageShared(true),
    readCliSessionShared(true)
  ]);

  const codexPath = readCodexPathSettings();
  // Provider-supplied labels are display-safe (tier/model names), but cap length
  // so a malformed local response cannot flood the developer view.
  const label = (value: string | null | undefined) => (value ? value.slice(0, 60) : "unknown");

  const providers: DeveloperProviderDiagnostic[] = [
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
            ? `plan=${label(codex.planType)}, weekly=${codex.weekly ? `${codex.weekly.remainingPercent}%` : "none"}, periodic=${codex.periodic ? `${codex.periodic.remainingPercent}%` : "none"}`
            : codex.error
        },
        {
          method: "Codex 실행 경로",
          status: codexPath.executableFound ? "success" : "failed",
          detail: `source=${codexPath.source}, ${codexPath.detail}`
        },
        {
          method: "Codex CLI 세션",
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
        "Claude Code OAuth 로그인",
        "Claude Code 응답 1회 이상"
      ],
      checks: [
        {
          method: "Claude CLI 세션",
          status: sessions.claude.loggedIn ? "success" : sessions.claude.installed ? "failed" : "skipped",
          detail: sessions.claude.detail
        },
        {
          method: "Claude Code Status Line 스냅샷",
          status: claude.ok ? "success" : "failed",
          detail: claude.ok
            ? `model=${label(claude.model?.displayName ?? claude.model?.id)}, fiveHour=${claude.fiveHour ? `${claude.fiveHour.remainingPercent}%` : "none"}, weekly=${claude.sevenDay ? `${claude.sevenDay.remainingPercent}%` : "none"}, stale=${claude.stale}`
            : claude.error
        }
      ]
    },
    {
      id: "gemini",
      name: "Gemini / Antigravity",
      account: gemini.account,
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
            ? `plan=${label(gemini.geminiApps.plan)}, fiveHour=${gemini.geminiApps.fiveHour?.remaining ?? "none"}, weekly=${gemini.geminiApps.weekly?.remaining ?? "none"}`
            : gemini.geminiAppsSession.loggedIn
              ? "로그인됨. 사용량 확인 버튼으로 Usage Limits 수집 필요"
              : "Gemini 웹 로그인 필요"
        },
        {
          method: gemini.ok ? `Antigravity 한도 (${gemini.source})` : "Antigravity 한도",
          status: gemini.ok ? "success" : "failed",
          detail: gemini.ok
            ? `models=${gemini.models.length}, primary=${gemini.primary ? `${gemini.primary.remainingPercent}%` : "none"}, secondary=${gemini.secondary ? `${gemini.secondary.remainingPercent}%` : "none"}`
            : gemini.error
        }
      ]
    }
  ];

  return {
    enabled: true,
    generatedAt: new Date().toISOString(),
    environment: getDeveloperEnvStatus(),
    totalDurationMs: Date.now() - startedAt,
    cacheSummary: {
      codex: describeCacheAge(usageCacheTime),
      claude: describeCacheAge(claudeUsageCacheTime),
      gemini: describeCacheAge(geminiUsageCacheTime),
      cliSession: describeCacheAge(cliSessionCacheTime)
    },
    providers,
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

function startUsageMonitor() {
  scheduleNextUsageMonitor(10_000);
  scheduleNextResetMonitor();
}

function stopUsageMonitor() {
  if (usageMonitorTimer) {
    clearTimeout(usageMonitorTimer);
    usageMonitorTimer = null;
  }
  if (resetMonitorTimer) {
    clearTimeout(resetMonitorTimer);
    resetMonitorTimer = null;
  }
}

function scheduleNextUsageMonitor(delayMs = usageMonitorIntervalMs) {
  if (usageMonitorTimer) {
    clearTimeout(usageMonitorTimer);
  }
  usageMonitorTimer = setTimeout(() => {
    void runBackgroundUsageCollection("interval").finally(() => scheduleNextUsageMonitor());
  }, delayMs);
}

function scheduleNextResetMonitor() {
  if (resetMonitorTimer) {
    clearTimeout(resetMonitorTimer);
    resetMonitorTimer = null;
  }
  const nextReset = getUpcomingResetTimes(latestQuotaSamples)[0];
  if (!nextReset || !notificationSettings.enabled || !notificationSettings.notifyReset) {
    return;
  }
  const delayMs = Math.max(1_000, nextReset.time - Date.now() + resetGraceMs);
  resetMonitorTimer = setTimeout(() => {
    resetRetryAttempt = 0;
    void runResetCollection();
  }, delayMs);
}

async function runResetCollection() {
  const events = await runBackgroundUsageCollection("reset", true);
  if (events.some((event) => event.kind === "reset")) {
    resetRetryAttempt = 0;
    scheduleNextResetMonitor();
    return;
  }
  const retryDelay = resetRetryDelaysMs[resetRetryAttempt];
  if (retryDelay != null) {
    resetRetryAttempt += 1;
    resetMonitorTimer = setTimeout(() => void runResetCollection(), retryDelay);
    return;
  }
  resetRetryAttempt = 0;
  scheduleNextResetMonitor();
}

function runBackgroundUsageCollection(reason: "interval" | "reset" | "resume", force = false): Promise<QuotaAlertEvent[]> {
  if (backgroundUsagePromise) {
    if (force) {
      return backgroundUsagePromise.then(() => runBackgroundUsageCollection(reason, true));
    }
    return backgroundUsageEventsPromise ?? backgroundUsagePromise.then(() => []);
  }
  let resolveEvents: (events: QuotaAlertEvent[]) => void = () => undefined;
  const eventResult = new Promise<QuotaAlertEvent[]>((resolve) => { resolveEvents = resolve; });
  backgroundUsageEventsPromise = eventResult;
  backgroundUsagePromise = Promise.resolve()
    .then(async () => {
      if (force) {
        clearUsageCaches();
      }
      const [codex, claude, gemini] = await Promise.all([
        readCodexUsageShared(),
        readClaudeUsageShared(force),
        readGeminiUsageShared(force)
      ]);
      latestQuotaSamples = normalizeQuotaSamples(codex, claude, gemini);
      const events = evaluateQuotaAlerts(latestQuotaSamples, notificationSettings);
      dispatchQuotaAlerts(events);
      resolveEvents(events);
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send("usage:refresh-requested", { reason });
        }
      }
      if (reason !== "reset") {
        scheduleNextResetMonitor();
      }
    })
    .catch(() => resolveEvents([]))
    .finally(() => {
      backgroundUsagePromise = null;
      backgroundUsageEventsPromise = null;
    });
  return eventResult;
}

function dispatchQuotaAlerts(events: QuotaAlertEvent[]) {
  if (events.length === 0 || !notificationSettings.enabled) {
    return;
  }
  if (notificationSettings.windowsNotifications && Notification.isSupported()) {
    for (const event of events) {
      const notification = new Notification({ title: event.title, body: event.body });
      notification.on("click", showMainWindow);
      notification.show();
    }
  }
  if (notificationSettings.alwaysOnTopAlerts) {
    showAlwaysOnTopAlert(events);
  }
}

function showAlwaysOnTopAlert(events: QuotaAlertEvent[]) {
  closeAlwaysOnTopAlert();
  const display = screen.getPrimaryDisplay().workArea;
  const width = Math.min(460, display.width - 24);
  const height = 132;
  alertWindow = new BrowserWindow({
    width,
    height,
    x: display.x + display.width - width - 12,
    y: display.y + 12,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  alertWindow.setIgnoreMouseEvents(true);
  const summary = events.slice(0, 3).map((event) => `${event.title} — ${event.body}`).join("\n");
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;font-family:"Segoe UI",sans-serif}.alert{margin:8px;padding:16px 18px;color:#fff;background:rgba(36,42,39,.94);border:2px solid #e05252;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.3)}strong{display:block;font-size:15px;margin-bottom:7px}p{margin:0;white-space:pre-line;font-size:12px;line-height:1.45}</style><section class="alert"><strong>Token Monitor 경고</strong><p>${escapeHtml(summary)}</p></section>`;
  void alertWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  alertWindow.once("ready-to-show", () => alertWindow?.showInactive());
  alertWindow.on("closed", () => { alertWindow = null; });
  alertWindowTimer = setTimeout(closeAlwaysOnTopAlert, 12_000);
}

function closeAlwaysOnTopAlert() {
  if (alertWindowTimer) {
    clearTimeout(alertWindowTimer);
    alertWindowTimer = null;
  }
  if (alertWindow && !alertWindow.isDestroyed()) {
    alertWindow.destroy();
  }
  alertWindow = null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function notifyNotificationSettingsChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("notification-settings:changed", notificationSettings);
    }
  }
}

function sendTestNotification() {
  const event: QuotaAlertEvent = {
    kind: "threshold",
    quotaKey: "test",
    provider: "codex",
    title: "Token Monitor 테스트 알림",
    body: "Windows 알림과 전면 경고 설정이 정상적으로 적용되었습니다."
  };
  dispatchQuotaAlerts([event]);
  return { ok: notificationSettings.windowsNotifications || notificationSettings.alwaysOnTopAlerts };
}

async function startClaudeLogin() {
  const sessionStatus = await readCliSessionShared(true);
  cliSessionCache = sessionStatus;
  cliSessionCacheTime = Date.now();

  if (sessionStatus.claude.loggedIn) {
    return {
      ok: true,
      command: "claude auth status --json",
      skipped: true,
      detail: "Claude CLI 로그인이 이미 확인되었습니다. 사용량 수집이 필요하면 Status Line 등록 버튼을 누르세요."
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
      ["-y", "@anthropic-ai/claude-code", "auth", "login", "--claudeai"],
      getClaudeOAuthEnvironmentResetCommands()
    );
    launchWindowsCliWindow(launcherPath);
    return { ok: true, command };
  }

  const child = spawn("npx", ["-y", "@anthropic-ai/claude-code", "auth", "login", "--claudeai"], {
    detached: true,
    stdio: "ignore",
    env: createClaudeOAuthEnvironment()
  });
  child.unref();
  return { ok: true, command: "npx -y @anthropic-ai/claude-code auth login --claudeai" };
}

function setupClaudeStatusLine(integrateExisting = false) {
  const result = ensureClaudeStatusLine(app.getPath("userData"), { integrateExisting });
  claudeUsageCache = null;
  claudeUsageCacheTime = 0;
  return result;
}

function restoreClaudeStatusLineSetup() {
  const result = restoreClaudeStatusLine(app.getPath("userData"));
  claudeUsageCache = null;
  claudeUsageCacheTime = 0;
  return result;
}

function readClaudeStatusLineRegistration() {
  return getClaudeStatusLineRegistrationStatus(app.getPath("userData"));
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

function writeWindowsCliLauncher(name: string, commandPath: string, args: string[], environmentResetCommands: string[] = []) {
  const launcherPath = path.join(app.getPath("temp"), `token-monitor-${name}.cmd`);
  const command = [`call "${commandPath}"`, ...args.map(quoteCmdArg)].join(" ");
  const content = [
    "@echo off",
    ...environmentResetCommands,
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

    return { action: "deny" };
  });

  const blockUnexpectedNavigation = (event: Electron.Event, url: string) => {
    if (!isGoogleOrGeminiUrl(url)) {
      event.preventDefault();
    }
  };
  view.webContents.on("will-navigate", blockUnexpectedNavigation);
  view.webContents.on("will-redirect", blockUnexpectedNavigation);

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
  if (state.email) {
    const account = observeAccount("google", state.email);
    if (account.accountChanged) {
      clearGeminiAppsUsageCache();
    }
  }
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
    const page = await view.webContents.executeJavaScript(geminiReadableTextScript(), true) as { text?: string; accountEmail?: string | null };
    const text = typeof page.text === "string" ? page.text : "";
    return {
      loggedIn: isGeminiLoggedInText(text),
      usage: parseGeminiAppsUsageText(text),
      email: typeof page.accountEmail === "string" ? page.accountEmail : null
    };
  } catch {
    return { loggedIn: false, usage: null, email: null };
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
      const accountCandidates = [];
      for (const node of nodes) {
        const accountLabel = [node.getAttribute && node.getAttribute("aria-label"), node.getAttribute && node.getAttribute("title"), node.getAttribute && node.getAttribute("alt")]
          .filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
        if (/@/.test(accountLabel) && /account|계정|profile|프로필|google/i.test(accountLabel)) accountCandidates.push(accountLabel);
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
      const accountText = accountCandidates.join(" ");
      const emailMatch = accountText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i);
      return { text: Array.from(new Set(values)).join("\\n"), accountEmail: emailMatch ? emailMatch[0] : null };
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
    return hostname === "google.com" || hostname.endsWith(".google.com");
  } catch {
    return false;
  }
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    setAppVersion(app.getVersion());
    loadDeveloperEnv();
    if (process.platform === "win32") {
      app.setAppUserModelId("com.tokenmonitor.app");
    }
    initializeAccountAliases(app.getPath("userData"));
    notificationSettings = initializeNotificationSettings(app.getPath("userData"));
    initializeQuotaAlertState(app.getPath("userData"));
    providerSettings = loadProviderSettings();
    setCodexExecutablePath(providerSettings.codexExecutablePath);
    // Keep the app-owned Status Line current even when Claude is already logged in.
    const statusLineSetup = ensureClaudeStatusLine(app.getPath("userData"));
    if (!statusLineSetup.ok) {
      console.warn("Claude Status Line setup skipped:", statusLineSetup.detail);
    }
    loadOverlaySettings();
    installKoreanMenu();
    createTray();

    ipcMain.handle("codex-usage:read", (event) => isAppWindowSender(event) ? readCodexUsageShared() : null);
    ipcMain.handle("claude-usage:read", (event, force?: boolean) => isAppWindowSender(event) ? readClaudeUsageShared(Boolean(force)) : null);
    ipcMain.handle("gemini-usage:read", (event, force?: boolean) => isAppWindowSender(event) ? readGeminiUsageShared(Boolean(force)) : null);
    ipcMain.handle("cli-session:read", (event, force?: boolean) => isAppWindowSender(event) ? readCliSessionShared(Boolean(force)) : null);
    ipcMain.handle("developer-mode:read", (event) => ({ enabled: isMainWindowSender(event) && isDeveloperMode() }));
    ipcMain.handle("developer-diagnostics:read", (event) => isMainWindowSender(event) ? readDeveloperDiagnostics() : { enabled: false, generatedAt: new Date().toISOString(), environment: getDeveloperEnvStatus(), providers: [], geminiParser: null });
    ipcMain.handle("codex-path:read", (event) => isMainWindowSender(event) ? readCodexPathSettings() : blankCodexPathStatus());
    ipcMain.handle("codex-path:select", (event) => isMainWindowSender(event) ? selectCodexExecutablePath() : { ok: false, canceled: true, status: readCodexPathSettings() });
    ipcMain.handle("codex-path:update", (event, candidate: string) => isMainWindowSender(event) ? applyCodexExecutablePath(candidate) : { ok: false, canceled: false, status: readCodexPathSettings() });
    ipcMain.handle("codex-path:reset", (event) => isMainWindowSender(event) ? resetCodexExecutablePath() : { ok: false, canceled: false, status: readCodexPathSettings() });
    ipcMain.handle("claude-login:start", (event) => isMainWindowSender(event) ? startClaudeLogin() : { ok: false, detail: "기본 창에서만 실행할 수 있습니다." });
    ipcMain.handle("claude-statusline:setup", (event, integrateExisting?: boolean) => isMainWindowSender(event) ? setupClaudeStatusLine(Boolean(integrateExisting)) : { ok: false, detail: "기본 창에서만 실행할 수 있습니다." });
    ipcMain.handle("claude-statusline:restore", (event) => isMainWindowSender(event) ? restoreClaudeStatusLineSetup() : { ok: false, detail: "기본 창에서만 실행할 수 있습니다." });
    ipcMain.handle("claude-statusline:status", (event) => isAppWindowSender(event) ? readClaudeStatusLineRegistration() : { state: "error", mode: "none", registered: false, scriptReady: false, snapshotAvailable: false, backupAvailable: false, detail: "기본 창에서만 확인할 수 있습니다." });
    ipcMain.handle("gemini-login:start", (event) => isMainWindowSender(event) ? startGeminiLogin() : { ok: false, detail: "기본 창에서만 실행할 수 있습니다." });
    ipcMain.handle("gemini-apps-login:start", (event, bounds?: Partial<GeminiViewBounds>) => isMainWindowSender(event) ? startGeminiAppsLogin(bounds) : { ok: false, detail: "기본 창에서만 실행할 수 있습니다." });
    ipcMain.handle("gemini-view:bounds", (event, bounds?: Partial<GeminiViewBounds>) => isMainWindowSender(event) ? updateEmbeddedGeminiBounds(bounds) : { ok: false });
    ipcMain.handle("gemini-view:close", (event) => isMainWindowSender(event) ? closeEmbeddedGeminiView("manual") : undefined);
    ipcMain.handle("app:minimize-to-tray", (event) => isMainWindowSender(event) ? minimizeMainWindowToTray() : undefined);
    ipcMain.handle("app:quit", (event) => isMainWindowSender(event) ? quitApp() : undefined);
    ipcMain.handle("project-repository:open", (event) => isMainWindowSender(event) ? shell.openExternal("https://github.com/hwandroid921/TokenMonitor") : undefined);
    ipcMain.handle("nodejs:open-download", (event) => isMainWindowSender(event) ? shell.openExternal("https://nodejs.org/ko/download") : undefined);
    ipcMain.handle("overlay-settings:read", (event) => isAppWindowSender(event) ? overlaySettings : defaultOverlaySettings);
    ipcMain.handle("overlay-settings:update", (event, nextSettings: OverlaySettings) => {
      if (!isMainWindowSender(event)) {
        return overlaySettings;
      }
      applyOverlaySettings(nextSettings);
      return overlaySettings;
    });
    ipcMain.handle("overlay:resize", (event, request: { width?: number; height?: number }) => isOverlayWindowSender(event) ? resizeOverlayWindow(request) : { ok: false });
    ipcMain.handle("overlay-positioning:read", (event) => isOverlayWindowSender(event) ? isOverlayPositioning : false);
    ipcMain.handle("overlay:begin-positioning", (event) => isMainWindowSender(event) ? beginOverlayPositioning() : { ok: false });
    ipcMain.handle("overlay:finish-positioning", (event) => isOverlayWindowSender(event) ? finishOverlayPositioning() : { ok: false });
    ipcMain.handle("overlay:reset-position", (event) => isMainWindowSender(event) ? resetOverlayPosition() : overlaySettings);
    ipcMain.handle("notification-settings:read", (event) => isAppWindowSender(event) ? notificationSettings : defaultNotificationSettings);
    ipcMain.handle("notification-settings:update", (event, nextSettings: Partial<NotificationSettings>) => {
      if (!isMainWindowSender(event)) {
        return notificationSettings;
      }
      notificationSettings = updateNotificationSettings(nextSettings);
      notifyNotificationSettingsChanged();
      scheduleNextResetMonitor();
      return notificationSettings;
    });
    ipcMain.handle("notification:test", (event) => isMainWindowSender(event) ? sendTestNotification() : { ok: false });
    ipcMain.handle("account-aliases:list", (event) => isMainWindowSender(event) ? listAccountAliases() : []);
    ipcMain.handle("account-aliases:rename", (event, recordId: string, alias: string) => {
      if (!isMainWindowSender(event)) {
        return { ok: false, detail: "계정 별칭 설정은 기본 설정 창에서만 변경할 수 있습니다." };
      }
      const result = renameAccountAlias(recordId, alias);
      if (result.ok) {
        notifyAccountAliasesChanged();
      }
      return result;
    });
    ipcMain.handle("account-aliases:delete", (event, recordId: string) => {
      if (!isMainWindowSender(event)) {
        return { ok: false, detail: "계정 별칭 설정은 기본 설정 창에서만 변경할 수 있습니다." };
      }
      const result = deleteAccountAlias(recordId);
      if (result.ok) {
        notifyAccountAliasesChanged();
      }
      return result;
    });
    ipcMain.handle("account-aliases:delete-provider", (event, provider: AccountProvider) => {
      if (!isMainWindowSender(event)) {
        return { ok: false };
      }
      const result = deleteProviderAliases(provider);
      notifyAccountAliasesChanged();
      return result;
    });
    ipcMain.handle("account-aliases:delete-all", (event) => {
      if (!isMainWindowSender(event)) {
        return { ok: false };
      }
      const result = deleteAllAccountAliases();
      notifyAccountAliasesChanged();
      return result;
    });

    createWindow();
    scheduleInitialOverlayLoad();
    startUsageMonitor();

    screen.on("display-metrics-changed", positionOverlayWindow);
    powerMonitor.on("resume", () => {
      setTimeout(() => void runBackgroundUsageCollection("resume", true), 3_000);
    });
    powerMonitor.on("unlock-screen", () => {
      setTimeout(() => void runBackgroundUsageCollection("resume", true), 3_000);
    });

    app.on("activate", () => {
      showMainWindow();
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  stopUsageMonitor();
  closeAlwaysOnTopAlert();
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
