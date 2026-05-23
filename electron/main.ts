import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, screen, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClaudeUsage } from "./claude-usage.js";
import { getCliSessionStatus } from "./cli-session.js";
import { getCodexUsage } from "./codex-usage.js";
import { defaultOverlaySettings, normalizeOverlaySettings, type OverlaySettings } from "./overlay-settings.js";

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
let claudeUsagePromise: ReturnType<typeof getClaudeUsage> | null = null;
let claudeUsageCache: Awaited<ReturnType<typeof getClaudeUsage>> | null = null;
let claudeUsageCacheTime = 0;
let cliSessionPromise: ReturnType<typeof getCliSessionStatus> | null = null;
let cliSessionCache: Awaited<ReturnType<typeof getCliSessionStatus>> | null = null;
let cliSessionCacheTime = 0;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

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

function quitApp() {
  isQuitting = true;

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }

  tray?.destroy();
  tray = null;
  app.exit(0);
}

function confirmExitWithoutTray() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return true;
  }

  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: "warning",
    buttons: ["종료", "취소"],
    defaultId: 1,
    cancelId: 1,
    title: "프로그램 종료",
    message: "시스템 트레이 최소화가 꺼져 있습니다.",
    detail: "지금 종료하면 Token Monitor와 오버레이가 모두 종료됩니다."
  });

  return choice === 0;
}

function closeOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
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
    { type: "separator" },
    {
      label: "종료",
      click: quitApp
    }
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip("Token Monitor");
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
    show: false,
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
    window.show();
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
      if (confirmExitWithoutTray()) {
        quitApp();
      }
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
    width: 430,
    height: 390,
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
  const margin = 18;
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

function readClaudeUsageShared() {
  const now = Date.now();
  if (claudeUsageCache && now - claudeUsageCacheTime < 15_000) {
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

function readCliSessionShared() {
  const now = Date.now();
  if (cliSessionCache && now - cliSessionCacheTime < 60_000) {
    return Promise.resolve(cliSessionCache);
  }

  if (!cliSessionPromise) {
    cliSessionPromise = getCliSessionStatus()
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

function startClaudeLogin() {
  if (process.platform === "win32") {
    const command = "npx -y @anthropic-ai/claude-code auth login --claudeai";
    const child = spawn("cmd.exe", ["/c", "start", "Claude CLI Login", "cmd.exe", "/k", command], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();
    return { ok: true, command };
  }

  const child = spawn("npx", ["-y", "@anthropic-ai/claude-code", "auth", "login", "--claudeai"], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return { ok: true, command: "npx -y @anthropic-ai/claude-code auth login --claudeai" };
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    loadOverlaySettings();
    installKoreanMenu();
    createTray();

    ipcMain.handle("codex-usage:read", () => readCodexUsageShared());
    ipcMain.handle("claude-usage:read", () => readClaudeUsageShared());
    ipcMain.handle("cli-session:read", () => readCliSessionShared());
    ipcMain.handle("claude-login:start", () => startClaudeLogin());
    ipcMain.handle("codex-usage:open-dashboard", () => shell.openExternal("https://chatgpt.com/codex/settings/usage"));
    ipcMain.handle("overlay-settings:read", () => overlaySettings);
    ipcMain.handle("overlay-settings:update", (_event, nextSettings: OverlaySettings) => {
      applyOverlaySettings(nextSettings);
      return overlaySettings;
    });

    createWindow();
    if (overlaySettings.enabled) {
      applyOverlaySettings(overlaySettings);
    }

    screen.on("display-metrics-changed", positionOverlayWindow);

    app.on("activate", () => {
      showMainWindow();
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  closeOverlayWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !overlaySettings.closeToTray) {
    app.quit();
  }
});
