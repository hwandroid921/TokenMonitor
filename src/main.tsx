import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bug, ExternalLink, LayoutDashboard, Link, RefreshCw, Settings } from "lucide-react";
import "./styles.css";
import type {
  AccountAliasView,
  AccountProvider,
  AlertProviderId,
  ClaudeUsageResult,
  ClaudeUsageWindow,
  CliSessionResult,
  CodexPathStatus,
  CodexPathUpdateResult,
  CodexUsageResult,
  CodexUsageWindow,
  DeveloperDiagnostics,
  DeveloperModeInfo,
  GeminiAppsUsage,
  GeminiAppsUsageWindow,
  GeminiUsageResult,
  GeminiUsageWindow,
  NotificationSettings,
  OverlaySettings,
  ProviderId
} from "./global";

type ProviderUsage = {
  id: ProviderId;
  name: string;
  source: string;
  status: "live" | "pending" | "error" | "loading";
  fields?: ProviderField[];
  plan: string;
  session: string;
  used: string;
  remaining: string;
  reset: string;
  detail: string;
  canLogin?: boolean;
  actionLabel?: string;
  needsAlias?: boolean;
  issues?: ProviderIssue[];
};

type ProviderField = {
  label: string;
  value: string;
  kind: "identity" | "session" | "plan" | "quota" | "usage" | "remaining" | "reset";
  remainingPercent?: number | null;
};

type ProviderIssue = {
  reason: string;
  steps: string[];
};

type GeminiQuotaModelView = Extract<GeminiUsageResult, { ok: true }>["models"][number];

const providerLabels: Record<ProviderId, string> = {
  codex: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini"
};

const accountProviderLabels: Record<AccountProvider, string> = {
  codex: "ChatGPT",
  claude: "Claude",
  google: "Google (Gemini Apps + Antigravity)"
};

const appIconUrl = new URL("../assets/icon.svg", import.meta.url).href;

const providerStatusLabels: Record<ProviderUsage["status"], string> = {
  live: "정상",
  pending: "정보 대기",
  error: "연동 필요",
  loading: "확인 중"
};

const defaultOverlaySettings: OverlaySettings = {
  enabled: false,
  closeToTray: true,
  providers: {
    codex: true,
    claude: true,
    gemini: true
  },
  providerItems: {
    codex: { enabled: true, showPlan: true, showSession: true, showUsed: true, showRemaining: true, showReset: true },
    claude: { enabled: true, showPlan: true, showSession: true, showUsed: true, showRemaining: true, showReset: true },
    gemini: { enabled: true, showPlan: true, showSession: true, showUsed: true, showRemaining: true, showReset: true }
  },
  showPlan: true,
  showSession: true,
  showUsed: true,
  showRemaining: true,
  showReset: true,
  opacity: 50,
  fontSizePercent: 100,
  position: { mode: "default" }
};

const availableNotificationThresholds = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

const defaultNotificationSettings: NotificationSettings = {
  enabled: false,
  windowsNotifications: true,
  alwaysOnTopAlerts: false,
  overlayWarnings: true,
  notifyExhausted: true,
  notifyReset: true,
  thresholds: [10, 20, 30],
  providers: { codex: true, claude: true, antigravity: true }
};

const alertProviderLabels: Record<AlertProviderId, string> = {
  codex: "ChatGPT",
  claude: "Claude",
  antigravity: "Antigravity"
};

const claudeLoginPollIntervalMs = 2500;
const claudeLoginPollTimeoutMs = 30_000;
const geminiUsagePollIntervalMs = 2500;
const geminiUsagePollTimeoutMs = 60_000;

function App() {
  const geminiPanelRef = useRef<HTMLDivElement | null>(null);
  const geminiDialogRef = useRef<HTMLElement | null>(null);
  const exitDialogRef = useRef<HTMLElement | null>(null);
  const [codexUsage, setCodexUsage] = useState<CodexUsageResult | null>(null);
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsageResult | null>(null);
  const [geminiUsage, setGeminiUsage] = useState<GeminiUsageResult | null>(null);
  const [cliSessions, setCliSessions] = useState<CliSessionResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(defaultOverlaySettings);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(defaultNotificationSettings);
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings" | "developer">("dashboard");
  const [developerMode, setDeveloperMode] = useState<DeveloperModeInfo>({ enabled: false });
  const [developerDiagnostics, setDeveloperDiagnostics] = useState<DeveloperDiagnostics | null>(null);
  const [isDeveloperRefreshing, setIsDeveloperRefreshing] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isClaudeLoginPending, setIsClaudeLoginPending] = useState(false);
  const [isGeminiLoginPending, setIsGeminiLoginPending] = useState(false);
  const [isGeminiAppsLoginPending, setIsGeminiAppsLoginPending] = useState(false);
  const [isGeminiUsageCheckBlocking, setIsGeminiUsageCheckBlocking] = useState(false);
  const [isGeminiPanelOpen, setIsGeminiPanelOpen] = useState(false);
  const [claudeLoginNotice, setClaudeLoginNotice] = useState<string | null>(null);
  const [geminiLoginNotice, setGeminiLoginNotice] = useState<string | null>(null);
  const [geminiAppsLoginNotice, setGeminiAppsLoginNotice] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState("사용량 정보를 불러오는 중입니다.");
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [accountAliases, setAccountAliases] = useState<AccountAliasView[]>([]);
  const [accountAliasNotice, setAccountAliasNotice] = useState<string | null>(null);
  const refreshRequestRef = useRef(0);
  const notificationSettingsRef = useRef(notificationSettings);
  const notificationSaveRequestRef = useRef(0);

  const providers = useMemo(() => buildProviderUsage(codexUsage, claudeUsage, geminiUsage, cliSessions), [codexUsage, claudeUsage, geminiUsage, cliSessions]);

  async function refreshUsage(forceGemini = true) {
    const requestId = ++refreshRequestRef.current;
    setIsRefreshing(true);
    setRefreshNotice("사용량 정보를 새로고침하고 있습니다.");
    try {
      if (!window.tokenMonitor?.getCodexUsage || !window.tokenMonitor?.getClaudeUsage || !window.tokenMonitor?.getGeminiUsage || !window.tokenMonitor?.getCliSessionStatus) {
        setCodexUsage(makeCodexError("데스크탑 앱 연결을 확인할 수 없습니다."));
        setClaudeUsage(makeClaudeError("데스크탑 앱 연결을 확인할 수 없습니다."));
        setGeminiUsage(makeGeminiError("데스크탑 앱 연결을 확인할 수 없습니다."));
        setRefreshNotice("데스크톱 앱 연결을 확인할 수 없습니다.");
        return;
      }

      const [latestCodex, latestClaude, latestGemini, latestSessions] = await Promise.all([
        window.tokenMonitor.getCodexUsage(),
        window.tokenMonitor.getClaudeUsage(),
        window.tokenMonitor.getGeminiUsage(forceGemini),
        window.tokenMonitor.getCliSessionStatus()
      ]);
      if (requestId !== refreshRequestRef.current) {
        return;
      }
      setCodexUsage(latestCodex);
      setClaudeUsage(latestClaude);
      setGeminiUsage(latestGemini);
      setCliSessions(latestSessions);
      const successCount = [latestCodex, latestClaude, latestGemini].filter((result) => result.ok).length;
      setRefreshNotice(`${successCount}개 서비스 갱신 완료 · ${formatTime(new Date().toISOString())}`);
    } catch {
      if (requestId === refreshRequestRef.current) {
        setRefreshNotice("사용량 새로고침을 완료하지 못했습니다. 다시 시도하세요.");
      }
    } finally {
      if (requestId === refreshRequestRef.current) {
        setIsRefreshing(false);
      }
    }
  }

  async function updateOverlaySettings(nextSettings: OverlaySettings) {
    const previousSettings = overlaySettings;
    setOverlaySettings(nextSettings);
    setIsSettingsSaving(true);
    setSettingsNotice("설정을 저장하고 있습니다.");

    try {
      if (!window.tokenMonitor?.updateOverlaySettings) {
        throw new Error("설정 저장 API를 사용할 수 없습니다.");
      }
      const saved = await window.tokenMonitor.updateOverlaySettings(nextSettings);
      setOverlaySettings(saved);
      setSettingsNotice("설정이 저장되었습니다.");
    } catch {
      setOverlaySettings(previousSettings);
      setSettingsNotice("설정을 저장하지 못했습니다. 이전 설정으로 되돌렸습니다.");
    } finally {
      setIsSettingsSaving(false);
    }
  }

  async function beginOverlayPositioning() {
    if (!window.tokenMonitor?.beginOverlayPositioning) {
      setSettingsNotice("오버레이 위치 조정 기능을 사용할 수 없습니다.");
      return;
    }
    const result = await window.tokenMonitor.beginOverlayPositioning();
    setSettingsNotice(result.ok ? "오버레이 창을 드래그한 뒤 우측 상단의 완료 버튼을 누르세요." : "오버레이 위치 변경을 시작하지 못했습니다.");
  }

  async function resetOverlayPosition() {
    if (!window.tokenMonitor?.resetOverlayPosition) {
      setSettingsNotice("오버레이 위치를 초기화할 수 없습니다.");
      return;
    }
    const saved = await window.tokenMonitor.resetOverlayPosition();
    setOverlaySettings(saved);
    setSettingsNotice("오버레이 위치를 초기화했습니다.");
  }

  async function saveNotificationSettings(patch: Partial<NotificationSettings>) {
    const requestId = ++notificationSaveRequestRef.current;
    const nextSettings = { ...notificationSettingsRef.current, ...patch };
    notificationSettingsRef.current = nextSettings;
    setNotificationSettings(nextSettings);
    setNotificationNotice("알림 설정을 저장하고 있습니다.");
    try {
      if (!window.tokenMonitor?.updateNotificationSettings) {
        throw new Error("알림 설정 API를 사용할 수 없습니다.");
      }
      const saved = await window.tokenMonitor.updateNotificationSettings(nextSettings);
      if (requestId === notificationSaveRequestRef.current) {
        notificationSettingsRef.current = saved;
        setNotificationSettings(saved);
        setNotificationNotice("알림 설정이 저장되었습니다.");
      }
    } catch {
      if (requestId === notificationSaveRequestRef.current) {
        setNotificationNotice("알림 설정을 저장하지 못했습니다. 다시 시도하세요.");
      }
    }
  }

  async function refreshAccountAliases() {
    if (window.tokenMonitor?.listAccountAliases) {
      setAccountAliases(await window.tokenMonitor.listAccountAliases());
    }
  }

  async function handleRenameAccountAlias(recordId: string, alias: string) {
    const result = await window.tokenMonitor?.renameAccountAlias(recordId, alias);
    if (!result?.ok) {
      setAccountAliasNotice(result?.detail ?? "별칭을 저장하지 못했습니다.");
      return false;
    }
    setAccountAliasNotice("계정 별칭을 저장했습니다.");
    await refreshAccountAliases();
    return true;
  }

  async function handleDeleteAccountAlias(recordId: string) {
    const result = await window.tokenMonitor?.deleteAccountAlias(recordId);
    if (!result?.ok) {
      setAccountAliasNotice(result?.detail ?? "계정 별칭을 삭제하지 못했습니다.");
      return;
    }
    setAccountAliasNotice("Token Monitor의 계정 별칭 등록을 삭제했습니다. 공급자 로그인에는 영향을 주지 않습니다.");
    await refreshAccountAliases();
  }

  async function handleDeleteProviderAliases(provider: AccountProvider) {
    await window.tokenMonitor?.deleteProviderAliases(provider);
    setAccountAliasNotice("해당 서비스의 저장된 별칭을 모두 삭제했습니다.");
    await refreshAccountAliases();
  }

  async function handleDeleteAllAccountAliases() {
    await window.tokenMonitor?.deleteAllAccountAliases();
    setAccountAliasNotice("저장된 모든 계정 별칭을 삭제했습니다.");
    await refreshAccountAliases();
  }

  function closeExitConfirm() {
    setShowExitConfirm(false);
  }

  function closeGeminiPanel() {
    setIsGeminiPanelOpen(false);
    setIsGeminiUsageCheckBlocking(false);
    setIsGeminiAppsLoginPending(false);
    void window.tokenMonitor?.closeGeminiView();
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const tabs: Array<"dashboard" | "settings" | "developer"> = developerMode.enabled
      ? ["dashboard", "settings", "developer"]
      : ["dashboard", "settings"];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex === -1) {
      return;
    }
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = tabs[(currentIndex + delta + tabs.length) % tabs.length];
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`${nextTab}-tab`)?.focus());
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>, onClose: () => void) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])"));
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function getGeminiPanelBounds() {
    const rect = geminiPanelRef.current?.getBoundingClientRect();
    if (!rect) {
      return undefined;
    }

    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
  }

  async function syncGeminiPanelBounds() {
    const bounds = getGeminiPanelBounds();
    if (bounds) {
      await window.tokenMonitor?.updateGeminiViewBounds(bounds);
    }
    return bounds;
  }

  async function handleMinimizeToTray() {
    setShowExitConfirm(false);
    await window.tokenMonitor?.minimizeToTray();
  }

  async function handleClaudeLogin() {
    if (isClaudeLoginPending) {
      return;
    }

    setIsClaudeLoginPending(true);
    setClaudeLoginNotice(null);
    try {
      const startResult = await window.tokenMonitor?.startClaudeLogin();
      if (!startResult?.ok) {
        setClaudeLoginNotice(startResult?.detail ?? "Claude 연동에는 Node.js/npm 설치가 필요합니다.");
        await refreshUsage();
        return;
      }

      if (startResult.skipped) {
        setClaudeLoginNotice(startResult.detail ?? "Claude 연결이 확인되었습니다. Claude Code에서 대화를 시작하세요.");
        await refreshUsage();
        return;
      }

      const result = await waitForClaudeLoginCompletion({
        onUpdate: ({ claudeUsage, cliSessions }) => {
          setClaudeUsage(claudeUsage);
          setCliSessions(cliSessions);
        }
      });
      if (!result.completed) {
        setClaudeLoginNotice(makeClaudeLoginNotice(result.claudeUsage, result.cliSessions));
      }
      await refreshUsage();
    } catch (error) {
      setClaudeLoginNotice(error instanceof Error ? error.message : "Claude 연동 확인을 시작할 수 없습니다.");
    } finally {
      setIsClaudeLoginPending(false);
    }
  }

  async function handleGeminiLogin() {
    if (isGeminiLoginPending) {
      return;
    }

    setIsGeminiLoginPending(true);
    setGeminiLoginNotice(null);
    try {
      const startResult = await window.tokenMonitor?.startGeminiLogin();
      if (!startResult?.ok) {
        setGeminiLoginNotice(startResult?.detail ?? "Antigravity CLI 설정에는 Node.js/npm 설치가 필요합니다.");
        await refreshUsage();
        return;
      }
      window.setTimeout(() => {
        void refreshUsage();
        setIsGeminiLoginPending(false);
      }, 5000);
    } catch (error) {
      setGeminiLoginNotice(error instanceof Error ? error.message : "Antigravity CLI 설치 및 로그인을 시작할 수 없습니다.");
      setIsGeminiLoginPending(false);
    }
  }

  async function handleGeminiAppsLogin() {
    if (isGeminiAppsLoginPending) {
      return;
    }

    const isUsageCheck = Boolean(geminiUsage?.geminiAppsSession.loggedIn);
    const previousGeminiAppsUpdatedAt = geminiUsage?.ok ? geminiUsage.geminiApps?.updatedAt ?? null : null;
    setIsGeminiAppsLoginPending(true);
    setIsGeminiUsageCheckBlocking(isUsageCheck);
    setIsGeminiPanelOpen(true);
    setGeminiAppsLoginNotice(null);
    try {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const bounds = await syncGeminiPanelBounds();
      const startResult = await window.tokenMonitor?.startGeminiAppsLogin(bounds);
      if (!startResult?.ok) {
        setGeminiAppsLoginNotice(startResult?.detail ?? "Gemini 작업을 시작할 수 없습니다.");
        return;
      }

      setGeminiAppsLoginNotice(startResult.detail ?? (isUsageCheck ? "Gemini 사용량을 확인하고 있습니다." : "Gemini 로그인 상태를 확인하고 있습니다."));
      if (isUsageCheck) {
        const result = await waitForGeminiAppsUsageCompletion(previousGeminiAppsUpdatedAt, setGeminiUsage);
        setGeminiAppsLoginNotice(result.completed ? null : "Usage Limits 화면에서 남은 사용량 %를 확인하지 못했습니다. 사용량 확인 버튼으로 다시 시도하세요.");
        return;
      }

      window.setTimeout(() => {
        void refreshUsage();
        setIsGeminiAppsLoginPending(false);
      }, 5000);
      return;
    } catch (error) {
      setGeminiAppsLoginNotice(error instanceof Error ? error.message : "Gemini 작업을 시작할 수 없습니다.");
      return;
    } finally {
      if (isUsageCheck) {
        setIsGeminiUsageCheckBlocking(false);
        setIsGeminiAppsLoginPending(false);
      } else {
        setIsGeminiUsageCheckBlocking(false);
        setIsGeminiAppsLoginPending(false);
      }
    }
  }

  async function refreshDeveloperDiagnostics() {
    if (!window.tokenMonitor?.getDeveloperDiagnostics) {
      return;
    }
    setIsDeveloperRefreshing(true);
    try {
      setDeveloperDiagnostics(await window.tokenMonitor.getDeveloperDiagnostics());
    } finally {
      setIsDeveloperRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshUsage();
    void window.tokenMonitor?.getOverlaySettings().then(setOverlaySettings);
    void window.tokenMonitor?.getNotificationSettings().then((settings) => {
      notificationSettingsRef.current = settings;
      setNotificationSettings(settings);
    });
    void window.tokenMonitor?.getDeveloperMode().then((mode) => {
      setDeveloperMode(mode);
      if (mode.enabled) {
        void refreshDeveloperDiagnostics();
      }
    });
  }, []);

  useEffect(() => {
    if (!developerMode.enabled && activeTab === "developer") {
      setActiveTab("dashboard");
    }
  }, [activeTab, developerMode.enabled]);

  useEffect(() => {
    if (activeTab === "settings") {
      void refreshAccountAliases();
    } else {
      setAccountAliases([]);
    }
  }, [activeTab]);

  useEffect(() => {
    const unsubscribe = window.tokenMonitor?.onAccountAliasesChanged((aliases) => {
      if (activeTab === "settings") {
        setAccountAliases(aliases);
      }
    });
    return () => unsubscribe?.();
  }, [activeTab]);

  useEffect(() => {
    const unsubscribe = window.tokenMonitor?.onExitConfirmRequested(() => setShowExitConfirm(true));
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.tokenMonitor?.onUsageRefreshRequested(() => {
      void refreshUsage(false);
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!isGeminiPanelOpen) {
      return;
    }

    void syncGeminiPanelBounds();
    const handleResize = () => {
      void syncGeminiPanelBounds();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isGeminiPanelOpen]);

  useEffect(() => {
    const unsubscribe = window.tokenMonitor?.onGeminiViewClosed((payload) => {
      setIsGeminiPanelOpen(false);
      setIsGeminiUsageCheckBlocking(false);
      setIsGeminiAppsLoginPending(false);
      if (payload.reason === "login-complete" || payload.reason === "usage-complete") {
        void refreshUsage();
      }
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!showExitConfirm) {
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    exitDialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => previouslyFocused?.focus();
  }, [showExitConfirm]);

  useEffect(() => {
    if (!isGeminiPanelOpen) {
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    geminiDialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previouslyFocused?.focus();
  }, [isGeminiPanelOpen]);

  return (
    <main className="app-root">
      <section className="main-panel">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">
              <img src={appIconUrl} alt="" aria-hidden="true" />
            </span>
            <div>
              <strong>Token Monitor</strong>
            </div>
          </div>

          <div className="header-actions">
            <button className="icon-button" type="button" onClick={() => void refreshUsage()} disabled={isRefreshing} aria-busy={isRefreshing} aria-label="사용량 새로고침" title="사용량 새로고침">
              <RefreshCw size={17} aria-hidden="true" className={isRefreshing ? "spinning" : ""} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => void window.tokenMonitor?.openCodexUsageDashboard()}
              aria-label="ChatGPT 사용량 대시보드 열기"
              title="ChatGPT 사용량 대시보드 열기"
            >
              <ExternalLink size={17} aria-hidden="true" />
            </button>
          </div>
        </header>

        <p className="app-refresh-status" role="status" aria-live="polite">{refreshNotice}</p>

        <nav className="tab-bar" role="tablist" aria-label="화면 전환">
          <button id="dashboard-tab" role="tab" aria-selected={activeTab === "dashboard"} aria-controls="dashboard-panel" tabIndex={activeTab === "dashboard" ? 0 : -1} className={activeTab === "dashboard" ? "active" : ""} type="button" onKeyDown={handleTabKeyDown} onClick={() => setActiveTab("dashboard")}>
            <LayoutDashboard size={16} aria-hidden="true" />
            사용량 대시보드
          </button>
          <button id="settings-tab" role="tab" aria-selected={activeTab === "settings"} aria-controls="settings-panel" tabIndex={activeTab === "settings" ? 0 : -1} className={activeTab === "settings" ? "active" : ""} type="button" onKeyDown={handleTabKeyDown} onClick={() => setActiveTab("settings")}>
            <Settings size={16} aria-hidden="true" />
            설정
          </button>
          {developerMode.enabled ? (
            <button id="developer-tab" role="tab" aria-selected={activeTab === "developer"} aria-controls="developer-panel" tabIndex={activeTab === "developer" ? 0 : -1} className={activeTab === "developer" ? "active" : ""} type="button" onKeyDown={handleTabKeyDown} onClick={() => setActiveTab("developer")}>
              <Bug size={16} aria-hidden="true" />
              개발자
            </button>
          ) : null}
        </nav>

        {activeTab === "dashboard" ? (
          <section id="dashboard-panel" role="tabpanel" aria-labelledby="dashboard-tab" className="provider-grid" aria-label="서비스별 사용량">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                geminiUsage={geminiUsage}
                isClaudeLoginPending={isClaudeLoginPending}
                isGeminiLoginPending={isGeminiLoginPending}
                isGeminiAppsLoginPending={isGeminiAppsLoginPending}
                actionNotice={provider.id === "claude" ? claudeLoginNotice : provider.id === "gemini" ? [geminiLoginNotice, geminiAppsLoginNotice].filter(Boolean).join(" ") || null : null}
                onClaudeLogin={handleClaudeLogin}
                onGeminiLogin={handleGeminiLogin}
                onGeminiAppsLogin={handleGeminiAppsLogin}
                onManageAliases={() => setActiveTab("settings")}
              />
            ))}
          </section>
        ) : activeTab === "settings" ? (
          <div id="settings-panel" role="tabpanel" aria-labelledby="settings-tab">
            <SettingsPanel
              settings={overlaySettings}
              onChange={updateOverlaySettings}
              onBeginOverlayPositioning={beginOverlayPositioning}
              onResetOverlayPosition={resetOverlayPosition}
              notice={settingsNotice}
              isSaving={isSettingsSaving}
              notificationSettings={notificationSettings}
              notificationNotice={notificationNotice}
              onNotificationChange={saveNotificationSettings}
              accounts={accountAliases}
              accountNotice={accountAliasNotice}
              onRenameAccount={handleRenameAccountAlias}
              onDeleteAccount={handleDeleteAccountAlias}
              onDeleteProviderAccounts={handleDeleteProviderAliases}
              onDeleteAllAccounts={handleDeleteAllAccountAliases}
            />
            <CodexPathSettings />
          </div>
        ) : (
          <div id="developer-panel" role="tabpanel" aria-labelledby="developer-tab">
            <DeveloperPanel
              diagnostics={developerDiagnostics}
              isRefreshing={isDeveloperRefreshing}
              onRefresh={() => void refreshDeveloperDiagnostics()}
            />
          </div>
        )}
      </section>

      {isGeminiPanelOpen ? (
        <section ref={geminiDialogRef} className="gemini-browser-panel" role="dialog" aria-modal="true" aria-labelledby="gemini-browser-title" onKeyDown={(event) => handleDialogKeyDown(event, closeGeminiPanel)}>
          <div className="gemini-browser-panel-header">
            <div>
              <strong id="gemini-browser-title">{geminiUsage?.geminiAppsSession.loggedIn ? "Gemini 사용량 확인" : "Gemini 로그인"}</strong>
              {isGeminiUsageCheckBlocking ? <span className="gemini-browser-status" role="status" aria-live="polite">Usage Limits 정보를 확인하고 있습니다.</span> : null}
            </div>
            <button
              className="provider-secondary-action"
              type="button"
              onClick={closeGeminiPanel}
            >
              닫기
            </button>
          </div>
          <div ref={geminiPanelRef} className="gemini-browser-view-host" />
        </section>
      ) : null}

      {showExitConfirm ? (
        <div className="app-dialog-backdrop" role="presentation">
          <section ref={exitDialogRef} className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-dialog-title" onKeyDown={(event) => handleDialogKeyDown(event, closeExitConfirm)}>
            <h2 id="exit-dialog-title">프로그램 종료</h2>
            <p>지금 종료하면 Token Monitor와 오버레이가 모두 종료됩니다.</p>
            <div className="app-dialog-actions">
              <button className="secondary-button" type="button" data-autofocus onClick={closeExitConfirm}>
                취소
              </button>
              {overlaySettings.closeToTray ? (
                <button className="secondary-button tray-button" type="button" onClick={() => void handleMinimizeToTray()}>
                  최소화
                </button>
              ) : null}
              <button className="danger-button" type="button" onClick={() => void window.tokenMonitor?.quitApp()}>
                종료
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ProviderCard({
  provider,
  geminiUsage,
  isClaudeLoginPending,
  isGeminiLoginPending,
  isGeminiAppsLoginPending,
  actionNotice,
  onClaudeLogin,
  onGeminiLogin,
  onGeminiAppsLogin,
  onManageAliases
}: {
  provider: ProviderUsage;
  geminiUsage: GeminiUsageResult | null;
  isClaudeLoginPending: boolean;
  isGeminiLoginPending: boolean;
  isGeminiAppsLoginPending: boolean;
  actionNotice: string | null;
  onClaudeLogin: () => void;
  onGeminiLogin: () => void;
  onGeminiAppsLogin: () => void;
  onManageAliases: () => void;
}) {
  const effectiveStatus = provider.needsAlias || provider.status === "live" && (provider.issues ?? getProviderIssues(provider)).length > 0 ? "pending" : provider.status;
  const isActionPending = provider.id === "claude" && isClaudeLoginPending || provider.id === "gemini" && isGeminiLoginPending;
  const actionLabel = isActionPending ? "연동 확인 중" : (provider.actionLabel ?? "사용량 수집 연동");
  const isGeminiAppsLoggedIn = provider.id === "gemini" && Boolean(geminiUsage?.geminiAppsSession.loggedIn);
  const geminiAppsActionLabel = isGeminiAppsLoginPending
    ? isGeminiAppsLoggedIn ? "사용량 확인 중" : "Gemini 로그인 확인 중"
    : isGeminiAppsLoggedIn ? "사용량 확인" : "Gemini 로그인";
  const handleAction = provider.id === "gemini" ? onGeminiLogin : onClaudeLogin;
  const showHeaderActions = Boolean(provider.canLogin || provider.id === "gemini" || provider.needsAlias);
  const showNodeInstallAction = Boolean(actionNotice?.includes("Node.js/npm"));
  const handleNodeInstall = () => {
    void window.tokenMonitor?.openNodeJsDownload();
  };

  return (
    <article className="provider-card">
      <div className="provider-card-header">
        <div>
          <span className="provider-source">{provider.source}</span>
          <h2>{provider.name}</h2>
        </div>
        <span className={`status-badge ${effectiveStatus}`}>{providerStatusLabels[effectiveStatus]}</span>
      </div>

      {showHeaderActions ? (
        <div className="provider-header-actions">
            {provider.needsAlias ? (
              <button className="provider-action provider-header-action provider-header-action-secondary" type="button" onClick={onManageAliases}>
                <Settings size={15} aria-hidden="true" />
                <span>별칭 지정</span>
              </button>
            ) : null}
            {provider.id === "gemini" ? (
              <button
                className="provider-action provider-header-action provider-header-action-secondary"
                type="button"
                onClick={onGeminiAppsLogin}
                disabled={isGeminiAppsLoginPending}
                aria-busy={isGeminiAppsLoginPending}
                aria-label={geminiAppsActionLabel}
                title={geminiAppsActionLabel}
              >
                {isGeminiAppsLoginPending ? <RefreshCw size={15} aria-hidden="true" className="spinning" /> : <ExternalLink size={15} aria-hidden="true" />}
                <span>{geminiAppsActionLabel}</span>
              </button>
            ) : null}
            {provider.canLogin ? (
              <button
                className="provider-action provider-header-action"
                type="button"
                onClick={handleAction}
                disabled={isActionPending}
                aria-busy={isActionPending}
                aria-label={actionLabel}
                title={actionLabel}
              >
                {isActionPending ? <RefreshCw size={15} aria-hidden="true" className="spinning" /> : <Link size={15} aria-hidden="true" />}
                <span>{actionLabel}</span>
              </button>
            ) : null}
        </div>
      ) : null}

      {provider.id === "claude" && provider.canLogin ? (
        <p className="provider-onboarding-note">로그인 후 Claude Code에서 대화를 한 번 진행해야 사용량이 표시됩니다.</p>
      ) : null}

      <ProviderFields provider={provider} />

      {actionNotice ? (
        <div className="provider-action-notice">
          <p>{actionNotice}</p>
          {showNodeInstallAction ? (
            <button className="provider-secondary-action" type="button" onClick={handleNodeInstall}>
              <ExternalLink size={14} aria-hidden="true" />
              <span>Node.js 설치</span>
            </button>
          ) : null}
        </div>
      ) : null}
      <ProviderIssueNotice provider={provider} />
      <p className="provider-meta">{provider.detail}</p>
    </article>
  );
}

function ProviderFields({ provider }: { provider: ProviderUsage }) {
  const fields = provider.fields ?? defaultProviderFields(provider);
  if (provider.id !== "gemini") {
    return <UsageFieldList fields={fields} />;
  }

  const commonFields = fields.filter((field) => !field.label.startsWith("Gemini ") && !field.label.startsWith("Antigravity "));
  const geminiFields = fields.filter((field) => field.label.startsWith("Gemini "));
  const antigravityFields = fields.filter((field) => field.label.startsWith("Antigravity "));

  return (
    <div className="gemini-usage-groups">
      {commonFields.length > 0 ? <UsageFieldList fields={commonFields} /> : null}
      <section className="usage-field-group" aria-labelledby="gemini-apps-fields">
        <h3 id="gemini-apps-fields">Gemini Apps</h3>
        <UsageFieldList fields={geminiFields} trimPrefix="Gemini " />
      </section>
      <section className="usage-field-group" aria-labelledby="antigravity-fields">
        <h3 id="antigravity-fields">Antigravity</h3>
        <UsageFieldList fields={antigravityFields} trimPrefix="Antigravity " />
      </section>
    </div>
  );
}

function UsageFieldList({ fields, trimPrefix = "" }: { fields: ProviderField[]; trimPrefix?: string }) {
  return (
    <dl className="usage-fields">
      {fields.map((field) => (
        <div key={field.label}>
          <dt>{trimPrefix ? field.label.replace(trimPrefix, "") : field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProviderIssueNotice({ provider }: { provider: ProviderUsage }) {
  const issues = provider.issues ?? getProviderIssues(provider);
  if (issues.length === 0) {
    return null;
  }

  return (
    <div className="provider-issues" aria-label={`${provider.name} 사용량 확인 필요`}>
      {issues.map((issue) => (
        <details className="provider-issue" key={issue.reason}>
          <summary>
            <span>필요한 조치</span>
            <strong>{issue.reason}</strong>
          </summary>
          <ol>
            {issue.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}

function ProviderCollectionGuide({ providerId }: { providerId: ProviderId }) {
  const guide = getProviderCollectionGuide(providerId);

  return (
    <details className="collection-guide">
      <summary>연동 및 수집 방법 <span>{guide.title}</span></summary>
      <div className="collection-guide-body" aria-label={`${providerLabels[providerId]} 수집 경로`}>
        <p>{guide.summary}</p>
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </details>
  );
}

function getProviderCollectionGuide(providerId: ProviderId) {
  if (providerId === "codex") {
    return {
      title: "ChatGPT 로컬 앱 서버",
      summary: "Codex Desktop 설치와 로그인이 완료된 상태에서 ChatGPT 주간/주기 quota를 확인합니다.",
      steps: [
        "Codex Desktop 설치 필수",
        "Codex Desktop 로그인 상태 확인",
        "Codex CLI 또는 ChatGPT 앱 내 Codex 실행 파일을 탐색해 실행",
        "표시용 plan, remaining, reset 값만 대시보드에 반영"
      ]
    };
  }

  if (providerId === "claude") {
    return {
      title: "Claude Code Status Line",
      summary: "Node.js/npm이 준비된 상태에서 Claude Pro/Max 이상 계정으로 Claude CLI OAuth 로그인을 진행하고, Claude Code Status Line이 제공한 사용량을 표시합니다.",
      steps: [
        "Node.js/npm 설치 상태 확인",
        "Claude Pro/Max 이상 계정 확인",
        "Claude CLI 설치 및 로그인 버튼 실행",
        "Claude Code에서 대화를 시작해 첫 응답 수신",
        "Status Line의 주간·주기(5시간) 사용량과 초기화 시간 표시"
      ]
    };
  }

  return {
    title: "Gemini Usage Limits + Antigravity CLI",
    summary: "Gemini Apps 한도는 Gemini 웹 Usage Limits 화면에서, Antigravity 한도는 CLI 또는 local fallback에서 분리해 표시합니다.",
    steps: [
      "Gemini 로그인 버튼 실행",
      "로그인 완료 후 사용량 확인 버튼 실행",
      "Antigravity 한도가 필요하면 Node.js LTS 설치",
      "Antigravity CLI 설치 및 로그인 버튼 실행"
    ]
  };
}

function getProviderIssues(provider: ProviderUsage): ProviderIssue[] {
  const hasUnavailableField = (provider.fields ?? defaultProviderFields(provider)).some((field) => isUnavailableValue(field.value));
  if (provider.status !== "error" && !hasUnavailableField) {
    return [];
  }

  if (provider.id === "codex") {
    return [{
      reason: "ChatGPT 로그인 필요",
      steps: [
        "Codex Desktop 설치",
        "Codex Desktop 로그인",
        "필요 시 CODEX_CLI_PATH 설정"
      ]
    }];
  }

  if (provider.id === "claude") {
    return [{
      reason: "Claude CLI 로그인 필요",
      steps: [
        "Node.js LTS 설치",
        "Claude Pro/Max 이상 계정 준비",
        "Claude CLI 설치 및 로그인 버튼 실행",
        "브라우저 인증 완료"
      ]
    }];
  }

  return [];
}

function isUnavailableValue(value: string) {
  return /확인 불가|확인 필요|미연동|연동 필요|데이터 없음|서버 한도 미연동/.test(value);
}

async function waitForClaudeLoginCompletion({ onUpdate }: { onUpdate: (usage: { claudeUsage: ClaudeUsageResult; cliSessions: CliSessionResult }) => void }) {
  const startedAt = Date.now();
  let latestClaudeUsage: ClaudeUsageResult | null = null;
  let latestCliSessions: CliSessionResult | null = null;

  while (Date.now() - startedAt < claudeLoginPollTimeoutMs) {
    const [claudeUsage, cliSessions] = await Promise.all([
      window.tokenMonitor?.getClaudeUsage(true),
      window.tokenMonitor?.getCliSessionStatus(true)
    ]);

    if (claudeUsage && cliSessions) {
      latestClaudeUsage = claudeUsage;
      latestCliSessions = cliSessions;
      onUpdate({ claudeUsage, cliSessions });

      if (isClaudeUsageLinked(claudeUsage, cliSessions)) {
        return { completed: true, claudeUsage, cliSessions };
      }
    }

    await delay(claudeLoginPollIntervalMs);
  }

  return { completed: false, claudeUsage: latestClaudeUsage, cliSessions: latestCliSessions };
}

function isClaudeUsageLinked(claudeUsage: ClaudeUsageResult, cliSessions: CliSessionResult) {
  return Boolean(cliSessions.claude.loggedIn);
}

function makeClaudeLoginNotice(claudeUsage: ClaudeUsageResult | null, cliSessions: CliSessionResult | null) {
  const session = cliSessions?.claude;
  if (session && !session.installed) {
    return `Claude 연동에는 Node.js/npm 설치가 필요합니다. ${session.detail}`;
  }
  if (session && !session.loggedIn) {
    return `30초 안에 Claude 로그인이 확인되지 않았습니다. ${session.detail}`;
  }
  if (!claudeUsage?.ok) {
    return `Claude 연결은 확인되었습니다. Claude Code에서 대화를 시작한 뒤 첫 응답을 받으면 Status Line 사용량이 표시됩니다. ${claudeUsage?.error ?? ""}`.trim();
  }
  return "Claude 연결은 완료됐습니다. Claude Code에서 대화를 시작하면 Status Line 사용량이 표시됩니다.";
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForGeminiAppsUsageCompletion(
  previousUpdatedAt: string | null,
  onUpdate: (usage: GeminiUsageResult) => void
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < geminiUsagePollTimeoutMs) {
    const latestGemini = await window.tokenMonitor?.getGeminiUsage(true);
    if (latestGemini) {
      onUpdate(latestGemini);
      if (latestGemini.ok && latestGemini.geminiApps?.updatedAt && latestGemini.geminiApps.updatedAt !== previousUpdatedAt) {
        return { completed: true, geminiUsage: latestGemini };
      }
    }

    await delay(geminiUsagePollIntervalMs);
  }

  return { completed: false, geminiUsage: null };
}

function defaultProviderFields(provider: ProviderUsage): ProviderField[] {
  return [
    { label: "플랜", value: provider.plan, kind: "plan" },
    { label: "잔여 사용량", value: provider.remaining, kind: "remaining" },
    { label: "초기화", value: provider.reset, kind: "reset" }
  ];
}

function SettingsPanel({
  settings,
  onChange,
  onBeginOverlayPositioning,
  onResetOverlayPosition,
  notice,
  isSaving,
  notificationSettings,
  notificationNotice,
  onNotificationChange,
  accounts,
  accountNotice,
  onRenameAccount,
  onDeleteAccount,
  onDeleteProviderAccounts,
  onDeleteAllAccounts
}: {
  settings: OverlaySettings;
  onChange: (settings: OverlaySettings) => void;
  onBeginOverlayPositioning: () => Promise<void>;
  onResetOverlayPosition: () => Promise<void>;
  notice: string | null;
  isSaving: boolean;
  notificationSettings: NotificationSettings;
  notificationNotice: string | null;
  onNotificationChange: (patch: Partial<NotificationSettings>) => Promise<void>;
  accounts: AccountAliasView[];
  accountNotice: string | null;
  onRenameAccount: (recordId: string, alias: string) => Promise<boolean>;
  onDeleteAccount: (recordId: string) => Promise<void>;
  onDeleteProviderAccounts: (provider: AccountProvider) => Promise<void>;
  onDeleteAllAccounts: () => Promise<void>;
}) {
  function update(patch: Partial<OverlaySettings>) {
    onChange({ ...settings, ...patch });
  }

  function updateProviderItem(id: ProviderId, patch: Partial<OverlaySettings["providerItems"][ProviderId]>) {
    const nextItem = { ...settings.providerItems[id], ...patch };
    update({
      providers: {
        ...settings.providers,
        [id]: nextItem.enabled
      },
      providerItems: {
        ...settings.providerItems,
        [id]: nextItem
      }
    });
  }

  return (
    <section className="settings-panel" aria-label="설정" aria-busy={isSaving}>
      <div className="settings-heading">
        <div>
          <span className="eyebrow">기본 설정</span>
          <h1>오버레이와 종료 동작</h1>
        </div>
        <Settings size={20} aria-hidden="true" />
      </div>

      <label className="switch-row">
        <input type="checkbox" checked={settings.enabled} disabled={isSaving} onChange={(event) => update({ enabled: event.target.checked })} />
        <span>오버레이 켜기</span>
      </label>

      <section className="setting-group overlay-position-settings" aria-labelledby="overlay-position-heading">
        <div>
          <h2 id="overlay-position-heading">오버레이 위치</h2>
          <p>위치 변경 중에는 창 테두리가 강조되고 오버레이를 드래그할 수 있습니다. 완료하면 클릭 통과 상태로 돌아갑니다.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" disabled={isSaving || !settings.enabled} onClick={() => void onBeginOverlayPositioning()}>위치 변경</button>
          <button className="secondary-button" type="button" disabled={isSaving} onClick={() => void onResetOverlayPosition()}>위치 초기화</button>
        </div>
      </section>

      <label className="overlay-font-size-control">
        <span>오버레이 글자 크기</span>
        <input
          type="range"
          min="50"
          max="150"
          step="5"
          value={settings.fontSizePercent}
          disabled={isSaving}
          onChange={(event) => update({ fontSizePercent: Number(event.target.value) })}
        />
        <strong>{settings.fontSizePercent}%</strong>
      </label>

      <label className="switch-row">
        <input type="checkbox" checked={settings.closeToTray} disabled={isSaving} onChange={(event) => update({ closeToTray: event.target.checked })} />
        <span>프로그램 종료 시 시스템 트레이로 최소화</span>
      </label>

      <p className={`settings-save-status${notice?.includes("못했습니다") ? " error" : ""}`} role="status" aria-live="polite" aria-busy={isSaving}>
        {notice ?? "변경한 설정은 자동으로 저장됩니다."}
      </p>

      <NotificationSettingsPanel
        settings={notificationSettings}
        notice={notificationNotice}
        onChange={onNotificationChange}
      />

      <AccountAliasManager
        accounts={accounts}
        notice={accountNotice}
        onRename={onRenameAccount}
        onDelete={onDeleteAccount}
        onDeleteProvider={onDeleteProviderAccounts}
        onDeleteAll={onDeleteAllAccounts}
      />

      <section className="setting-group">
        <h2>서비스별 오버레이 표시</h2>
        <div className="provider-settings-list">
          {(Object.keys(providerLabels) as ProviderId[]).map((id) => {
            const item = settings.providerItems[id];
            return (
              <article className="provider-settings" key={id}>
                <label className="switch-row provider-toggle">
                  <input type="checkbox" checked={item.enabled} disabled={isSaving} onChange={(event) => updateProviderItem(id, { enabled: event.target.checked })} />
                  <span>{providerLabels[id]}</span>
                </label>

                {!item.enabled ? <p className="provider-disabled-note">현재 오버레이에는 표시되지 않습니다.</p> : null}

                <details className="provider-display-options" open>
                  <summary>표시 항목 사용자화</summary>
                  <fieldset disabled={!item.enabled || isSaving}>
                    <legend className="visually-hidden">{providerLabels[id]} 표시 항목</legend>
                    <div className="check-list compact">
                      <label>
                        <input type="checkbox" checked={item.showSession} onChange={(event) => updateProviderItem(id, { showSession: event.target.checked })} />
                        계정 별칭
                      </label>
                      <label>
                        <input type="checkbox" checked={item.showPlan} onChange={(event) => updateProviderItem(id, { showPlan: event.target.checked })} />
                        현재 플랜
                      </label>
                      <label>
                        <input type="checkbox" checked={item.showUsed} onChange={(event) => updateProviderItem(id, { showUsed: event.target.checked })} />
                        사용량
                      </label>
                      <label>
                        <input type="checkbox" checked={item.showRemaining} onChange={(event) => updateProviderItem(id, { showRemaining: event.target.checked })} />
                        잔여량
                      </label>
                      <label>
                        <input type="checkbox" checked={item.showReset} onChange={(event) => updateProviderItem(id, { showReset: event.target.checked })} />
                        초기화 시간
                      </label>
                    </div>
                  </fieldset>
                </details>

                <ProviderCollectionGuide providerId={id} />
              </article>
            );
          })}
        </div>
      </section>

    </section>
  );
}

function NotificationSettingsPanel({
  settings,
  notice,
  onChange
}: {
  settings: NotificationSettings;
  notice: string | null;
  onChange: (patch: Partial<NotificationSettings>) => Promise<void>;
}) {
  const [isTesting, setIsTesting] = useState(false);

  function update(patch: Partial<NotificationSettings>) {
    void onChange(patch);
  }

  function toggleThreshold(threshold: number) {
    const thresholds = settings.thresholds.includes(threshold)
      ? settings.thresholds.filter((value) => value !== threshold)
      : [...settings.thresholds, threshold].sort((a, b) => a - b);
    update({ thresholds });
  }

  function toggleProvider(provider: AlertProviderId, enabled: boolean) {
    update({ providers: { ...settings.providers, [provider]: enabled } });
  }

  async function testNotification() {
    setIsTesting(true);
    try {
      await window.tokenMonitor?.sendTestNotification();
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <section className="setting-group notification-settings" aria-labelledby="notification-settings-heading">
      <div className="notification-settings-heading">
        <div>
          <h2 id="notification-settings-heading">사용량 알림</h2>
          <p>앱이 트레이에서 실행 중인 동안 5분마다 사용량을 확인합니다.</p>
        </div>
        <button className="secondary-button" type="button" disabled={isTesting || !settings.enabled} onClick={() => void testNotification()}>
          {isTesting ? "알림 확인 중" : "테스트 알림"}
        </button>
      </div>

      <label className="switch-row">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
        <span>사용량 알림 사용</span>
      </label>

      <fieldset disabled={!settings.enabled}>
        <legend>알림 표시 방식</legend>
        <div className="check-list compact notification-channel-list">
          <label><input type="checkbox" checked={settings.windowsNotifications} onChange={(event) => update({ windowsNotifications: event.target.checked })} />Windows 알림</label>
          <label><input type="checkbox" checked={settings.alwaysOnTopAlerts} onChange={(event) => update({ alwaysOnTopAlerts: event.target.checked })} />12초 전면 경고</label>
          <label><input type="checkbox" checked={settings.overlayWarnings} onChange={(event) => update({ overlayWarnings: event.target.checked })} />오버레이 잔여량 색상</label>
          <label><input type="checkbox" checked={settings.notifyExhausted} onChange={(event) => update({ notifyExhausted: event.target.checked })} />모두 소진 알림</label>
          <label><input type="checkbox" checked={settings.notifyReset} onChange={(event) => update({ notifyReset: event.target.checked })} />실제 초기화 알림</label>
        </div>
        <p className="notification-help">전면 경고는 Windows 알림과 별개의 비포커스 창입니다. 네이티브 알림의 표시 순서는 Windows가 관리합니다.</p>

        <strong className="notification-subheading">자동 알림 대상</strong>
        <div className="check-list compact">
          {(Object.keys(alertProviderLabels) as AlertProviderId[]).map((provider) => (
            <label key={provider}><input type="checkbox" checked={settings.providers[provider]} onChange={(event) => toggleProvider(provider, event.target.checked)} />{alertProviderLabels[provider]}</label>
          ))}
        </div>
        <p className="notification-help">Gemini Apps 웹 캐시는 자동 갱신 데이터가 아니므로 임계치·초기화 알림에서 제외됩니다.</p>

        <strong className="notification-subheading">잔여량 임계치</strong>
        <div className="threshold-grid">
          {availableNotificationThresholds.map((threshold) => (
            <label key={threshold} className={settings.thresholds.includes(threshold) ? "selected" : ""}>
              <input type="checkbox" checked={settings.thresholds.includes(threshold)} onChange={() => toggleThreshold(threshold)} />
              {threshold}%
            </label>
          ))}
        </div>
      </fieldset>
      {notice ? <p className={`settings-save-status${notice.includes("못했습니다") ? " error" : ""}`} role="status" aria-live="polite">{notice}</p> : null}
    </section>
  );
}

function AccountAliasManager({
  accounts,
  notice,
  onRename,
  onDelete,
  onDeleteProvider,
  onDeleteAll
}: {
  accounts: AccountAliasView[];
  notice: string | null;
  onRename: (recordId: string, alias: string) => Promise<boolean>;
  onDelete: (recordId: string) => Promise<void>;
  onDeleteProvider: (provider: AccountProvider) => Promise<void>;
  onDeleteAll: () => Promise<void>;
}) {
  return (
    <section className="setting-group account-alias-manager" aria-labelledby="account-alias-heading">
      <div className="account-alias-heading">
        <div>
          <h2 id="account-alias-heading">계정 및 별칭 관리</h2>
        </div>
        {accounts.length > 0 ? (
          <button
            className="danger-outline-button"
            type="button"
            onClick={() => {
              if (window.confirm("저장된 모든 계정 별칭을 삭제하시겠습니까? 공급자 로그인에는 영향을 주지 않습니다.")) {
                void onDeleteAll();
              }
            }}
          >
            전체 별칭 삭제
          </button>
        ) : null}
      </div>

      {notice ? <p className="account-alias-notice" role="status" aria-live="polite">{notice}</p> : null}

      <div className="account-provider-list">
        {(Object.keys(accountProviderLabels) as AccountProvider[]).map((provider) => {
          const providerAccounts = accounts.filter((account) => account.provider === provider);
          return (
            <article className="account-provider-card" key={provider}>
              <div className="account-provider-heading">
                <div>
                  <h3>{accountProviderLabels[provider]}</h3>
                  <span>{providerAccounts.some((account) => account.isCurrent) ? "현재 계정 감지됨" : "현재 계정 미감지"}</span>
                </div>
                {providerAccounts.length > 0 ? (
                  <button
                    className="text-button danger-text"
                    type="button"
                    onClick={() => {
                      if (window.confirm(`${accountProviderLabels[provider]}의 저장된 별칭을 모두 삭제하시겠습니까?`)) {
                        void onDeleteProvider(provider);
                      }
                    }}
                  >
                    모두 삭제
                  </button>
                ) : null}
              </div>

              {providerAccounts.length === 0 ? (
                <p className="account-empty">로그인 계정이 확인되면 마스킹 이메일과 별칭 입력란이 표시됩니다.</p>
              ) : (
                <div className="account-record-list">
                  {providerAccounts.map((account) => (
                    <AccountAliasRow key={account.recordId} account={account} onRename={onRename} onDelete={onDelete} />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AccountAliasRow({
  account,
  onRename,
  onDelete
}: {
  account: AccountAliasView;
  onRename: (recordId: string, alias: string) => Promise<boolean>;
  onDelete: (recordId: string) => Promise<void>;
}) {
  const [alias, setAlias] = useState(account.alias ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setAlias(account.alias ?? "");
  }, [account.alias]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onRename(account.recordId, alias);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className={`account-record${account.isCurrent ? " current" : ""}`} onSubmit={submit}>
      <div className="account-record-identity">
        <span className="account-current-badge">{account.isCurrent ? "현재 로그인" : "이전 계정"}</span>
        <dl className="account-identity-fields">
          <div><dt>감지 상태</dt><dd>{account.isCurrent ? "현재 계정 감지됨" : "이전 감지 기록"}</dd></div>
          <div><dt>이메일</dt><dd>{account.maskedEmail}</dd></div>
          <div><dt>표시 이름</dt><dd>{account.alias ?? "미지정"}</dd></div>
          <div><dt>감지 방식</dt><dd>{account.confidence === "verified" ? "계정 확인됨" : "계정 정보 추정"}</dd></div>
        </dl>
      </div>
      <label>
        <span>이름/별칭</span>
        <input
          type="text"
          value={alias}
          maxLength={24}
          placeholder="예: 업무용 Google"
          autoComplete="off"
          disabled={isSaving}
          onChange={(event) => setAlias(event.target.value)}
        />
      </label>
      <div className="account-record-actions">
        <button className="secondary-button" type="submit" disabled={isSaving || !alias.trim()}>{isSaving ? "저장 중" : account.alias ? "변경" : "별칭 저장"}</button>
        <button
          className="danger-outline-button"
          type="button"
          disabled={isSaving}
          onClick={() => {
            if (window.confirm(`${account.maskedEmail}의 Token Monitor 별칭 등록을 삭제하시겠습니까?`)) {
              void onDelete(account.recordId);
            }
          }}
        >
          등록 삭제
        </button>
      </div>
    </form>
  );
}

function OverlayApp() {
  const [codexUsage, setCodexUsage] = useState<CodexUsageResult | null>(null);
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsageResult | null>(null);
  const [geminiUsage, setGeminiUsage] = useState<GeminiUsageResult | null>(null);
  const [cliSessions, setCliSessions] = useState<CliSessionResult | null>(null);
  const [settings, setSettings] = useState<OverlaySettings>(defaultOverlaySettings);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(defaultNotificationSettings);
  const [isPositioning, setIsPositioning] = useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const refreshRequestRef = useRef(0);

  const providers = useMemo(
    () => buildProviderUsage(codexUsage, claudeUsage, geminiUsage, cliSessions).filter((provider) => getProviderDisplay(settings, provider.id).enabled),
    [codexUsage, claudeUsage, geminiUsage, cliSessions, settings]
  );

  useEffect(() => {
    document.documentElement.classList.add("overlay-html");
    document.body.classList.add("overlay-body");
    return () => {
      document.documentElement.classList.remove("overlay-html");
      document.body.classList.remove("overlay-body");
    };
  }, []);

  useEffect(() => {
    void window.tokenMonitor?.getOverlaySettings().then(setSettings);
    const unsubscribe = window.tokenMonitor?.onOverlaySettingsChanged(setSettings);
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    void window.tokenMonitor?.getNotificationSettings().then(setNotificationSettings);
    const unsubscribe = window.tokenMonitor?.onNotificationSettingsChanged(setNotificationSettings);
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    void window.tokenMonitor?.getOverlayPositioning().then(setIsPositioning);
    const unsubscribe = window.tokenMonitor?.onOverlayPositioningChanged(setIsPositioning);
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    async function refresh() {
      const requestId = ++refreshRequestRef.current;
      if (!window.tokenMonitor?.getCodexUsage || !window.tokenMonitor?.getClaudeUsage || !window.tokenMonitor?.getGeminiUsage || !window.tokenMonitor?.getCliSessionStatus) {
        setCodexUsage(makeCodexError("데스크탑 앱 연결을 확인할 수 없습니다."));
        setClaudeUsage(makeClaudeError("데스크탑 앱 연결을 확인할 수 없습니다."));
        setGeminiUsage(makeGeminiError("데스크탑 앱 연결을 확인할 수 없습니다."));
        return;
      }

      const [latestCodex, latestClaude, latestGemini, latestSessions] = await Promise.all([
        window.tokenMonitor.getCodexUsage(),
        window.tokenMonitor.getClaudeUsage(),
        window.tokenMonitor.getGeminiUsage(),
        window.tokenMonitor.getCliSessionStatus()
      ]);
      if (requestId !== refreshRequestRef.current) {
        return;
      }
      setCodexUsage(latestCodex);
      setClaudeUsage(latestClaude);
      setGeminiUsage(latestGemini);
      setCliSessions(latestSessions);
    }

    void refresh();
    const unsubscribe = window.tokenMonitor?.onUsageRefreshRequested(() => {
      void refresh();
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !window.tokenMonitor?.resizeOverlay) {
      return;
    }

    let frameId = 0;
    const resize = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const textWidth = Array.from(content.querySelectorAll<HTMLElement>("strong, span, .overlay-muted"))
          .reduce((maximum, element) => Math.max(maximum, element.scrollWidth), 0);
        void window.tokenMonitor?.resizeOverlay({ width: textWidth + 28, height: content.scrollHeight });
      });
    };

    const observer = new ResizeObserver(resize);
    observer.observe(content);
    resize();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [providers, settings, isPositioning]);

  return (
    <main
      className={`overlay-root${isPositioning ? " position-editing" : ""}`}
      style={{
        "--overlay-heading-size": `${28 * settings.fontSizePercent / 100}px`,
        "--overlay-detail-size": `${24 * settings.fontSizePercent / 100}px`
      } as React.CSSProperties}
    >
      <section className="overlay-card" ref={contentRef}>
        {isPositioning ? <button className="overlay-position-finish" type="button" onClick={() => void window.tokenMonitor?.finishOverlayPositioning()}>완료</button> : null}
        <div className="overlay-provider-list">
          {providers.length === 0 ? (
            <p className="overlay-muted">표시할 서비스 없음</p>
          ) : (
            providers.map((provider) => <OverlayProvider key={provider.id} provider={provider} settings={settings} notificationSettings={notificationSettings} />)
          )}
        </div>
      </section>
    </main>
  );
}

function OverlayProvider({ provider, settings, notificationSettings }: { provider: ProviderUsage; settings: OverlaySettings; notificationSettings: NotificationSettings }) {
  const display = getProviderDisplay(settings, provider.id);
  const fields = filterProviderFields(provider.fields ?? defaultProviderFields(provider), display);
  const planField = fields.find((field) => field.kind === "plan");
  const detailFields = fields.filter((field) => field !== planField);
  const heading = display.showPlan && planField?.value ? `${provider.name.toUpperCase()} / ${formatOverlayValue(planField.value)}` : provider.name.toUpperCase();

  return (
    <article className="overlay-provider">
      <strong>{heading}</strong>
      {detailFields.map((field) => (
        <span key={field.label}>{field.label} <OverlayFieldValue field={field} display={display} warningsEnabled={notificationSettings.enabled && notificationSettings.overlayWarnings} /></span>
      ))}
    </article>
  );
}

function OverlayFieldValue({ field, display, warningsEnabled }: { field: ProviderField; display: ReturnType<typeof getProviderDisplay>; warningsEnabled: boolean }) {
  const value = formatFieldValueForDisplay(field, display);
  if (field.kind !== "quota" || field.remainingPercent == null || !display.showRemaining) {
    return <>{formatOverlayValue(value)}</>;
  }
  const match = field.value.match(/^사용량\s+(.+?)\s+\/\s+잔여량\s+(.+?)\s+\/\s+초기화\s+(.+)$/);
  if (!match) {
    return <>{formatOverlayValue(value)}</>;
  }
  const stateClass = !warningsEnabled
    ? ""
    : field.remainingPercent <= 0
      ? " exhausted"
      : field.remainingPercent < 30
        ? " warning"
        : " normal";
  return (
    <>
      {display.showUsed ? `사용 ${match[1]} · ` : null}
      <em className={`overlay-remaining${stateClass}`}>남음 {match[2]}{warningsEnabled && field.remainingPercent <= 0 ? " · 소진" : ""}</em>
      {display.showReset ? ` · ${match[3].replace("초기화 시간 없음", "reset 없음")}` : null}
    </>
  );
}

function filterProviderFields(fields: ProviderField[], display: ReturnType<typeof getProviderDisplay>) {
  return fields.filter((field) => {
    if (field.kind === "plan") {
      return display.showPlan;
    }
    if (field.kind === "identity") {
      return display.showSession;
    }
    if (field.kind === "session") {
      return display.showSession;
    }
    if (field.kind === "usage") {
      return display.showUsed;
    }
    if (field.kind === "remaining") {
      return display.showRemaining;
    }
    if (field.kind === "reset") {
      return display.showReset;
    }
    return display.showUsed || display.showRemaining || display.showReset;
  });
}

function formatFieldValueForDisplay(field: ProviderField, display: ReturnType<typeof getProviderDisplay>) {
  if (field.kind !== "quota") {
    return field.value;
  }

  const match = field.value.match(/^사용량\s+(.+?)\s+\/\s+잔여량\s+(.+?)\s+\/\s+초기화\s+(.+)$/);
  if (!match) {
    return field.value;
  }

  const parts = [
    display.showUsed ? `사용량 ${match[1]}` : null,
    display.showRemaining ? `잔여량 ${match[2]}` : null,
    display.showReset ? `초기화 ${match[3]}` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : field.value;
}

function formatOverlayValue(value: string) {
  return value
    .replace(/^사용량\s*/, "사용 ")
    .replace(/\s*\/\s*잔여량\s*/, " · 남음 ")
    .replace(/\s*\/\s*초기화\s*/, " · ")
    .replace("초기화 시간 없음", "reset 없음")
    .replace("남은 사용량 데이터 없음", "데이터 없음");
}

function getProviderDisplay(settings: OverlaySettings, id: ProviderId) {
  return settings.providerItems?.[id] ?? {
    enabled: settings.providers[id],
    showPlan: settings.showPlan,
    showSession: settings.showSession,
    showUsed: settings.showUsed,
    showRemaining: settings.showRemaining,
    showReset: settings.showReset
  };
}

function buildProviderUsage(
  codexUsage: CodexUsageResult | null,
  claudeUsage: ClaudeUsageResult | null,
  geminiUsage: GeminiUsageResult | null,
  sessions: CliSessionResult | null
): ProviderUsage[] {
  return [
    buildCodexProvider(codexUsage, sessions),
    buildClaudeProvider(claudeUsage, sessions),
    buildGeminiProvider(geminiUsage)
  ];
}

function buildCodexProvider(usage: CodexUsageResult | null, sessions: CliSessionResult | null): ProviderUsage {
  if (usage == null) {
    return {
      id: "codex",
      name: "ChatGPT",
      source: "OpenAI",
      status: "loading",
      plan: "확인 중",
      session: "확인 중",
      used: "확인 중",
      remaining: "확인 중",
      reset: "확인 중",
      fields: [
        { label: "플랜", value: "확인 중", kind: "plan" },
        { label: "주간", value: "확인 중", kind: "quota" },
        { label: "주기", value: "확인 중", kind: "quota" }
      ],
      detail: "Codex Desktop 로컬 앱 서버에서 ChatGPT 사용량을 읽고 있습니다."
    };
  }

  if (!usage.ok) {
    return {
      id: "codex",
      name: "ChatGPT",
      source: "OpenAI",
      status: "error",
      plan: "확인 불가",
      session: formatSession(sessions?.codex),
      used: "확인 불가",
      remaining: "확인 불가",
      reset: "확인 불가",
      fields: [
        { label: "플랜", value: "확인 불가", kind: "plan" },
        { label: "주간", value: "확인 불가", kind: "quota" },
        { label: "주기", value: "확인 불가", kind: "quota" }
      ],
      detail: usage.error
    };
  }

  return {
    id: "codex",
    name: "ChatGPT",
    source: "OpenAI",
    status: "live",
    plan: usage.planType ?? "로그인됨",
    session: formatSession(sessions?.codex),
    used: formatWindows(usage.weekly, usage.periodic, "used"),
    remaining: formatWindows(usage.weekly, usage.periodic, "remaining"),
    reset: formatResetWindows(usage.weekly, usage.periodic),
    fields: [
      ...(usage.account.detected ? [{ label: "계정", value: formatAccountAlias(usage.account), kind: "identity" as const }] : []),
      { label: "플랜", value: usage.planType ?? "로그인됨", kind: "plan" },
      { label: "주간", value: formatCodexWindowSummary(usage.weekly), kind: "quota", remainingPercent: usage.weekly?.remainingPercent ?? null },
      { label: "주기", value: formatCodexWindowSummary(usage.periodic), kind: "quota", remainingPercent: usage.periodic?.remainingPercent ?? null }
    ],
    detail: `최근 갱신 ${formatTime(usage.updatedAt)}`,
    needsAlias: usage.account.aliasRequired
  };
}

function buildClaudeProvider(usage: ClaudeUsageResult | null, sessions: CliSessionResult | null): ProviderUsage {
  const canLogin = isClaudeCliLoginMissing(sessions);
  const sessionLabel = formatSession(sessions?.claude);
  const planLabel = sessions?.claude.loggedIn ? "Claude 구독" : "확인 필요";

  if (usage == null) {
    return {
      id: "claude",
      name: "Claude",
      source: "Anthropic",
      status: "loading",
      plan: "확인 중",
      session: "확인 중",
      used: "확인 중",
      remaining: "확인 중",
      reset: "확인 중",
      fields: [
        { label: "플랜", value: "확인 중", kind: "plan" },
        { label: "주간", value: "확인 중", kind: "quota" },
        { label: "주기 (5시간)", value: "확인 중", kind: "quota" }
      ],
      detail: canLogin ? "Node.js/npm 설치 후 Claude Pro/Max 이상 계정으로 Claude CLI 설치와 로그인을 진행하세요." : "Claude Code Status Line 사용량을 확인하고 있습니다.",
      canLogin,
      actionLabel: "Claude CLI 설치 및 로그인"
    };
  }

  if (!usage.ok) {
    return {
      id: "claude",
      name: "Claude",
      source: "Anthropic",
      status: "error",
      plan: "확인 불가",
      session: formatSession(sessions?.claude),
      used: "확인 불가",
      remaining: "확인 불가",
      reset: "확인 불가",
      fields: [
        { label: "플랜", value: "확인 불가", kind: "plan" },
        { label: "주간", value: "확인 불가", kind: "quota" },
        { label: "주기 (5시간)", value: "확인 불가", kind: "quota" }
      ],
      detail: canLogin ? "Node.js/npm 설치 후 Claude Pro/Max 이상 계정으로 Claude CLI 설치와 로그인을 진행하세요." : usage.error,
      canLogin,
      actionLabel: "Claude CLI 설치 및 로그인",
      issues: canLogin ? undefined : [{
        reason: "Claude Status Line 사용량 대기",
        steps: [
          "Claude Code를 실행",
          "대화를 시작해 첫 응답 수신",
          "대시보드 새로고침"
        ]
      }]
    };
  }

  const usedLabel = formatClaudeStatusLineWindows(usage.sevenDay, usage.fiveHour, "used");
  const remainingLabel = formatClaudeStatusLineWindows(usage.sevenDay, usage.fiveHour, "remaining");
  const resetLabel = formatClaudeStatusLineResets(usage.sevenDay, usage.fiveHour);
  const modelLabel = usage.model?.displayName ?? usage.model?.id ?? null;
  const hasQuota = Boolean(usage.fiveHour || usage.sevenDay);
  const account = sessions?.claude.account;

  return {
    id: "claude",
    name: "Claude",
    source: "Anthropic",
    status: hasQuota ? "live" : "pending",
    plan: planLabel,
    session: sessionLabel,
    used: usedLabel,
    remaining: remainingLabel,
    reset: resetLabel,
    fields: [
      { label: "로그인", value: sessionLabel, kind: "session" },
      ...(account?.detected ? [{ label: "계정", value: formatAccountAlias(account), kind: "identity" as const }] : []),
      { label: "플랜", value: planLabel, kind: "plan" },
      { label: "주간", value: formatClaudeStatusLineWindowSummary(usage.sevenDay), kind: "quota", remainingPercent: usage.stale ? null : usage.sevenDay?.remainingPercent ?? null },
      { label: "주기 (5시간)", value: formatClaudeStatusLineWindowSummary(usage.fiveHour), kind: "quota", remainingPercent: usage.stale ? null : usage.fiveHour?.remainingPercent ?? null }
    ],
    detail: `${modelLabel ? `${modelLabel} / ` : ""}Status Line ${usage.stale ? "마지막 확인 정보" : "최근 갱신"} ${formatTime(usage.capturedAt)}`,
    canLogin,
    actionLabel: canLogin ? "Claude CLI 설치 및 로그인" : "Claude CLI 재연동",
    needsAlias: Boolean(account?.aliasRequired),
    issues: hasQuota ? undefined : [{
      reason: "Claude Status Line 사용량 대기",
      steps: [
        "Claude Code를 실행",
        "대화를 시작해 첫 응답 수신",
        "대시보드 새로고침"
      ]
    }]
  };
}

function buildGeminiProvider(usage: GeminiUsageResult | null): ProviderUsage {
  if (usage == null) {
    return {
      id: "gemini",
      name: "Gemini",
      source: "Google",
      status: "loading",
      plan: "확인 중",
      session: "확인 중",
      used: "확인 중",
      remaining: "확인 중",
      reset: "확인 중",
      fields: [
        { label: "플랜", value: "확인 중", kind: "plan" },
        { label: "Gemini 주간", value: "확인 중", kind: "quota" },
        { label: "Antigravity 주간", value: "확인 중", kind: "quota" },
        { label: "Gemini 주기", value: "확인 중", kind: "quota" },
        { label: "Antigravity 주기", value: "확인 중", kind: "quota" }
      ],
      detail: "Gemini Apps 한도와 Antigravity 5시간 한도 수집 상태를 확인하고 있습니다.",
      canLogin: true,
      actionLabel: "Antigravity CLI 설치 및 로그인"
    };
  }

  if (!usage.ok) {
    const planLabel = usage.geminiApps?.plan ?? "확인 필요";
    return {
      id: "gemini",
      name: "Gemini",
      source: "Google",
      status: "error",
      plan: planLabel,
      session: "CLI 확인 필요",
      used: "확인 불가",
      remaining: "확인 불가",
      reset: "확인 불가",
      fields: [
        ...(usage.account.detected ? [{ label: "계정", value: formatAccountAlias(usage.account), kind: "identity" as const }] : []),
        { label: "플랜", value: planLabel, kind: "plan" },
        { label: "Gemini 주간", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.weekly ?? null), kind: "quota", remainingPercent: parseRemainingPercent(usage.geminiApps?.weekly?.remaining ?? null) },
        { label: "Antigravity 주간", value: "명시적 주간 데이터 없음", kind: "quota" },
        { label: "Gemini 주기", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.fiveHour ?? null), kind: "quota", remainingPercent: parseRemainingPercent(usage.geminiApps?.fiveHour?.remaining ?? null) },
        { label: "Antigravity 주기", value: "남은 사용량 확인 불가 / 초기화 확인 불가", kind: "quota" }
      ],
      detail: usage.error,
      canLogin: true,
      actionLabel: "Antigravity CLI 설치 및 로그인",
      needsAlias: usage.account.aliasRequired,
      issues: buildGeminiIssues(usage.geminiApps, null)
    };
  }

  const antigravityFiveHourWindow = pickAntigravityFiveHourWindow(usage.models);
  const antigravityWeeklyWindow = pickAntigravityWeeklyWindow(usage.models);
  const sourceLabel = formatAntigravitySource(usage.source);
  const planLabel = usage.geminiApps?.plan ?? usage.planType ?? "확인 필요";
  const promptCredits = formatPromptCredits(usage.promptCredits);
  const quotaFields: ProviderField[] = [
    { label: "Gemini 주간", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.weekly ?? null), kind: "quota", remainingPercent: parseRemainingPercent(usage.geminiApps?.weekly?.remaining ?? null) },
    ...(antigravityWeeklyWindow ? [{ label: "Antigravity 주간", value: formatGeminiWindowSummary(antigravityWeeklyWindow), kind: "quota" as const, remainingPercent: antigravityWeeklyWindow.remainingPercent }] : []),
    { label: "Gemini 주기", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.fiveHour ?? null), kind: "quota", remainingPercent: parseRemainingPercent(usage.geminiApps?.fiveHour?.remaining ?? null) },
    { label: "Antigravity 주기", value: formatGeminiWindowSummary(antigravityFiveHourWindow), kind: "quota", remainingPercent: antigravityFiveHourWindow?.remainingPercent ?? null }
  ];

  return {
    id: "gemini",
    name: "Gemini",
    source: "Google",
    status: "live",
    plan: planLabel,
    session: sourceLabel,
    used: formatGeminiWindows(antigravityWeeklyWindow, antigravityFiveHourWindow, null, "used"),
    remaining: formatGeminiWindows(antigravityWeeklyWindow, antigravityFiveHourWindow, null, "remaining"),
    reset: formatGeminiResets(antigravityWeeklyWindow, antigravityFiveHourWindow, null),
    fields: [
      ...(usage.account.detected ? [{ label: "계정", value: formatAccountAlias(usage.account), kind: "identity" as const }] : []),
      { label: "플랜", value: planLabel, kind: "plan" },
      ...quotaFields
    ],
    detail: promptCredits ?? formatGeminiDetail(usage.geminiApps?.updatedAt ?? null, usage.geminiApps?.detail ?? null, sourceLabel, usage.updatedAt),
    needsAlias: usage.account.aliasRequired,
    issues: buildGeminiIssues(usage.geminiApps, antigravityFiveHourWindow)
  };
}

function formatGeminiDetail(geminiAppsUpdatedAt: string | null, parsedGeminiAppsDetail: string | null, antigravitySource: string, antigravityUpdatedAt: string) {
  const updateDetail = geminiAppsUpdatedAt ? `Gemini Apps 최근 갱신 ${formatTime(geminiAppsUpdatedAt)}` : "Gemini Apps Usage Limits 연동 필요";
  const parsedDetail = parsedGeminiAppsDetail ? ` / ${parsedGeminiAppsDetail}` : "";
  return `${updateDetail}${parsedDetail} / Antigravity ${antigravitySource} 기준 최근 갱신 ${formatTime(antigravityUpdatedAt)}`;
}

function buildGeminiIssues(geminiApps: GeminiAppsUsage | null, antigravityFiveHourWindow: GeminiUsageWindow | null): ProviderIssue[] {
  const issues: ProviderIssue[] = [];
  if (!geminiApps?.plan || !geminiApps.fiveHour || !geminiApps.weekly) {
    issues.push({
      reason: "Gemini 앱 사용량 확인 필요",
      steps: [
        "Gemini 로그인 버튼 실행",
        "로그인 완료 후 사용량 확인 버튼 실행",
        "gemini.google.com/usage 페이지에서 플랜, 5시간, 주간 한도 확인"
      ]
    });
  }

  if (!antigravityFiveHourWindow) {
    issues.push({
      reason: "Antigravity 사용량 연동 필요",
      steps: [
        "Node.js LTS 설치",
        "Antigravity CLI 설치 및 로그인 버튼 실행",
        "Google 인증 완료 후 대시보드 새로고침"
      ]
    });
  }

  return issues;
}

function formatAccountAlias(account: { detected: boolean; alias: string | null }) {
  if (!account.detected) {
    return "계정 확인 불가";
  }
  return account.alias ?? "별칭 미지정";
}

function formatAntigravitySource(source: Extract<GeminiUsageResult, { ok: true }>["source"]) {
  if (source === "antigravity-cli-google") {
    return "antigravity-usage Google";
  }
  if (source === "antigravity-cli-local") {
    return "antigravity-usage local";
  }
  if (source === "antigravity-local") {
    return "내장 local";
  }
  return "Gemini OAuth fallback";
}

function formatPromptCredits(credits: Extract<GeminiUsageResult, { ok: true }>["promptCredits"]) {
  if (!credits || credits.available == null || credits.monthly == null || credits.remainingPercent == null) {
    return null;
  }
  return `Prompt Credits ${formatNumber(credits.available)} / ${formatNumber(credits.monthly)} (${credits.remainingPercent}% 남음)`;
}

function isClaudeCliLoginMissing(sessions: CliSessionResult | null) {
  const session = sessions?.claude;
  return Boolean(session && (!session.installed || !session.loggedIn));
}

function makeCodexError(error: string): CodexUsageResult {
  return {
    ok: false,
    source: "codex-app-server",
    error,
    updatedAt: new Date().toISOString()
  };
}

function makeClaudeError(error: string): ClaudeUsageResult {
  return {
    ok: false,
    source: "claude-code-statusline",
    error,
    updatedAt: new Date().toISOString()
  };
}

function makeGeminiError(error: string): GeminiUsageResult {
  const account = { detected: false, alias: null, aliasRequired: false, accountChanged: false, confidence: null } as const;
  return {
    ok: false,
    source: "gemini-cli-oauth",
    error,
    account,
    geminiApps: null,
    geminiAppsSession: { loggedIn: false, checkedAt: null },
    updatedAt: new Date().toISOString()
  };
}

function formatSession(session: CliSessionResult["codex"] | undefined) {
  if (!session) {
    return "확인 중";
  }
  if (!session.installed) {
    return "CLI 없음";
  }
  if (!session.loggedIn) {
    return "로그아웃";
  }
  return "로그인됨";
}

function formatWindows(weekly: CodexUsageWindow | null, periodic: CodexUsageWindow | null, mode: "used" | "remaining") {
  const valueKey = mode === "used" ? "usedPercent" : "remainingPercent";
  const values = [
    weekly ? `주간 ${weekly[valueKey]}%` : null,
    periodic ? `${periodic.label} ${periodic[valueKey]}%` : null
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function formatResetWindows(weekly: CodexUsageWindow | null, periodic: CodexUsageWindow | null) {
  const values = [
    weekly?.resetsAt ? `주간 ${formatReset(weekly.resetsAt)}` : null,
    periodic?.resetsAt ? `${periodic.label} ${formatReset(periodic.resetsAt)}` : null
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function formatClaudeStatusLineWindows(weekly: ClaudeUsageWindow | null, periodic: ClaudeUsageWindow | null, mode: "used" | "remaining") {
  const key = mode === "used" ? "usedPercent" : "remainingPercent";
  const values = [
    weekly ? `주간 ${weekly[key]}%` : null,
    periodic ? `주기 (5시간) ${periodic[key]}%` : null
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function formatClaudeStatusLineResets(weekly: ClaudeUsageWindow | null, periodic: ClaudeUsageWindow | null) {
  const values = [
    weekly?.resetsAt ? `주간 ${formatReset(weekly.resetsAt)}` : null,
    periodic?.resetsAt ? `주기 (5시간) ${formatReset(periodic.resetsAt)}` : null
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function formatGeminiWindows(primary: GeminiUsageWindow | null, secondary: GeminiUsageWindow | null, tertiary: GeminiUsageWindow | null, mode: "used" | "remaining") {
  const key = mode === "used" ? "usedPercent" : "remainingPercent";
  const values = [
    primary ? `${primary.label} ${primary[key]}%` : null,
    secondary ? `${secondary.label} ${secondary[key]}%` : null,
    tertiary ? `${tertiary.label} ${tertiary[key]}%` : null
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function formatCodexWindowSummary(window: CodexUsageWindow | null) {
  if (!window) {
    return "남은 사용량 데이터 없음";
  }

  const reset = window.resetsAt ? formatReset(window.resetsAt) : "초기화 시간 없음";
  return `사용량 ${window.usedPercent}% / 잔여량 ${window.remainingPercent}% / 초기화 ${reset}`;
}

function formatClaudeStatusLineWindowSummary(window: ClaudeUsageWindow | null) {
  if (window) {
    const reset = window.resetsAt ? formatReset(window.resetsAt) : "초기화 시간 없음";
    return `사용량 ${window.usedPercent}% / 잔여량 ${window.remainingPercent}% / 초기화 ${reset}`;
  }

  return "Claude Code에서 대화를 시작하면 확인됩니다";
}

function formatGeminiWindowSummary(window: GeminiUsageWindow | null) {
  if (!window) {
    return "남은 사용량 데이터 없음";
  }

  const reset = window.resetsAt ? formatReset(window.resetsAt) : "초기화 시간 없음";
  return `사용량 ${window.usedPercent}% / 잔여량 ${window.remainingPercent}% / 초기화 ${reset}`;
}

function formatGeminiAppsWebUsageSummary(window: GeminiAppsUsageWindow | null) {
  if (!window) {
    return "남은 사용량 미연동 / 초기화 미연동";
  }

  const used = formatUsedFromRemaining(window.remaining);
  return `사용량 ${used ?? "확인 필요"} / 잔여량 ${window.remaining ?? "확인 필요"} / 초기화 ${window.reset ?? "확인 필요"}`;
}

function formatUsedFromRemaining(remaining: string | null) {
  const match = remaining?.match(/^([0-9]+(?:\.[0-9]+)?)%$/);
  if (!match) {
    return null;
  }
  return `${Math.max(0, Math.min(100, 100 - Number(match[1])))}%`;
}

function parseRemainingPercent(remaining: string | null | undefined) {
  const match = remaining?.match(/^([0-9]+(?:\.[0-9]+)?)%$/);
  return match ? Math.max(0, Math.min(100, Number(match[1]))) : null;
}

function pickAntigravityFiveHourWindow(models: GeminiQuotaModelView[]): GeminiUsageWindow | null {
  const candidates = models.filter((model) => {
    const text = `${model.modelId} ${model.label}`.toLowerCase();
    return !model.isAutocompleteOnly && !isWeeklyQuotaModel(model) && !text.includes("autocomplete");
  });
  return quotaModelToWindow("5시간 한도", pickMostConstrainedModel(candidates));
}

function pickAntigravityWeeklyWindow(models: GeminiQuotaModelView[]): GeminiUsageWindow | null {
  const candidates = models.filter((model) => !model.isAutocompleteOnly && isWeeklyQuotaModel(model));
  return quotaModelToWindow("주간 한도", pickMostConstrainedModel(candidates));
}

function isWeeklyQuotaModel(model: GeminiQuotaModelView) {
  const text = `${model.modelId} ${model.label}`.toLowerCase();
  return /\b(weekly|week|seven[-_\s]?day|7[-_\s]?day)\b|주간|7일/.test(text);
}

function pickMostConstrainedModel<T extends { remainingPercent: number }>(models: T[]) {
  return models.reduce<T | null>((current, model) => {
    if (!current || model.remainingPercent < current.remainingPercent) {
      return model;
    }
    return current;
  }, null);
}

function quotaModelToWindow(
  label: string,
  model: { modelId: string; usedPercent: number; remainingPercent: number; resetsAt: string | null } | null
): GeminiUsageWindow | null {
  if (!model) {
    return null;
  }
  return {
    label,
    modelId: model.modelId,
    usedPercent: model.usedPercent,
    remainingPercent: model.remainingPercent,
    resetsAt: model.resetsAt
  };
}

function formatGeminiResets(primary: GeminiUsageWindow | null, secondary: GeminiUsageWindow | null, tertiary: GeminiUsageWindow | null) {
  const values = [
    primary?.resetsAt ? `${primary.label} ${formatReset(primary.resetsAt)}` : null,
    secondary?.resetsAt ? `${secondary.label} ${formatReset(secondary.resetsAt)}` : null,
    tertiary?.resetsAt ? `${tertiary.label} ${formatReset(tertiary.resetsAt)}` : null
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function CodexPathSettings() {
  const [status, setStatus] = useState<CodexPathStatus | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void window.tokenMonitor?.getCodexPathStatus().then((next) => {
      if (!mountedRef.current) {
        return;
      }
      setStatus(next);
      setInput(next.configuredPath ?? "");
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function applyResult(
    result: CodexPathUpdateResult | undefined,
    successNotice: string,
    missingNotice: string
  ) {
    if (!mountedRef.current) {
      return;
    }
    if (!result) {
      setNotice(missingNotice);
      return;
    }
    if (result.canceled) {
      return;
    }
    setStatus(result.status);
    setInput(result.status.configuredPath ?? "");
    setNotice(result.ok ? successNotice : result.detail ?? result.status.detail);
  }

  async function withPending(run: () => Promise<void>) {
    setPending(true);
    setNotice(null);
    try {
      await run();
    } catch (error) {
      if (mountedRef.current) {
        setNotice(error instanceof Error ? error.message : "Codex 경로 작업을 완료하지 못했습니다.");
      }
    } finally {
      if (mountedRef.current) {
        setPending(false);
      }
    }
  }

  const saveNotice = "Codex 경로를 저장하고 연결을 확인했습니다.";

  return (
    <section className="setting-group codex-path-settings" aria-labelledby="codex-path-heading" aria-busy={pending}>
      <h2 id="codex-path-heading">Codex 실행 파일 경로</h2>
      <p className="codex-path-hint">
        Codex Desktop을 자동으로 찾지 못할 때 codex.exe 전체 경로를 지정합니다. 지정하지 않으면 자동 탐색과 <code>CODEX_CLI_PATH</code> 환경 변수를 사용합니다.
      </p>
      <dl className="developer-dl">
        <div>
          <dt>연결 상태</dt>
          <dd><span className={`codex-path-state ${status?.connection ?? "unchecked"}`}>{formatCodexPathConnection(status)}</span></dd>
        </div>
        <div>
          <dt>사용 중 경로</dt>
          <dd>{formatCodexPathForDisplay(status?.activePath)}</dd>
        </div>
        <div>
          <dt>탐색 방식</dt>
          <dd>{formatCodexPathSource(status?.source)}</dd>
        </div>
        <div>
          <dt>상세</dt>
          <dd>{status?.detail ?? "Codex 경로를 확인하지 못했습니다."}</dd>
        </div>
      </dl>
      <div className="codex-path-input-row">
        <input
          type="password"
          aria-label="codex.exe 전체 경로"
          autoComplete="off"
          placeholder="C:\\Users\\...\\codex.exe"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={pending}
        />
        <button
          className="secondary-button"
          type="button"
          disabled={pending}
          onClick={() =>
            void withPending(async () =>
              applyResult(
                await window.tokenMonitor?.selectCodexExecutablePath(),
                saveNotice,
                "Codex 경로 선택 기능을 사용할 수 없습니다."
              )
            )
          }
        >
          파일 선택
        </button>
      </div>
      <div className="codex-path-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={pending || !input.trim()}
          onClick={() =>
            void withPending(async () =>
              applyResult(
                await window.tokenMonitor?.updateCodexExecutablePath(input.trim()),
                saveNotice,
                "Codex 경로 설정 기능을 사용할 수 없습니다."
              )
            )
          }
        >
          {pending ? "확인 중" : "연결 테스트 및 저장"}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={pending}
          onClick={() =>
            void withPending(async () =>
              applyResult(
                await window.tokenMonitor?.resetCodexExecutablePath(),
                "Codex 경로를 자동 탐색으로 복원했습니다.",
                "Codex 자동 경로 설정을 사용할 수 없습니다."
              )
            )
          }
        >
          자동 탐색으로 복원
        </button>
      </div>
      <p className={`codex-path-notice${notice ? " visible" : ""}`} role="status" aria-live="polite">{notice}</p>
    </section>
  );
}

function formatCodexPathForDisplay(value: string | null | undefined) {
  if (!value) {
    return "확인되지 않음";
  }

  return value.replace(/^(.*?[\\/]Users[\\/])[^\\/]+/i, "$1***");
}

function formatCodexPathConnection(status: CodexPathStatus | null) {
  switch (status?.connection) {
    case "connected":
      return "연결됨";
    case "failed":
      return "실패";
    default:
      return "미확인";
  }
}

function formatCodexPathSource(source: CodexPathStatus["source"] | undefined) {
  switch (source) {
    case "manual":
      return "사용자 지정 경로";
    case "environment":
      return "CODEX_CLI_PATH 환경 변수";
    case "local-direct":
      return "로컬 설치 (기본 경로)";
    case "local-versioned":
      return "로컬 설치 (버전 폴더)";
    case "windows-apps":
      return "Windows Apps";
    case "mac-app":
      return "macOS ChatGPT 앱";
    case "homebrew":
      return "Homebrew";
    case "npm-global":
      return "npm 전역 설치";
    case "path":
      return "PATH 검색";
    default:
      return "확인되지 않음";
  }
}

function DeveloperPanel({
  diagnostics,
  isRefreshing,
  onRefresh
}: {
  diagnostics: DeveloperDiagnostics | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const environment = diagnostics?.environment;
  const cache = diagnostics?.cacheSummary;

  return (
    <section className="developer-panel" aria-label="개발자 모드" aria-busy={isRefreshing}>
      <div className="settings-heading">
        <div>
          <span className="eyebrow">Developer Mode</span>
          <h1>실제 수집 상태 검증</h1>
        </div>
        <button className="secondary-button" type="button" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? "확인 중" : "현재 상태 다시 확인"}
        </button>
      </div>

      <section className="developer-section">
        <h2>실행 환경</h2>
        <dl className="developer-dl">
          <div><dt>개발자 모드</dt><dd>{environment?.enabled ? "켜짐" : "꺼짐"}</dd></div>
          <div><dt>설정 출처</dt><dd>{formatDeveloperEnvSource(environment?.source)}</dd></div>
          <div><dt>환경 파일</dt><dd>{environment?.loadedFileName ?? "사용 안 함"}</dd></div>
          <div><dt>확인한 .env 후보</dt><dd>{environment?.checkedPathCount ?? 0}개</dd></div>
          <div><dt>진단 소요</dt><dd>{diagnostics?.totalDurationMs != null ? `${diagnostics.totalDurationMs}ms` : "미측정"}</dd></div>
          <div><dt>갱신 시각</dt><dd>{diagnostics?.generatedAt ? formatTime(diagnostics.generatedAt) : "없음"}</dd></div>
        </dl>
      </section>

      <section className="developer-section">
        <h2>수집 캐시</h2>
        <dl className="developer-dl">
          <div><dt>ChatGPT</dt><dd>{cache?.codex ?? "미확인"}</dd></div>
          <div><dt>Claude</dt><dd>{cache?.claude ?? "미확인"}</dd></div>
          <div><dt>Gemini</dt><dd>{cache?.gemini ?? "미확인"}</dd></div>
          <div><dt>CLI 로그인</dt><dd>{cache?.cliSession ?? "미확인"}</dd></div>
        </dl>
      </section>

      <section className="developer-section">
        <h2>Provider 진단</h2>
        {diagnostics && diagnostics.providers.length > 0 ? (
          <div className="developer-grid">
            {diagnostics.providers.map((provider) => (
              <article className="developer-card" key={provider.id}>
                <h3>{provider.name}</h3>
                <p className="developer-inline-note">계정: {formatDeveloperAccount(provider.account)}</p>
                <div className="developer-prereq">
                  <strong>필요 조건</strong>
                  <ul>
                    {provider.userPrerequisites.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="developer-check-list">
                  {provider.checks.map((check) => (
                    <div className="developer-check" key={`${provider.id}-${check.method}`}>
                      <span className={`developer-status ${check.status}`}>{formatDeveloperStatus(check.status)}</span>
                      <strong>{check.method}</strong>
                      <p>{check.detail}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="developer-inline-note">
            개발자 모드가 켜져 있으면 provider별 수집·로그인·파서 상태가 여기에 표시됩니다. 상단 버튼으로 다시 확인하세요.
          </p>
        )}
      </section>

      {diagnostics?.geminiParser ? (
        <section className="developer-section">
          <h2>Gemini Apps 파서</h2>
          <dl className="developer-dl">
            <div><dt>세션 로그인</dt><dd>{diagnostics.geminiParser.sessionLoggedIn ? "예" : "아니오"}</dd></div>
            <div><dt>캐시 보유</dt><dd>{diagnostics.geminiParser.cacheAvailable ? "예" : "아니오"}</dd></div>
            <div><dt>플랜 파싱</dt><dd>{diagnostics.geminiParser.planParsed ? "성공" : "실패"}</dd></div>
            <div><dt>5시간 파싱</dt><dd>{diagnostics.geminiParser.fiveHourParsed ? "성공" : "실패"}</dd></div>
            <div><dt>주간 파싱</dt><dd>{diagnostics.geminiParser.weeklyParsed ? "성공" : "실패"}</dd></div>
            <div><dt>파서 메모</dt><dd>{diagnostics.geminiParser.detail ?? "없음"}</dd></div>
            <div><dt>갱신 시각</dt><dd>{diagnostics.geminiParser.updatedAt ? formatTime(diagnostics.geminiParser.updatedAt) : "없음"}</dd></div>
          </dl>
        </section>
      ) : null}
    </section>
  );
}

function formatDeveloperStatus(status: "success" | "failed" | "skipped") {
  if (status === "success") {
    return "성공";
  }
  if (status === "failed") {
    return "실패";
  }
  return "건너뜀";
}

function formatDeveloperEnvSource(source: DeveloperDiagnostics["environment"]["source"] | undefined) {
  if (source === "process") {
    return "프로세스 환경변수";
  }
  if (source === "env-file") {
    return "로컬 .env 파일";
  }
  return "기본값";
}

function formatDeveloperAccount(account: DeveloperDiagnostics["providers"][number]["account"]) {
  if (!account || !account.detected) {
    return "감지되지 않음";
  }
  const parts = [account.alias ? `별칭 ${account.alias}` : "별칭 미지정"];
  if (account.confidence) {
    parts.push(account.confidence === "verified" ? "확인됨" : "추정");
  }
  return parts.join(" · ");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatReset(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isOverlayView() ? <OverlayApp /> : <App />}
  </React.StrictMode>
);

function isOverlayView() {
  const params = new URLSearchParams(window.location.search);
  return window.location.hash === "#overlay" || params.get("view") === "overlay";
}
