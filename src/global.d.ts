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
      resizeOverlay: (size: { width?: number; height?: number }) => Promise<{ ok: boolean }>;
      listAccountAliases: () => Promise<AccountAliasView[]>;
      renameAccountAlias: (recordId: string, alias: string) => Promise<{ ok: boolean; detail?: string; account?: AccountAliasView | null }>;
      deleteAccountAlias: (recordId: string) => Promise<{ ok: boolean; detail?: string }>;
      deleteProviderAliases: (provider: AccountProvider) => Promise<{ ok: boolean }>;
      deleteAllAccountAliases: () => Promise<{ ok: boolean }>;
      onAccountAliasesChanged: (callback: (aliases: AccountAliasView[]) => void) => () => void;
      onOverlaySettingsChanged: (callback: (settings: OverlaySettings) => void) => () => void;
      onExitConfirmRequested: (callback: () => void) => () => void;
      onUsageRefreshRequested: (callback: () => void) => () => void;
      onGeminiViewClosed: (callback: (payload: { reason: "login-complete" | "usage-complete" | "manual" | "hidden" }) => void) => () => void;
    };
  }
}
