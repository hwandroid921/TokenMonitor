import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, LayoutDashboard, Link, RefreshCw, Settings } from "lucide-react";
import "./styles.css";
import type {
  AccountAliasView,
  AccountProvider,
  ClaudeUsageResult,
  ClaudeUsageWindow,
  CliSessionResult,
  CodexUsageResult,
  CodexUsageWindow,
  GeminiAppsUsage,
  GeminiAppsUsageWindow,
  GeminiUsageResult,
  GeminiUsageWindow,
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
  opacity: 50
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings">("dashboard");
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
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [accountAliases, setAccountAliases] = useState<AccountAliasView[]>([]);
  const [accountAliasNotice, setAccountAliasNotice] = useState<string | null>(null);

  const providers = useMemo(() => buildProviderUsage(codexUsage, claudeUsage, geminiUsage, cliSessions), [codexUsage, claudeUsage, geminiUsage, cliSessions]);

  async function refreshUsage() {
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
        window.tokenMonitor.getGeminiUsage(true),
        window.tokenMonitor.getCliSessionStatus()
      ]);
      setCodexUsage(latestCodex);
      setClaudeUsage(latestClaude);
      setGeminiUsage(latestGemini);
      setCliSessions(latestSessions);
      const successCount = [latestCodex, latestClaude, latestGemini].filter((result) => result.ok).length;
      setRefreshNotice(`${successCount}개 서비스 갱신 완료 · ${formatTime(new Date().toISOString())}`);
    } catch {
      setRefreshNotice("사용량 새로고침을 완료하지 못했습니다. 다시 시도하세요.");
    } finally {
      setIsRefreshing(false);
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
    const nextTab = activeTab === "dashboard" ? "settings" : "dashboard";
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

  useEffect(() => {
    void refreshUsage();
    void window.tokenMonitor?.getOverlaySettings().then(setOverlaySettings);
  }, []);

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
      void refreshUsage();
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
            <button className="icon-button" type="button" onClick={refreshUsage} disabled={isRefreshing} aria-busy={isRefreshing} aria-label="사용량 새로고침" title="사용량 새로고침">
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
        ) : (
          <div id="settings-panel" role="tabpanel" aria-labelledby="settings-tab">
            <SettingsPanel
              settings={overlaySettings}
              onChange={updateOverlaySettings}
              notice={settingsNotice}
              isSaving={isSettingsSaving}
              accounts={accountAliases}
              accountNotice={accountAliasNotice}
              onRenameAccount={handleRenameAccountAlias}
              onDeleteAccount={handleDeleteAccountAlias}
              onDeleteProviderAccounts={handleDeleteProviderAliases}
              onDeleteAllAccounts={handleDeleteAllAccountAliases}
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
        "Codex Desktop 설치 경로 또는 CODEX_CLI_PATH의 codex.exe 실행",
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
  notice,
  isSaving,
  accounts,
  accountNotice,
  onRenameAccount,
  onDeleteAccount,
  onDeleteProviderAccounts,
  onDeleteAllAccounts
}: {
  settings: OverlaySettings;
  onChange: (settings: OverlaySettings) => void;
  notice: string | null;
  isSaving: boolean;
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

      <label className="switch-row">
        <input type="checkbox" checked={settings.closeToTray} disabled={isSaving} onChange={(event) => update({ closeToTray: event.target.checked })} />
        <span>프로그램 종료 시 시스템 트레이로 최소화</span>
      </label>

      <p className={`settings-save-status${notice?.includes("못했습니다") ? " error" : ""}`} role="status" aria-live="polite" aria-busy={isSaving}>
        {notice ?? "변경한 설정은 자동으로 저장됩니다."}
      </p>

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
  const [fontScale, setFontScale] = useState(1);
  const contentRef = useRef<HTMLElement | null>(null);

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
    async function refresh() {
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
      setCodexUsage(latestCodex);
      setClaudeUsage(latestClaude);
      setGeminiUsage(latestGemini);
      setCliSessions(latestSessions);
    }

    void refresh();
    const unsubscribe = window.tokenMonitor?.onUsageRefreshRequested(() => {
      void refresh();
    });
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      unsubscribe?.();
      window.clearInterval(timer);
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
        const maximumContentHeight = Math.max(100, Math.floor(window.screen.availHeight / 3) - 20);
        const nextScale = Math.max(0.35, Math.min(1, fontScale * (maximumContentHeight / content.scrollHeight)));
        if (Math.abs(nextScale - fontScale) > 0.01) {
          setFontScale(nextScale);
          return;
        }
        void window.tokenMonitor?.resizeOverlay({ width: 620, height: content.scrollHeight + 20 });
      });
    };

    const observer = new ResizeObserver(resize);
    observer.observe(content);
    resize();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [providers, fontScale]);

  return (
    <main
      className="overlay-root"
      ref={contentRef}
      style={{
        "--overlay-heading-size": `${Math.round(56 * fontScale)}px`,
        "--overlay-detail-size": `${Math.round(48 * fontScale)}px`
      } as React.CSSProperties}
    >
      <section className="overlay-card">
        <div className="overlay-provider-list">
          {providers.length === 0 ? (
            <p className="overlay-muted">표시할 서비스 없음</p>
          ) : (
            providers.map((provider) => <OverlayProvider key={provider.id} provider={provider} settings={settings} />)
          )}
        </div>
      </section>
    </main>
  );
}

function OverlayProvider({ provider, settings }: { provider: ProviderUsage; settings: OverlaySettings }) {
  const display = getProviderDisplay(settings, provider.id);
  const fields = filterProviderFields(provider.fields ?? defaultProviderFields(provider), display);
  const planField = fields.find((field) => field.kind === "plan");
  const detailFields = fields.filter((field) => field !== planField);
  const heading = display.showPlan && planField?.value ? `${provider.name.toUpperCase()} / ${formatOverlayValue(planField.value)}` : provider.name.toUpperCase();

  return (
    <article className="overlay-provider">
      <strong>{heading}</strong>
      {detailFields.map((field) => (
        <span key={field.label}>{field.label} {formatOverlayValue(formatFieldValueForDisplay(field, display))}</span>
      ))}
    </article>
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
      { label: "주간", value: formatCodexWindowSummary(usage.weekly), kind: "quota" },
      { label: "주기", value: formatCodexWindowSummary(usage.periodic), kind: "quota" }
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
      { label: "주간", value: formatClaudeStatusLineWindowSummary(usage.sevenDay), kind: "quota" },
      { label: "주기 (5시간)", value: formatClaudeStatusLineWindowSummary(usage.fiveHour), kind: "quota" }
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
        { label: "Gemini 주간", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.weekly ?? null), kind: "quota" },
        { label: "Antigravity 주간", value: "명시적 주간 데이터 없음", kind: "quota" },
        { label: "Gemini 주기", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.fiveHour ?? null), kind: "quota" },
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
    { label: "Gemini 주간", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.weekly ?? null), kind: "quota" },
    ...(antigravityWeeklyWindow ? [{ label: "Antigravity 주간", value: formatGeminiWindowSummary(antigravityWeeklyWindow), kind: "quota" as const }] : []),
    { label: "Gemini 주기", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.fiveHour ?? null), kind: "quota" },
    { label: "Antigravity 주기", value: formatGeminiWindowSummary(antigravityFiveHourWindow), kind: "quota" }
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
