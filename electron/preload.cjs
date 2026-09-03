const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tokenMonitor", {
  platform: process.platform,
  getCodexUsage: () => ipcRenderer.invoke("codex-usage:read"),
  getClaudeUsage: (force) => ipcRenderer.invoke("claude-usage:read", force),
  getGeminiUsage: (force) => ipcRenderer.invoke("gemini-usage:read", force),
  getCliSessionStatus: (force) => ipcRenderer.invoke("cli-session:read", force),
  getDeveloperMode: () => ipcRenderer.invoke("developer-mode:read"),
  getDeveloperDiagnostics: () => ipcRenderer.invoke("developer-diagnostics:read"),
  getCodexPathStatus: () => ipcRenderer.invoke("codex-path:read"),
  selectCodexExecutablePath: () => ipcRenderer.invoke("codex-path:select"),
  updateCodexExecutablePath: (candidate) => ipcRenderer.invoke("codex-path:update", candidate),
  resetCodexExecutablePath: () => ipcRenderer.invoke("codex-path:reset"),
  startClaudeLogin: () => ipcRenderer.invoke("claude-login:start"),
  setupClaudeStatusLine: (integrateExisting) => ipcRenderer.invoke("claude-statusline:setup", integrateExisting),
  restoreClaudeStatusLine: () => ipcRenderer.invoke("claude-statusline:restore"),
  getClaudeStatusLineRegistration: () => ipcRenderer.invoke("claude-statusline:status"),
  startGeminiLogin: () => ipcRenderer.invoke("gemini-login:start"),
  startGeminiAppsLogin: (bounds) => ipcRenderer.invoke("gemini-apps-login:start", bounds),
  updateGeminiViewBounds: (bounds) => ipcRenderer.invoke("gemini-view:bounds", bounds),
  closeGeminiView: () => ipcRenderer.invoke("gemini-view:close"),
  minimizeToTray: () => ipcRenderer.invoke("app:minimize-to-tray"),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  openProjectRepository: () => ipcRenderer.invoke("project-repository:open"),
  openNodeJsDownload: () => ipcRenderer.invoke("nodejs:open-download"),
  getOverlaySettings: () => ipcRenderer.invoke("overlay-settings:read"),
  updateOverlaySettings: (settings) => ipcRenderer.invoke("overlay-settings:update", settings),
  resizeOverlay: (size) => ipcRenderer.invoke("overlay:resize", size),
  getOverlayPositioning: () => ipcRenderer.invoke("overlay-positioning:read"),
  beginOverlayPositioning: () => ipcRenderer.invoke("overlay:begin-positioning"),
  finishOverlayPositioning: () => ipcRenderer.invoke("overlay:finish-positioning"),
  resetOverlayPosition: () => ipcRenderer.invoke("overlay:reset-position"),
  getNotificationSettings: () => ipcRenderer.invoke("notification-settings:read"),
  updateNotificationSettings: (settings) => ipcRenderer.invoke("notification-settings:update", settings),
  sendTestNotification: () => ipcRenderer.invoke("notification:test"),
  listAccountAliases: () => ipcRenderer.invoke("account-aliases:list"),
  renameAccountAlias: (recordId, alias) => ipcRenderer.invoke("account-aliases:rename", recordId, alias),
  deleteAccountAlias: (recordId) => ipcRenderer.invoke("account-aliases:delete", recordId),
  deleteProviderAliases: (provider) => ipcRenderer.invoke("account-aliases:delete-provider", provider),
  deleteAllAccountAliases: () => ipcRenderer.invoke("account-aliases:delete-all"),
  onAccountAliasesChanged: (callback) => {
    const listener = (_event, aliases) => callback(aliases);
    ipcRenderer.on("account-aliases:changed", listener);
    return () => ipcRenderer.removeListener("account-aliases:changed", listener);
  },
  onOverlaySettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("overlay-settings:changed", listener);
    return () => ipcRenderer.removeListener("overlay-settings:changed", listener);
  },
  onOverlayPositioningChanged: (callback) => {
    const listener = (_event, isPositioning) => callback(isPositioning);
    ipcRenderer.on("overlay-positioning:changed", listener);
    return () => ipcRenderer.removeListener("overlay-positioning:changed", listener);
  },
  onNotificationSettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("notification-settings:changed", listener);
    return () => ipcRenderer.removeListener("notification-settings:changed", listener);
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
