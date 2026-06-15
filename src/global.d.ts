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
      primary: CodexUsageWindow | null;
      secondary: CodexUsageWindow | null;
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

export type ProviderId = "codex" | "claude" | "gemini";

export type CliSessionStatus = {
  provider: "codex" | "claude";
  ok: boolean;
  installed: boolean;
  loggedIn: boolean;
  authMethod: string | null;
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
      accountEmail: string | null;
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

declare global {
  interface Window {
    tokenMonitor?: {
      platform: string;
      getCodexUsage: () => Promise<CodexUsageResult>;
      getClaudeUsage: (force?: boolean) => Promise<ClaudeUsageResult>;
      getGeminiUsage: (force?: boolean) => Promise<GeminiUsageResult>;
      getCliSessionStatus: (force?: boolean) => Promise<CliSessionResult>;
      startClaudeLogin: () => Promise<{ ok: boolean; command: string; skipped?: boolean; detail?: string }>;
      startGeminiLogin: () => Promise<{ ok: boolean; command: string; skipped?: boolean; detail?: string }>;
      startGeminiAppsLogin: (bounds?: Partial<GeminiViewBounds>) => Promise<{ ok: boolean; detail?: string }>;
      updateGeminiViewBounds: (bounds: Partial<GeminiViewBounds>) => Promise<{ ok: boolean }>;
      closeGeminiView: () => Promise<void>;
      minimizeToTray: () => Promise<void>;
      quitApp: () => Promise<void>;
      openCodexUsageDashboard: () => Promise<void>;
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
