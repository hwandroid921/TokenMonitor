export type AccountIdentity = {
  name: string | null;
  nickname: string | null;
  email: string | null;
  source: string;
};

export type CodexUsageWindow = {
  label: string;
  usedPercent: number;
  remainingPercent: number;
  windowMinutes: number | null;
  resetsAt: string | null;
};

export type CodexUsageResult =
  | {
      ok: true;
      source: "codex-app-server";
      accountType: string | null;
      planType: string | null;
      hasAccountEmail: boolean;
      account: AccountIdentity | null;
      primary: CodexUsageWindow | null;
      secondary: CodexUsageWindow | null;
      fiveHour: CodexUsageWindow | null;
      weekly: CodexUsageWindow | null;
      otherWindows: CodexUsageWindow[];
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
      errorCode: CodexUsageErrorCode;
      error: string;
      updatedAt: string;
    };

export type CodexUsageErrorCode =
  | "desktop-not-installed"
  | "executable-not-found"
  | "invalid-configured-path"
  | "access-denied"
  | "app-server-start-failed"
  | "app-server-timeout"
  | "login-required"
  | "usage-read-failed"
  | "unsupported-response";

export type CodexPathStatus = {
  configuredPath: string | null;
  activePath: string | null;
  source: "manual" | "environment" | "local-direct" | "local-versioned" | "windows-apps" | "path" | "none";
  desktopInstalled: boolean;
  executableFound: boolean;
  configuredPathValid: boolean | null;
  connection: "unchecked" | "connected" | "login-required" | "failed";
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

export type ProviderId = "codex" | "claude" | "gemini";

export type CliSessionStatus = {
  provider: "codex" | "claude";
  ok: boolean;
  installed: boolean;
  loggedIn: boolean;
  authMethod: string | null;
  account: AccountIdentity | null;
  detail: string;
  checkedAt: string;
};

export type CliSessionResult = {
  codex: CliSessionStatus;
  claude: CliSessionStatus;
};

export type ClaudeUsageWindow = {
  label: string;
  tokens: number;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  requestCount: number;
  since: string;
};

export type ClaudeUsageResult =
  | {
      ok: true;
      source: "oauth+local-logs" | "local-logs";
      planType: string | null;
      oauth: {
        fiveHour: ClaudeOAuthWindow | null;
        sevenDay: ClaudeOAuthWindow | null;
        extraUsage: {
          isEnabled: boolean;
          monthlyLimit: number | null;
          usedCredits: number | null;
          utilization: number | null;
          currency: string | null;
          disabledReason: string | null;
        } | null;
      } | null;
      windows: {
        fiveHour: ClaudeUsageWindow;
        sevenDay: ClaudeUsageWindow;
        thirtyDay: ClaudeUsageWindow;
        allTime: ClaudeUsageWindow;
      };
      modelBreakdown: Array<{ model: string; tokens: number }>;
      logFileCount: number;
      lastActivityAt: string | null;
      updatedAt: string;
    }
  | {
      ok: false;
      source: "local-logs";
      error: string;
      updatedAt: string;
    };

export type ClaudeOAuthWindow = {
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
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
      account: AccountIdentity | null;
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
};

export type ProviderDisplaySettings = {
  enabled: boolean;
  showPlan: boolean;
  showSession: boolean;
  showUsed: boolean;
  showRemaining: boolean;
  showReset: boolean;
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
  account: AccountIdentity | null;
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
  codexIssues?: Array<{
    code: string;
    order: number;
    title: string;
    detail: string;
    resolution: string[];
    occurredAt: string;
    lastOccurredAt: string;
    count: number;
    resolvedAt: string | null;
  }>;
  geminiParser: {
    sessionLoggedIn: boolean;
    cacheAvailable: boolean;
    planParsed: boolean;
    fiveHourParsed: boolean;
    weeklyParsed: boolean;
    detail: string | null;
    updatedAt: string | null;
    debugUpdatedAt: string | null;
    usageDetected: boolean;
    percentCandidates: string[];
    snippets: string[];
  } | null;
};

declare global {
  interface Window {
    tokenMonitor?: {
      platform: string;
      getCodexUsage: (force?: boolean) => Promise<CodexUsageResult>;
      getClaudeUsage: (force?: boolean) => Promise<ClaudeUsageResult>;
      getGeminiUsage: (force?: boolean) => Promise<GeminiUsageResult>;
      getCliSessionStatus: (force?: boolean) => Promise<CliSessionResult>;
      getDeveloperMode: () => Promise<DeveloperModeInfo>;
      getDeveloperDiagnostics: () => Promise<DeveloperDiagnostics>;
      startClaudeLogin: () => Promise<{ ok: boolean; command: string; skipped?: boolean; detail?: string }>;
      startGeminiLogin: () => Promise<{ ok: boolean; command: string; skipped?: boolean; detail?: string }>;
      startGeminiAppsLogin: (bounds?: Partial<GeminiViewBounds>) => Promise<{ ok: boolean; detail?: string }>;
      updateGeminiViewBounds: (bounds: Partial<GeminiViewBounds>) => Promise<{ ok: boolean }>;
      closeGeminiView: () => Promise<void>;
      minimizeToTray: () => Promise<void>;
      quitApp: () => Promise<void>;
      openCodexUsageDashboard: () => Promise<void>;
      getCodexPathStatus: () => Promise<CodexPathStatus>;
      selectCodexExecutablePath: () => Promise<CodexPathUpdateResult>;
      updateCodexExecutablePath: (candidate: string) => Promise<CodexPathUpdateResult>;
      resetCodexExecutablePath: () => Promise<CodexPathUpdateResult>;
      openNodeJsDownload: () => Promise<void>;
      getOverlaySettings: () => Promise<OverlaySettings>;
      updateOverlaySettings: (settings: OverlaySettings) => Promise<OverlaySettings>;
      onOverlaySettingsChanged: (callback: (settings: OverlaySettings) => void) => () => void;
      onExitConfirmRequested: (callback: () => void) => () => void;
      onUsageRefreshRequested: (callback: () => void) => () => void;
      onGeminiViewClosed: (callback: (payload: { reason: "login-complete" | "usage-complete" | "manual" | "hidden" }) => void) => () => void;
    };
  }
}
