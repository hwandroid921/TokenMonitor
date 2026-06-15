const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tokenMonitor", {
  platform: process.platform,
  getCodexUsage: () => ipcRenderer.invoke("codex-usage:read"),
  getClaudeUsage: (force) => ipcRenderer.invoke("claude-usage:read", force),
  getGeminiUsage: (force) => ipcRenderer.invoke("gemini-usage:read", force),
  getCliSessionStatus: (force) => ipcRenderer.invoke("cli-session:read", force),
  startClaudeLogin: () => ipcRenderer.invoke("claude-login:start"),
  startGeminiLogin: () => ipcRenderer.invoke("gemini-login:start"),
  startGeminiAppsLogin: (bounds) => ipcRenderer.invoke("gemini-apps-login:start", bounds),
  updateGeminiViewBounds: (bounds) => ipcRenderer.invoke("gemini-view:bounds", bounds),
  closeGeminiView: () => ipcRenderer.invoke("gemini-view:close"),
  minimizeToTray: () => ipcRenderer.invoke("app:minimize-to-tray"),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  openCodexUsageDashboard: () => ipcRenderer.invoke("codex-usage:open-dashboard"),
  openNodeJsDownload: () => ipcRenderer.invoke("nodejs:open-download"),
  getOverlaySettings: () => ipcRenderer.invoke("overlay-settings:read"),
  updateOverlaySettings: (settings) => ipcRenderer.invoke("overlay-settings:update", settings),
  onOverlaySettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("overlay-settings:changed", listener);
    return () => ipcRenderer.removeListener("overlay-settings:changed", listener);
  },
  onExitConfirmRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app-exit:confirm-requested", listener);
    return () => ipcRenderer.removeListener("app-exit:confirm-requested", listener);
  },
  onUsageRefreshRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("usage:refresh-requested", listener);
    return () => ipcRenderer.removeListener("usage:refresh-requested", listener);
  },
  onGeminiViewClosed: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("gemini-view:closed", listener);
    return () => ipcRenderer.removeListener("gemini-view:closed", listener);
  }
});
