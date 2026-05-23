import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("tokenMonitor", {
  platform: process.platform,
  getCodexUsage: () => ipcRenderer.invoke("codex-usage:read"),
  getClaudeUsage: () => ipcRenderer.invoke("claude-usage:read"),
  getCliSessionStatus: () => ipcRenderer.invoke("cli-session:read"),
  startClaudeLogin: () => ipcRenderer.invoke("claude-login:start"),
  openCodexUsageDashboard: () => ipcRenderer.invoke("codex-usage:open-dashboard"),
  getOverlaySettings: () => ipcRenderer.invoke("overlay-settings:read"),
  updateOverlaySettings: (settings: unknown) => ipcRenderer.invoke("overlay-settings:update", settings),
  onOverlaySettingsChanged: (callback: (settings: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: unknown) => callback(settings);
    ipcRenderer.on("overlay-settings:changed", listener);
    return () => ipcRenderer.removeListener("overlay-settings:changed", listener);
  }
});
