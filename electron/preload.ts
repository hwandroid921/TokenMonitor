import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("tokenMonitor", {
  platform: process.platform,
  getCodexUsage: () => ipcRenderer.invoke("codex-usage:read"),
  getClaudeUsage: () => ipcRenderer.invoke("claude-usage:read"),
  getGeminiUsage: () => ipcRenderer.invoke("gemini-usage:read"),
  getCliSessionStatus: () => ipcRenderer.invoke("cli-session:read"),
  startClaudeLogin: () => ipcRenderer.invoke("claude-login:start"),
  minimizeToTray: () => ipcRenderer.invoke("app:minimize-to-tray"),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  openCodexUsageDashboard: () => ipcRenderer.invoke("codex-usage:open-dashboard"),
  getOverlaySettings: () => ipcRenderer.invoke("overlay-settings:read"),
  updateOverlaySettings: (settings: unknown) => ipcRenderer.invoke("overlay-settings:update", settings),
  onOverlaySettingsChanged: (callback: (settings: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: unknown) => callback(settings);
    ipcRenderer.on("overlay-settings:changed", listener);
    return () => ipcRenderer.removeListener("overlay-settings:changed", listener);
  },
  onExitConfirmRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("app-exit:confirm-requested", listener);
    return () => ipcRenderer.removeListener("app-exit:confirm-requested", listener);
  },
  onUsageRefreshRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("usage:refresh-requested", listener);
    return () => ipcRenderer.removeListener("usage:refresh-requested", listener);
  }
});
