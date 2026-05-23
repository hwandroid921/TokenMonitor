import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("tokenMonitor", {
    platform: process.platform,
    getCodexUsage: () => ipcRenderer.invoke("codex-usage:read"),
    openCodexUsageDashboard: () => ipcRenderer.invoke("codex-usage:open-dashboard"),
    getOverlaySettings: () => ipcRenderer.invoke("overlay-settings:read"),
    updateOverlaySettings: (settings) => ipcRenderer.invoke("overlay-settings:update", settings),
    onOverlaySettingsChanged: (callback) => {
        const listener = (_event, settings) => callback(settings);
        ipcRenderer.on("overlay-settings:changed", listener);
        return () => ipcRenderer.removeListener("overlay-settings:changed", listener);
    }
});
