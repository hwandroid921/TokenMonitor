import { app, BrowserView, BrowserWindow, Menu, Tray, ipcMain, screen, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClaudeUsage } from "./claude-usage.js";
import { getCliSessionStatus } from "./cli-session.js";
import { createClaudeOAuthEnvironment, getClaudeOAuthEnvironmentResetCommands } from "./claude-oauth-env.js";
import { ensureClaudeStatusLine, getClaudeStatusLineSnapshotPath } from "./claude-statusline.js";
import { getCodexUsage, killAllActiveChildProcesses, setAppVersion } from "./codex-usage.js";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const preloadPath = path.join(__dirname, "../electron/preload.cjs");
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let overlaySettings: OverlaySettings = defaultOverlaySettings;
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
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const initialOverlayDelayMs = 1200;
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

function resizeOverlayWindow(request: { width?: number; height?: number }) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return { ok: false };
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const requestedWidth = Number.isFinite(request.width) ? Number(request.width) : 620;
  const requestedHeight = Number.isFinite(request.height) ? Number(request.height) : 180;
  const width = Math.max(360, Math.min(Math.round(requestedWidth), workArea.width - 8));
  const maximumHeight = Math.max(120, Math.floor(workArea.height / 3));
  const height = Math.max(120, Math.min(Math.round(requestedHeight), maximumHeight));
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

function readCodexUsageShared() {
  const now = Date.now();
  if (usageCache && now - usageCacheTime < 15_000) {
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

async function startClaudeLogin() {
  const statusLineSetup = ensureClaudeStatusLine(app.getPath("userData"));
  if (!statusLineSetup.ok) {
    return {
      ok: false,
      command: "Claude Status Line setup",
      detail: statusLineSetup.detail
    };
  }

  const sessionStatus = await readCliSessionShared(true);
  cliSessionCache = sessionStatus;
  cliSessionCacheTime = Date.now();

  if (sessionStatus.claude.loggedIn) {
    return {
      ok: true,
      command: "claude auth status --json",
      skipped: true,
      detail: statusLineSetup.detail
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

    void shell.openExternal(url);
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
    initializeAccountAliases(app.getPath("userData"));
    loadOverlaySettings();
    installKoreanMenu();
    createTray();

    ipcMain.handle("codex-usage:read", () => readCodexUsageShared());
    ipcMain.handle("claude-usage:read", (_event, force?: boolean) => readClaudeUsageShared(Boolean(force)));
    ipcMain.handle("gemini-usage:read", (_event, force?: boolean) => readGeminiUsageShared(Boolean(force)));
    ipcMain.handle("cli-session:read", (_event, force?: boolean) => readCliSessionShared(Boolean(force)));
    ipcMain.handle("claude-login:start", () => startClaudeLogin());
    ipcMain.handle("gemini-login:start", () => startGeminiLogin());
    ipcMain.handle("gemini-apps-login:start", (_event, bounds?: Partial<GeminiViewBounds>) => startGeminiAppsLogin(bounds));
    ipcMain.handle("gemini-view:bounds", (_event, bounds?: Partial<GeminiViewBounds>) => updateEmbeddedGeminiBounds(bounds));
    ipcMain.handle("gemini-view:close", () => closeEmbeddedGeminiView("manual"));
    ipcMain.handle("app:minimize-to-tray", () => minimizeMainWindowToTray());
    ipcMain.handle("app:quit", () => quitApp());
    ipcMain.handle("codex-usage:open-dashboard", () => shell.openExternal("https://chatgpt.com/codex/settings/usage"));
    ipcMain.handle("nodejs:open-download", () => shell.openExternal("https://nodejs.org/ko/download"));
    ipcMain.handle("overlay-settings:read", () => overlaySettings);
    ipcMain.handle("overlay-settings:update", (_event, nextSettings: OverlaySettings) => {
      applyOverlaySettings(nextSettings);
      return overlaySettings;
    });
    ipcMain.handle("overlay:resize", (_event, request: { width?: number; height?: number }) => resizeOverlayWindow(request));
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
