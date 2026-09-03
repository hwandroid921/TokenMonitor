export type CodexUsageWindow = {
  label: string;
  usedPercent: number;
  remainingPercent: number;
  windowMinutes: number | null;
  resetsAt: string | null;
};

export type AccountProvider = "codex" | "claude" | "google";
export type AccountIdentityConfidence = "verified" | "inferred";

export type AccountAliasState = {
  detected: boolean;
  alias: string | null;
  aliasRequired: boolean;
  accountChanged: boolean;
  confidence: AccountIdentityConfidence | null;
};

export type AccountAliasView = {
  recordId: string;
  provider: AccountProvider;
  maskedEmail: string;
  alias: string | null;
  isCurrent: boolean;
  confidence: AccountIdentityConfidence;
  createdAt: string;
  lastSeenAt: string;
};

export type CodexUsageResult =
  | {
      ok: true;
      source: "codex-app-server";
      accountType: string | null;
      planType: string | null;
      account: AccountAliasState;
      weekly: CodexUsageWindow | null;
      periodic: CodexUsageWindow | null;
      credits: {
        hasCredits: boolean;
        unlimited: boolean;
        balance: number | null;
      } | null;
      updatedAt: string;
    }
  | {
      ok: false;
      source: "codex-app-server";
      error: string;
      updatedAt: string;
    };

export type CodexExecutableSource =
  | "manual"
  | "environment"
  | "local-direct"
  | "local-versioned"
  | "windows-apps"
  | "mac-app"
  | "homebrew"
  | "npm-global"
  | "path"
  | "none";

export type CodexPathStatus = {
  configuredPath: string | null;
  activePath: string | null;
  source: CodexExecutableSource;
  desktopInstalled: boolean;
  executableFound: boolean;
  configuredPathValid: boolean | null;
  connection: "unchecked" | "connected" | "failed";
  detail: string;
  checkedAt: string;
};

export type CodexPathUpdateResult = {
  ok: boolean;
  canceled: boolean;
  status: CodexPathStatus;
  detail?: string;
  usage?: CodexUsageResult;
};

export type DeveloperModeInfo = {
  enabled: boolean;
};

export type DeveloperCheckStatus = "success" | "failed" | "skipped";

export type DeveloperEnvStatus = {
  enabled: boolean;
  source: "process" | "env-file" | "default";
  checkedPathCount: number;
  loadedFileName: string | null;
};

export type DeveloperProviderDiagnostic = {
  id: ProviderId;
  name: string;
  account: AccountAliasState | null;
  userPrerequisites: string[];
  checks: Array<{
    method: string;
    status: DeveloperCheckStatus;
    detail: string;
  }>;
};

export type DeveloperDiagnostics = {
  enabled: boolean;
  generatedAt: string;
  environment: DeveloperEnvStatus;
  totalDurationMs?: number;
  cacheSummary?: {
    codex: string;
    claude: string;
    gemini: string;
    cliSession: string;
  };
  providers: DeveloperProviderDiagnostic[];
  geminiParser: {
    sessionLoggedIn: boolean;
    cacheAvailable: boolean;
    planParsed: boolean;
    fiveHourParsed: boolean;
    weeklyParsed: boolean;
    detail: string | null;
    updatedAt: string | null;
  } | null;
};

export type ProviderId = "codex" | "claude" | "gemini";

export type CliSessionStatus = {
  provider: "codex" | "claude";
  ok: boolean;
  installed: boolean;
  loggedIn: boolean;
  authMethod: string | null;
  account: AccountAliasState;
  detail: string;
  checkedAt: string;
};

export type CliSessionResult = {
  codex: CliSessionStatus;
  claude: CliSessionStatus;
};

export type ClaudeUsageResult =
  | {
      ok: true;
      source: "claude-code-statusline";
      model: { id: string | null; displayName: string | null } | null;
      fiveHour: ClaudeUsageWindow | null;
      sevenDay: ClaudeUsageWindow | null;
      capturedAt: string;
      stale: boolean;
      updatedAt: string;
    }
  | {
      ok: false;
      source: "claude-code-statusline";
      error: string;
      updatedAt: string;
    };

export type ClaudeUsageWindow = {
  label: "5시간" | "주간";
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
};

export type ClaudeStatusLineRegistrationStatus = {
  state: "registered" | "needs-registration" | "error";
  mode: "standalone" | "bridge" | "custom" | "none";
  registered: boolean;
  scriptReady: boolean;
  snapshotAvailable: boolean;
  backupAvailable: boolean;
  detail: string;
};

export type GeminiUsageWindow = {
  label: string;
  modelId: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
};

export type GeminiAppsUsageWindow = {
  label: "5시간" | "주간";
  remaining: string | null;
  reset: string | null;
};

export type GeminiAppsUsage = {
  source: "gemini-web-usage-limits";
  fiveHour: GeminiAppsUsageWindow | null;
  weekly: GeminiAppsUsageWindow | null;
  plan: string | null;
  updatedAt: string;
  detail: string | null;
};

export type GeminiAppsSessionStatus = {
  loggedIn: boolean;
  checkedAt: string | null;
};

export type GeminiViewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GeminiUsageResult =
  | {
      ok: true;
      source: "antigravity-cli-google" | "antigravity-cli-local" | "antigravity-local" | "gemini-cli-oauth";
      planType: string | null;
      account: AccountAliasState;
      promptCredits: {
        available: number | null;
        monthly: number | null;
        usedPercent: number | null;
        remainingPercent: number | null;
      } | null;
      geminiApps: GeminiAppsUsage | null;
      geminiAppsSession: GeminiAppsSessionStatus;
      primary: GeminiUsageWindow | null;
      secondary: GeminiUsageWindow | null;
      tertiary: GeminiUsageWindow | null;
      models: Array<{
        modelId: string;
        label: string;
        usedPercent: number;
        remainingPercent: number;
        resetsAt: string | null;
        isAutocompleteOnly?: boolean;
      }>;
      updatedAt: string;
    }
  | {
      ok: false;
      source: "antigravity-cli-google" | "antigravity-cli-local" | "antigravity-local" | "gemini-cli-oauth";
      error: string;
      account: AccountAliasState;
      geminiApps: GeminiAppsUsage | null;
      geminiAppsSession: GeminiAppsSessionStatus;
      updatedAt: string;
    };

export type OverlaySettings = {
  enabled: boolean;
  closeToTray: boolean;
  providers: Record<ProviderId, boolean>;
  providerItems: Record<ProviderId, ProviderDisplaySettings>;
  showPlan: boolean;
  showSession: boolean;
  showUsed: boolean;
  showRemaining: boolean;
  showReset: boolean;
  opacity: number;
  fontSizePercent: number;
  position: OverlayPosition;
};

export type OverlayPosition = {
  mode: "default" | "custom";
  displayId?: number;
  right?: number;
  bottom?: number;
};

export type ProviderDisplaySettings = {
  enabled: boolean;
  showPlan: boolean;
  showSession: boolean;
  showUsed: boolean;
  showRemaining: boolean;
  showReset: boolean;
};

export type AlertProviderId = "codex" | "claude" | "antigravity";

export type NotificationSettings = {
  enabled: boolean;
  windowsNotifications: boolean;
  alwaysOnTopAlerts: boolean;
  overlayWarnings: boolean;
  notifyExhausted: boolean;
  notifyReset: boolean;
  thresholds: number[];
  providers: Record<AlertProviderId, boolean>;
};

declare global {
  interface Window {
    tokenMonitor?: {
      platform: string;
      getCodexUsage: () => Promise<CodexUsageResult>;
      getClaudeUsage: (force?: boolean) => Promise<ClaudeUsageResult>;
      getGeminiUsage: (force?: boolean) => Promise<GeminiUsageResult>;
      getCliSessionStatus: (force?: boolean) => Promise<CliSessionResult>;
      getDeveloperMode: () => Promise<DeveloperModeInfo>;
      getDeveloperDiagnostics: () => Promise<DeveloperDiagnostics>;
      getCodexPathStatus: () => Promise<CodexPathStatus>;
      selectCodexExecutablePath: () => Promise<CodexPathUpdateResult>;
      updateCodexExecutablePath: (candidate: string) => Promise<CodexPathUpdateResult>;
      resetCodexExecutablePath: () => Promise<CodexPathUpdateResult>;
      startClaudeLogin: () => Promise<{ ok: boolean; command: string; skipped?: boolean; detail?: string }>;
      setupClaudeStatusLine: (integrateExisting?: boolean) => Promise<{ ok: boolean; snapshotPath?: string; detail: string; requiresIntegration?: boolean }>;
      restoreClaudeStatusLine: () => Promise<{ ok: boolean; snapshotPath?: string; detail: string }>;
      getClaudeStatusLineRegistration: () => Promise<ClaudeStatusLineRegistrationStatus>;
      startGeminiLogin: () => Promise<{ ok: boolean; command: string; skipped?: boolean; detail?: string }>;
      startGeminiAppsLogin: (bounds?: Partial<GeminiViewBounds>) => Promise<{ ok: boolean; detail?: string }>;
      updateGeminiViewBounds: (bounds: Partial<GeminiViewBounds>) => Promise<{ ok: boolean }>;
      closeGeminiView: () => Promise<void>;
      minimizeToTray: () => Promise<void>;
      quitApp: () => Promise<void>;
      openProjectRepository: () => Promise<void>;
      openNodeJsDownload: () => Promise<void>;
      getOverlaySettings: () => Promise<OverlaySettings>;
      updateOverlaySettings: (settings: OverlaySettings) => Promise<OverlaySettings>;
      resizeOverlay: (size: { width?: number; height?: number }) => Promise<{ ok: boolean }>;
      getOverlayPositioning: () => Promise<boolean>;
      beginOverlayPositioning: () => Promise<{ ok: boolean }>;
      finishOverlayPositioning: () => Promise<{ ok: boolean }>;
      resetOverlayPosition: () => Promise<OverlaySettings>;
      getNotificationSettings: () => Promise<NotificationSettings>;
      updateNotificationSettings: (settings: NotificationSettings) => Promise<NotificationSettings>;
      sendTestNotification: () => Promise<{ ok: boolean }>;
      listAccountAliases: () => Promise<AccountAliasView[]>;
      renameAccountAlias: (recordId: string, alias: string) => Promise<{ ok: boolean; detail?: string; account?: AccountAliasView | null }>;
      deleteAccountAlias: (recordId: string) => Promise<{ ok: boolean; detail?: string }>;
      deleteProviderAliases: (provider: AccountProvider) => Promise<{ ok: boolean }>;
      deleteAllAccountAliases: () => Promise<{ ok: boolean }>;
      onAccountAliasesChanged: (callback: (aliases: AccountAliasView[]) => void) => () => void;
      onOverlaySettingsChanged: (callback: (settings: OverlaySettings) => void) => () => void;
      onOverlayPositioningChanged: (callback: (isPositioning: boolean) => void) => () => void;
      onNotificationSettingsChanged: (callback: (settings: NotificationSettings) => void) => () => void;
      onExitConfirmRequested: (callback: () => void) => () => void;
      onUsageRefreshRequested: (callback: () => void) => () => void;
      onGeminiViewClosed: (callback: (payload: { reason: "login-complete" | "usage-complete" | "manual" | "hidden" }) => void) => () => void;
    };
  }
}
