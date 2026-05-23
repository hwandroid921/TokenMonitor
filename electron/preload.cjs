const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tokenMonitor", {
  platform: process.platform,
  getCodexUsage: () => ipcRenderer.invoke("codex-usage:read"),
  getClaudeUsage: () => ipcRenderer.invoke("claude-usage:read"),
  getCliSessionStatus: () => ipcRenderer.invoke("cli-session:read"),
  startClaudeLogin: () => ipcRenderer.invoke("claude-login:start"),
  openCodexUsageDashboard: () => ipcRenderer.invoke("codex-usage:open-dashboard"),
  getOverlaySettings: () => ipcRenderer.invoke("overlay-settings:read"),
  updateOverlaySettings: (settings) => ipcRenderer.invoke("overlay-settings:update", settings),
  onOverlaySettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("overlay-settings:changed", listener);
    return () => ipcRenderer.removeListener("overlay-settings:changed", listener);
  }
});
