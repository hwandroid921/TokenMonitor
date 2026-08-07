import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bug, ExternalLink, LayoutDashboard, Link, RefreshCw, Settings, Zap } from "lucide-react";
import "./styles.css";
import type {
  ClaudeOAuthWindow,
  ClaudeUsageResult,
  CliSessionResult,
  CodexPathStatus,
  CodexUsageResult,
  CodexUsageWindow,
  DeveloperDiagnostics,
  DeveloperModeInfo,
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
  account?: string;
  plan: string;
  session: string;
  used: string;
  remaining: string;
  reset: string;
  detail: string;
  canLogin?: boolean;
  canConfigureCodex?: boolean;
  actionLabel?: string;
  issues?: ProviderIssue[];
};

type ProviderField = {
  label: string;
  value: string;
  kind: "account" | "plan" | "session" | "quota" | "usage" | "remaining" | "reset";
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
  opacity: 78
};

const claudeLoginPollIntervalMs = 2500;
const claudeLoginPollTimeoutMs = 30_000;
const geminiUsagePollIntervalMs = 2500;
const geminiUsagePollTimeoutMs = 60_000;

function App() {
  const geminiPanelRef = useRef<HTMLDivElement | null>(null);
  const [codexUsage, setCodexUsage] = useState<CodexUsageResult | null>(null);
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsageResult | null>(null);
  const [geminiUsage, setGeminiUsage] = useState<GeminiUsageResult | null>(null);
  const [cliSessions, setCliSessions] = useState<CliSessionResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(defaultOverlaySettings);
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings" | "developer">("dashboard");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isClaudeLoginPending, setIsClaudeLoginPending] = useState(false);
  const [isGeminiLoginPending, setIsGeminiLoginPending] = useState(false);
  const [isGeminiAppsLoginPending, setIsGeminiAppsLoginPending] = useState(false);
  const [isGeminiUsageCheckBlocking, setIsGeminiUsageCheckBlocking] = useState(false);
  const [isGeminiPanelOpen, setIsGeminiPanelOpen] = useState(false);
  const [claudeLoginNotice, setClaudeLoginNotice] = useState<string | null>(null);
  const [geminiLoginNotice, setGeminiLoginNotice] = useState<string | null>(null);
  const [geminiAppsLoginNotice, setGeminiAppsLoginNotice] = useState<string | null>(null);
  const [developerMode, setDeveloperMode] = useState<DeveloperModeInfo>({ enabled: false });
  const [developerDiagnostics, setDeveloperDiagnostics] = useState<DeveloperDiagnostics | null>(null);

  const providers = useMemo(() => buildProviderUsage(codexUsage, claudeUsage, geminiUsage, cliSessions), [codexUsage, claudeUsage, geminiUsage, cliSessions]);

  async function refreshUsage() {
    setIsRefreshing(true);
    try {
      if (!window.tokenMonitor?.getCodexUsage || !window.tokenMonitor?.getClaudeUsage || !window.tokenMonitor?.getGeminiUsage || !window.tokenMonitor?.getCliSessionStatus) {
        setCodexUsage(makeCodexError("데스크탑 앱 연결을 확인할 수 없습니다."));
        setClaudeUsage(makeClaudeError("데스크탑 앱 연결을 확인할 수 없습니다."));
        setGeminiUsage(makeGeminiError("데스크탑 앱 연결을 확인할 수 없습니다."));
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
      if (developerMode.enabled) {
        const diagnostics = await window.tokenMonitor?.getDeveloperDiagnostics();
        setDeveloperDiagnostics(diagnostics ?? null);
      }
    } finally {
      setIsRefreshing(false);
    }
  }

  function openCodexPathSettings() {
    setActiveTab("settings");
    window.setTimeout(() => {
      document.getElementById("codex-path-settings")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("codex-path-input")?.focus();
    }, 0);
  }

  async function updateOverlaySettings(nextSettings: OverlaySettings) {
    setOverlaySettings(nextSettings);

    if (!window.tokenMonitor?.updateOverlaySettings) {
      return;
    }

    const saved = await window.tokenMonitor.updateOverlaySettings(nextSettings);
    setOverlaySettings(saved);
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
        setIsGeminiAppsLoginPending(false);
        setIsGeminiAppsLoginPending(false);
        setIsGeminiPanelOpen(false);
        return;
      }

      if (startResult.skipped) {
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
    } catch {
      setClaudeLoginNotice("Claude 연동 확인을 시작할 수 없습니다.");
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
    } catch {
      setGeminiLoginNotice("Antigravity CLI 설치 및 로그인을 시작할 수 없습니다.");
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
    } catch {
      setGeminiAppsLoginNotice("Gemini 작업을 시작할 수 없습니다.");
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
    void window.tokenMonitor?.getDeveloperMode().then((mode) => {
      setDeveloperMode(mode);
      if (mode.enabled) {
        void window.tokenMonitor?.getDeveloperDiagnostics().then(setDeveloperDiagnostics);
      }
    });
  }, []);

  useEffect(() => {
    if (!developerMode.enabled && activeTab === "developer") {
      setActiveTab("dashboard");
    }
  }, [activeTab, developerMode.enabled]);

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

  return (
    <main className="app-root">
      <section className="main-panel">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">
              <Zap size={19} aria-hidden="true" />
            </span>
            <div>
              <strong>Token Monitor</strong>
              <span>플랜, 잔여 사용량, 초기화 시간</span>
            </div>
          </div>

          <div className="header-actions">
            <button className="icon-button" type="button" onClick={refreshUsage} aria-label="사용량 새로고침" title="사용량 새로고침">
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

        <nav className="tab-bar" aria-label="화면 전환">
          <button className={activeTab === "dashboard" ? "active" : ""} type="button" onClick={() => setActiveTab("dashboard")}>
            <LayoutDashboard size={16} aria-hidden="true" />
            사용량 대시보드
          </button>
          <button className={activeTab === "settings" ? "active" : ""} type="button" onClick={() => setActiveTab("settings")}>
            <Settings size={16} aria-hidden="true" />
            설정
          </button>
          {developerMode.enabled ? (
            <button className={activeTab === "developer" ? "active" : ""} type="button" onClick={() => setActiveTab("developer")}>
              <Bug size={16} aria-hidden="true" />
              개발자
            </button>
          ) : null}
        </nav>

        {activeTab === "dashboard" ? (
          <>
          <section className="provider-grid" aria-label="서비스별 사용량">
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
                onOpenCodexSettings={openCodexPathSettings}
              />
            ))}
          </section>
          </>
        ) : activeTab === "settings" ? (
          <SettingsPanel settings={overlaySettings} onChange={updateOverlaySettings} onUsageRefresh={refreshUsage} />
        ) : (
          <DeveloperPanel
            providers={providers}
            diagnostics={developerDiagnostics}
            isRefreshing={isRefreshing}
            onRefresh={() => void refreshUsage()}
          />
        )}
      </section>

      {isGeminiPanelOpen ? (
        <section className="gemini-browser-panel" aria-label="Gemini 브라우저">
          <div className="gemini-browser-panel-header">
            <strong>{geminiUsage?.geminiAppsSession.loggedIn ? "Gemini 사용량 확인" : "Gemini 로그인"}</strong>
            <button
              className="provider-secondary-action"
              type="button"
              onClick={() => {
                setIsGeminiPanelOpen(false);
                setIsGeminiUsageCheckBlocking(false);
                setIsGeminiAppsLoginPending(false);
                void window.tokenMonitor?.closeGeminiView();
              }}
            >
              닫기
            </button>
          </div>
          <div ref={geminiPanelRef} className="gemini-browser-view-host" />
        </section>
      ) : null}

      {showExitConfirm ? (
        <div className="app-dialog-backdrop" role="presentation">
          <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-dialog-title">
            <h2 id="exit-dialog-title">프로그램 종료</h2>
            <p>지금 종료하면 Token Monitor와 오버레이가 모두 종료됩니다.</p>
            <div className="app-dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setShowExitConfirm(false)}>
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
  onOpenCodexSettings
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
  onOpenCodexSettings: () => void;
}) {
  const isActionPending = provider.id === "claude" && isClaudeLoginPending || provider.id === "gemini" && isGeminiLoginPending;
  const actionLabel = isActionPending ? "연동 확인 중" : (provider.actionLabel ?? "사용량 수집 연동");
  const isGeminiAppsLoggedIn = provider.id === "gemini" && Boolean(geminiUsage?.geminiAppsSession.loggedIn);
  const geminiAppsActionLabel = isGeminiAppsLoginPending
    ? isGeminiAppsLoggedIn ? "사용량 확인 중" : "Gemini 로그인 확인 중"
    : isGeminiAppsLoggedIn ? "사용량 확인" : "Gemini 로그인";
  const handleAction = provider.id === "gemini" ? onGeminiLogin : onClaudeLogin;
  const showHeaderActions = Boolean(provider.canLogin || provider.canConfigureCodex || provider.id === "gemini");
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
        {showHeaderActions ? (
          <div className="provider-header-actions">
            {provider.canConfigureCodex ? (
              <button
                className="provider-action provider-header-action"
                type="button"
                onClick={onOpenCodexSettings}
                aria-label="Codex 경로 설정"
                title="Codex 경로 설정"
              >
                <Settings size={15} aria-hidden="true" />
                <span>경로 설정</span>
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
      </div>

      <dl className="usage-fields">
        {(provider.fields ?? defaultProviderFields(provider)).map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>

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
    </article>
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
        <section className="provider-issue" key={issue.reason}>
          <div className="provider-issue-heading">
            <span>필요한 조치</span>
            <strong>{issue.reason}</strong>
          </div>
          <ol>
            {issue.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function getProviderIssues(provider: ProviderUsage): ProviderIssue[] {
  if (provider.id === "codex" && provider.status !== "error") {
    return [];
  }
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
        "실행 파일을 찾지 못하면 설정 탭에서 Codex 경로 확인"
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

function getProviderIssue(provider: ProviderUsage) {
  const hasUnavailableField = (provider.fields ?? defaultProviderFields(provider)).some((field) => /확인 불가|확인 필요|미연동|연동 필요/.test(field.value));
  if (provider.status !== "error" && !hasUnavailableField) {
    return null;
  }

  if (provider.id === "codex") {
    return {
      reason: "ChatGPT 로그인 필요",
      steps: [
        "Codex Desktop 설치",
        "Codex Desktop 로그인",
        "실행 파일을 찾지 못하면 설정 탭에서 Codex 경로 확인"
      ]
    };
  }

  if (provider.id === "claude") {
    return {
      reason: "Claude CLI 로그인 필요",
      steps: [
        "Node.js LTS 설치",
        "Claude Pro/Max 이상 계정 준비",
        "Claude CLI 설치 및 로그인 버튼 실행",
        "브라우저 인증 완료"
      ]
    };
  }

  return {
    reason: "Gemini 또는 Antigravity 로그인 필요",
    steps: [
      "Gemini 로그인 버튼 실행",
      "로그인 완료 후 사용량 확인 버튼 실행",
      "Antigravity 한도가 필요하면 Node.js LTS 설치",
      "Antigravity CLI 설치 및 로그인 버튼 실행"
    ]
  };

  if (provider.id === "codex") {
    return {
      reason: "ChatGPT 연결 확인 필요",
      steps: [
        "Codex Desktop 설치 확인",
        "Codex Desktop 로그인 완료",
        "codex.exe 경로 확인",
        "필요 시 설정 탭에서 Codex 경로 지정"
      ]
    };
  }

  if (provider.id === "claude") {
    return {
      reason: "Claude OAuth 연동 필요",
      steps: [
        "Node.js LTS 설치 확인",
        "Claude Pro/Max 이상 계정 확인",
        "Claude CLI 설치 및 로그인 버튼 실행",
        "브라우저 인증 완료",
        "대시보드 새로고침"
      ]
    };
  }

  return {
    reason: "Google 사용량 수집 확인 필요",
    steps: [
      "대시보드 새로고침",
      "Gemini Apps 한도는 gemini.google.com Usage Limits에서 확인",
      "Node.js LTS 설치 확인",
      "Antigravity CLI 설치 및 로그인 버튼 실행",
      "Antigravity 실행 또는 Google 로그인 완료"
    ]
  };
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
  return Boolean(cliSessions.claude.loggedIn && claudeUsage.ok && claudeUsage.oauth);
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
    return `30초 안에 Claude 사용량 연동이 확인되지 않았습니다. Claude Pro/Max 이상 계정인지 확인하세요. ${claudeUsage?.error ?? "Claude OAuth 사용량 응답을 찾을 수 없습니다."}`;
  }
  if (!claudeUsage.oauth) {
    return "30초 안에 Claude OAuth 사용량 응답을 찾을 수 없습니다. Claude Pro/Max 이상 계정으로 브라우저 로그인 완료 후 다시 새로고침하세요.";
  }
  return "30초 안에 Claude 연동 완료를 확인하지 못했습니다. 브라우저 인증을 마친 뒤 다시 시도하세요.";
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
    { label: "로그인", value: provider.session, kind: "session" },
    { label: "플랜", value: provider.plan, kind: "plan" },
    { label: "잔여 사용량", value: provider.remaining, kind: "remaining" },
    { label: "초기화", value: provider.reset, kind: "reset" }
  ];
}

function SettingsPanel({
  settings,
  onChange,
  onUsageRefresh
}: {
  settings: OverlaySettings;
  onChange: (settings: OverlaySettings) => void;
  onUsageRefresh: () => Promise<void>;
}) {
  const [codexPathStatus, setCodexPathStatus] = useState<CodexPathStatus | null>(null);
  const [codexPathInput, setCodexPathInput] = useState("");
  const [codexPathPending, setCodexPathPending] = useState(false);
  const [codexPathNotice, setCodexPathNotice] = useState<string | null>(null);

  useEffect(() => {
    void window.tokenMonitor?.getCodexPathStatus().then((status) => {
      setCodexPathStatus(status);
      setCodexPathInput(status.configuredPath ?? status.activePath ?? "");
    });
  }, []);

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

  async function applyCodexPath(candidate: string) {
    if (!candidate.trim()) {
      setCodexPathNotice("codex.exe 전체 경로를 입력해 주세요.");
      return;
    }
    setCodexPathPending(true);
    setCodexPathNotice(null);
    try {
      const result = await window.tokenMonitor?.updateCodexExecutablePath(candidate);
      if (!result) {
        setCodexPathNotice("Codex 경로 설정 기능을 사용할 수 없습니다.");
        return;
      }
      setCodexPathStatus(result.status);
      setCodexPathInput(result.status.configuredPath ?? result.status.activePath ?? candidate);
      setCodexPathNotice(result.ok ? "Codex 경로를 저장하고 연결을 확인했습니다." : result.detail ?? result.status.detail);
      if (result.ok) {
        await onUsageRefresh();
      }
    } finally {
      setCodexPathPending(false);
    }
  }

  async function selectCodexPath() {
    setCodexPathPending(true);
    setCodexPathNotice(null);
    try {
      const result = await window.tokenMonitor?.selectCodexExecutablePath();
      if (!result || result.canceled) {
        return;
      }
      setCodexPathStatus(result.status);
      setCodexPathInput(result.status.configuredPath ?? result.status.activePath ?? "");
      setCodexPathNotice(result.ok ? "Codex 경로를 저장하고 연결을 확인했습니다." : result.detail ?? result.status.detail);
      if (result.ok) {
        await onUsageRefresh();
      }
    } finally {
      setCodexPathPending(false);
    }
  }

  async function resetCodexPath() {
    setCodexPathPending(true);
    setCodexPathNotice(null);
    try {
      const result = await window.tokenMonitor?.resetCodexExecutablePath();
      if (!result) {
        setCodexPathNotice("Codex 자동 경로 설정을 사용할 수 없습니다.");
        return;
      }
      setCodexPathStatus(result.status);
      setCodexPathInput(result.status.activePath ?? "");
      setCodexPathNotice(result.ok ? "Codex 경로를 자동 탐색으로 복원했습니다." : result.detail ?? result.status.detail);
      await onUsageRefresh();
    } finally {
      setCodexPathPending(false);
    }
  }

  return (
    <section className="settings-panel" aria-label="설정">
      <div className="settings-heading">
        <div>
          <span className="eyebrow">기본 설정</span>
          <h1>연결과 표시 설정</h1>
        </div>
        <Settings size={20} aria-hidden="true" />
      </div>

      <label className="switch-row">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
        <span>오버레이 켜기</span>
      </label>

      <label className="switch-row">
        <input type="checkbox" checked={settings.closeToTray} onChange={(event) => update({ closeToTray: event.target.checked })} />
        <span>프로그램 종료 시 시스템 트레이로 최소화</span>
      </label>

      <section className="setting-group">
        <h2>모델별 오버레이 표시</h2>
        <div className="provider-settings-list">
          {(Object.keys(providerLabels) as ProviderId[]).map((id) => {
            const item = settings.providerItems[id];
            return (
              <article className="provider-settings" key={id}>
                <label className="switch-row provider-toggle">
                  <input type="checkbox" checked={item.enabled} onChange={(event) => updateProviderItem(id, { enabled: event.target.checked })} />
                  <span>{providerLabels[id]}</span>
                </label>

                <div className="check-list compact">
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

                {id === "codex" ? (
                  <section className="codex-path-settings" id="codex-path-settings" aria-labelledby="codex-path-heading">
                    <div className="setting-group-heading">
                      <div>
                        <h3 id="codex-path-heading">Codex 연결</h3>
                        <p>ChatGPT 사용량 확인을 위한 Codex 실행 파일을 연결합니다.</p>
                      </div>
                      <span className={`codex-path-state ${codexPathStatus?.connection ?? "unchecked"}`}>
                        {formatCodexPathConnection(codexPathStatus)}
                      </span>
                    </div>

                    <dl className="codex-path-summary">
                      <div>
                        <dt>연결 상태</dt>
                        <dd>{formatCodexConnectionDetail(codexPathStatus)}</dd>
                      </div>
                    </dl>

                    <label className="codex-path-field" htmlFor="codex-path-input">
                      <span>codex.exe 경로</span>
                      <div>
                        <input
                          id="codex-path-input"
                          type="text"
                          value={codexPathInput}
                          onChange={(event) => setCodexPathInput(event.target.value)}
                          placeholder={"C:\\...\\codex.exe"}
                          spellCheck={false}
                          disabled={codexPathPending}
                        />
                        <button className="secondary-button" type="button" onClick={() => void selectCodexPath()} disabled={codexPathPending}>
                          찾아보기
                        </button>
                      </div>
                    </label>

                    <div className="codex-path-actions">
                      <button className="secondary-button" type="button" onClick={() => void applyCodexPath(codexPathInput)} disabled={codexPathPending}>
                        {codexPathPending ? "확인 중" : "연결 테스트 및 저장"}
                      </button>
                      <button className="secondary-button" type="button" onClick={() => void resetCodexPath()} disabled={codexPathPending}>
                        자동 설정으로 복원
                      </button>
                    </div>
                    {codexPathNotice ? <p className="codex-path-notice" role="status">{codexPathNotice}</p> : null}
                  </section>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <label className="opacity-control">
        <span>투명도</span>
        <input type="range" min="35" max="95" value={settings.opacity} onChange={(event) => update({ opacity: Number(event.target.value) })} />
        <strong>{settings.opacity}%</strong>
      </label>
    </section>
  );
}

function formatCodexPathConnection(status: CodexPathStatus | null) {
  if (!status) return "확인 중";
  if (status.connection === "connected") return "연결됨";
  return "연결 필요";
}

function formatCodexConnectionDetail(status: CodexPathStatus | null) {
  if (!status) return "연결 상태를 확인하고 있습니다.";
  if (status.connection === "connected") return status.detail || "Codex에 연결되었습니다.";
  return "ChatGPT 사용량을 확인하려면 Codex 연결이 필요합니다.";
}

function DeveloperPanel({
  providers,
  diagnostics,
  isRefreshing,
  onRefresh
}: {
  providers: ProviderUsage[];
  diagnostics: DeveloperDiagnostics | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="developer-panel" aria-label="개발자 모드">
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
        <h2>개발 환경 상태</h2>
        <DeveloperEnvironmentStatus diagnostics={diagnostics} />
      </section>

      <section className="developer-section">
        <h2>Codex 오류 및 권장 해결</h2>
        <CodexDiagnosticIssues diagnostics={diagnostics} />
      </section>

      <section className="developer-section">
        <h2>현재 대시보드 상태</h2>
        <div className="developer-grid">
          {providers.map((provider) => (
            <article className="developer-card" key={provider.id}>
              <h3>{provider.name}</h3>
              <DeveloperDashboardSummary provider={provider} />
            </article>
          ))}
        </div>
      </section>

      <section className="developer-section">
        <h2>개발 테스트 결과</h2>
        <div className="developer-grid">
          {(diagnostics?.providers ?? []).map((provider) => {
            const dashboardProvider = providers.find((item) => item.id === provider.id);
            return (
              <article className="developer-card" key={provider.id}>
                <h3>{provider.name}</h3>
                <DeveloperTestLoginSummary provider={dashboardProvider} diagnostic={provider} />
                <div className="developer-check-list">
                  {provider.checks.map((check) => (
                    <div className="developer-check" key={`${provider.id}-${check.method}`}>
                      <span className={`developer-status ${check.status}`}>{formatDeveloperStatus(check.status)}</span>
                      <strong>{check.method}</strong>
                      <p>{formatDeveloperCheckDetail(check)}</p>
                    </div>
                  ))}
                </div>
                {provider.id === "gemini" ? <GeminiParserDiagnostics diagnostics={diagnostics} /> : null}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function CodexDiagnosticIssues({ diagnostics }: { diagnostics: DeveloperDiagnostics | null }) {
  const issues = diagnostics?.codexIssues ?? [];
  if (issues.length === 0) {
    return <article className="developer-card"><p className="developer-inline-note">현재 실행에서 기록된 Codex 오류가 없습니다.</p></article>;
  }

  return (
    <div className="developer-issue-list">
      {issues.map((issue) => (
        <article className={`developer-card developer-issue-card ${issue.resolvedAt ? "resolved" : "active"}`} key={issue.code}>
          <div className="developer-issue-heading">
            <span>{String(issue.order).padStart(2, "0")}</span>
            <div>
              <h3>{issue.title}</h3>
              <p>{issue.resolvedAt ? "해결됨" : "해결 필요"} · {issue.count}회 · 최근 {formatTime(issue.lastOccurredAt)}</p>
            </div>
          </div>
          <p>{issue.detail}</p>
          <strong>권장 해결</strong>
          <ol>
            {issue.resolution.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </article>
      ))}
    </div>
  );
}

function DeveloperEnvironmentStatus({ diagnostics }: { diagnostics: DeveloperDiagnostics | null }) {
  const environment = diagnostics?.environment;
  const cache = diagnostics?.cacheSummary;

  return (
    <article className="developer-card developer-environment-card">
      <section className="developer-environment-group" aria-labelledby="developer-runtime-heading">
        <h3 id="developer-runtime-heading">실행 설정</h3>
        <dl className="developer-dl developer-environment-list">
          <div>
            <dt>개발자 모드</dt>
            <dd>
              <strong>{environment?.enabled ? "켜짐" : "꺼짐"}</strong>
              <span>`TOKEN_MONITOR_DEV_MODE=1` 적용 여부입니다. 켜짐 상태에서만 이 탭과 provider 진단을 제공합니다.</span>
            </dd>
          </div>
          <div>
            <dt>설정 출처</dt>
            <dd>
              <strong>{formatDeveloperEnvSource(environment?.source)}</strong>
              <span>프로세스 환경변수, 로컬 `.env`, 또는 설정을 찾지 못한 기본값 중 실제 적용된 경로입니다.</span>
            </dd>
          </div>
          <div>
            <dt>환경 파일</dt>
            <dd>
              <strong>{environment?.loadedFileName ?? "사용 안 함"}</strong>
              <span>환경 파일에서 설정을 읽은 경우 파일명만 표시합니다. 전체 로컬 경로와 파일 내용은 표시하지 않습니다.</span>
            </dd>
          </div>
          <div>
            <dt>확인 후보</dt>
            <dd>
              <strong>{environment?.checkedPathCount ?? 0}개</strong>
              <span>현재 작업 폴더, 실행 파일 주변, portable 원본 폴더 등에서 중복 제거 후 확인한 `.env` 후보 수입니다.</span>
            </dd>
          </div>
          <div>
            <dt>진단 소요</dt>
            <dd>
              <strong>{diagnostics?.totalDurationMs != null ? `${diagnostics.totalDurationMs}ms` : "미측정"}</strong>
              <span>새로고침 요청부터 provider 사용량·로그인 상태·파서 진단을 모아 결과를 만든 시점까지 걸린 시간입니다.</span>
            </dd>
          </div>
          <div>
            <dt>갱신 시각</dt>
            <dd>
              <strong>{diagnostics?.generatedAt ? formatTime(diagnostics.generatedAt) : "없음"}</strong>
              <span>현재 화면에 표시된 개발 진단 스냅샷이 완성된 로컬 시각입니다.</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="developer-environment-group" aria-labelledby="developer-cache-heading">
        <h3 id="developer-cache-heading">수집 캐시</h3>
        <p className="developer-environment-intro">
          최신은 재사용 가능한 유효 캐시, 만료는 다음 조회에서 다시 수집할 캐시, 비어 있음은 저장된 결과가 없는 상태입니다.
        </p>
        <dl className="developer-dl developer-environment-list">
          <DeveloperCacheRow label="ChatGPT" value={cache?.codex} ttlSeconds={15} detail="Codex app-server 사용량 결과" />
          <DeveloperCacheRow label="Claude" value={cache?.claude} ttlSeconds={15} detail="Claude OAuth 및 로컬 사용량 결과" />
          <DeveloperCacheRow label="Gemini" value={cache?.gemini} ttlSeconds={15} detail="Gemini Apps 및 Antigravity 사용량 결과" />
          <DeveloperCacheRow label="CLI 로그인" value={cache?.cliSession} ttlSeconds={60} detail="Codex·Claude CLI 설치 및 로그인 확인 결과" />
        </dl>
      </section>
    </article>
  );
}

function DeveloperCacheRow({ label, value, ttlSeconds, detail }: { label: string; value: string | undefined; ttlSeconds: number; detail: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <strong>{formatDeveloperCacheState(value, ttlSeconds)}</strong>
        <span>{detail}이며 유효기간은 {ttlSeconds}초입니다.</span>
      </dd>
    </div>
  );
}

function formatDeveloperCacheState(value: string | undefined, ttlSeconds: number) {
  if (!value || value === "empty") {
    return "비어 있음";
  }

  const match = value.match(/^(fresh|stale) (\d+)ms$/);
  if (!match) {
    return "상태 확인 불가";
  }

  const ageMs = Number(match[2]);
  const age = ageMs >= 1_000 ? `${(ageMs / 1_000).toFixed(1)}초 경과` : `${ageMs}ms 경과`;
  return match[1] === "fresh" ? `최신 · ${age}` : `만료 · ${age} / 기준 ${ttlSeconds}초`;
}

function DeveloperDashboardSummary({ provider }: { provider: ProviderUsage }) {
  const fields = normalizeDeveloperDashboardFields(provider);

  return (
    <dl className="developer-provider-summary developer-dashboard-summary">
      {fields.map((field) => (
        <div key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DeveloperTestLoginSummary({
  provider,
  diagnostic
}: {
  provider: ProviderUsage | undefined;
  diagnostic: DeveloperDiagnostics["providers"][number];
}) {
  if (!provider) {
    return null;
  }

  const account = diagnostic.account;

  return (
    <dl className="developer-provider-summary">
      <div><dt>로그인</dt><dd>{account?.email ?? formatDeveloperLoginIdentity(provider)}</dd></div>
      <div><dt>이름</dt><dd>{account?.name ?? "미제공"}</dd></div>
      <div><dt>닉네임</dt><dd>{account?.nickname ?? "미제공"}</dd></div>
      <div><dt>이메일</dt><dd>{account?.email ?? "미제공"}</dd></div>
      <div><dt>계정 출처</dt><dd>{account?.source ?? "미확인"}</dd></div>
    </dl>
  );
}

function normalizeDeveloperDashboardFields(provider: ProviderUsage) {
  const quotaFields = (provider.fields ?? defaultProviderFields(provider))
    .filter((field) => field.kind === "quota")
    .map((field) => ({ label: normalizeDashboardFieldLabel(field.label), value: field.value }));

  return [
    { label: "로그인", value: formatDeveloperLoginIdentity(provider) },
    { label: "플랜", value: provider.plan },
    ...quotaFields
  ];
}

function normalizeDashboardFieldLabel(label: string) {
  if (/5|five/i.test(label)) {
    return label.includes("Gemini") || label.includes("Antigravity") ? label : "5시간";
  }
  if (/주|週|week|7/i.test(label)) {
    return label.includes("Gemini") ? label : "주간";
  }
  return label;
}

function formatDeveloperLoginIdentity(provider: ProviderUsage) {
  if (provider.account) {
    return provider.account;
  }
  if (provider.session.includes("로그아웃") || provider.session.includes("필요") || provider.session.includes("확인 중")) {
    return provider.session;
  }
  if (provider.session.includes("로그인")) {
    return "로그인됨";
  }
  return provider.session;
}

function formatDeveloperCheckDetail(check: { method: string; status: "success" | "failed" | "skipped"; detail: string }) {
  const path = `수집 경로/방법: ${check.method}`;

  if (isSessionCheck(check.method)) {
    return `${path} / 결과: ${formatDeveloperStatus(check.status)}${check.status === "success" ? "" : ` / 실패 이유: ${sanitizeDeveloperFailureDetail(check.detail)}`}`;
  }

  if (check.status === "success") {
    return `${path} / 잔여 사용량 수집: 성공 / ${formatRemainingFromCheckDetail(check.detail)}`;
  }

  return `${path} / 잔여 사용량 수집: 실패 / 실패 이유: ${sanitizeDeveloperFailureDetail(check.detail)}`;
}

function isSessionCheck(method: string) {
  return /session|login/i.test(method);
}

function formatRemainingFromCheckDetail(detail: string) {
  const parts: string[] = [];
  const primary = detail.match(/primary=([0-9]+%|none)/i);
  const weekly = detail.match(/weekly=([0-9]+%|none)/i);
  const fiveHour = detail.match(/fiveHour=([0-9]+%|[^,\s]+)/i);
  const models = detail.match(/models=([0-9]+)/i);

  if (primary) {
    parts.push(`5시간 ${primary[1] === "none" ? "없음" : primary[1]}`);
  }
  if (fiveHour) {
    parts.push(`5시간 ${fiveHour[1] === "none" ? "없음" : fiveHour[1]}`);
  }
  if (weekly) {
    parts.push(`주간 ${weekly[1] === "none" ? "없음" : weekly[1]}`);
  }
  if (models) {
    parts.push(`모델 ${models[1]}개`);
  }

  return parts.length > 0 ? parts.join(" / ") : "잔여 사용량 상세 없음";
}

function sanitizeDeveloperFailureDetail(detail: string) {
  return detail
    .replace(/plan=[^,\s]+,?\s*/gi, "")
    .replace(/account(email)?=[^,\s]+,?\s*/gi, "account=비표시 ")
    .trim() || "확인 가능한 실패 이유 없음";
}

function LegacyDeveloperPanel({
  providers,
  diagnostics,
  isRefreshing,
  onRefresh
}: {
  providers: ProviderUsage[];
  diagnostics: DeveloperDiagnostics | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const providerSummaries = new Map(providers.map((provider) => [provider.id, provider]));

  return (
    <section className="developer-panel" aria-label="개발자 모드">
      <div className="settings-heading">
        <div>
          <span className="eyebrow">Developer Mode</span>
          <h1>실제 수집 상태 검증</h1>
        </div>
        <button className="secondary-button" type="button" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? "확인 중" : "현재 상태 다시 확인"}
        </button>
      </div>

      <p className="developer-note">
        이 화면은 TOKEN_MONITOR_DEV_MODE=1일 때만 표시됩니다. 검토된 이름, 닉네임, 이메일은 계정 구분을 위해 표시할 수 있으며, 토큰, credential contents, provider-internal account ID, raw provider payload는 표시하지 않습니다.
      </p>

      <section className="developer-section">
        <h2>개발 환경 상태</h2>
        <article className="developer-card developer-parser-card">
          <dl className="developer-dl">
            <div><dt>개발자 모드</dt><dd>{diagnostics?.environment.enabled ? "켜짐" : "꺼짐"}</dd></div>
            <div><dt>설정 출처</dt><dd>{formatDeveloperEnvSource(diagnostics?.environment.source)}</dd></div>
            <div><dt>환경 파일</dt><dd>{diagnostics?.environment.loadedFileName ?? "없음"}</dd></div>
            <div><dt>확인 후보</dt><dd>{diagnostics?.environment.checkedPathCount ?? 0}개</dd></div>
            <div><dt>진단 소요</dt><dd>{diagnostics?.totalDurationMs != null ? `${diagnostics.totalDurationMs}ms` : "미측정"}</dd></div>
            <div><dt>갱신 시각</dt><dd>{diagnostics?.generatedAt ? formatTime(diagnostics.generatedAt) : "없음"}</dd></div>
          </dl>
          {diagnostics?.cacheSummary ? (
            <div className="developer-field-list">
              <span>Codex: {diagnostics.cacheSummary.codex}</span>
              <span>Claude: {diagnostics.cacheSummary.claude}</span>
              <span>Gemini: {diagnostics.cacheSummary.gemini}</span>
              <span>CLI: {diagnostics.cacheSummary.cliSession}</span>
            </div>
          ) : null}
        </article>
      </section>

      <section className="developer-section">
        <h2>일반 사용자 전제조건</h2>
        <div className="developer-grid">
          {(diagnostics?.providers ?? []).map((provider) => (
            <article className="developer-card" key={provider.id}>
              <h3>{provider.name}</h3>
              <DeveloperProviderSummary provider={providerSummaries.get(provider.id)} />
              <ul>
                {provider.userPrerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="developer-section">
        <h2>개발 테스트 결과</h2>
        <div className="developer-grid">
          {(diagnostics?.providers ?? []).map((provider) => (
            <article className="developer-card" key={provider.id}>
              <h3>{provider.name}</h3>
              <DeveloperProviderSummary provider={providerSummaries.get(provider.id)} />
              <div className="developer-check-list">
                {provider.checks.map((check) => (
                  <div className="developer-check" key={`${provider.id}-${check.method}`}>
                    <span className={`developer-status ${check.status}`}>{formatDeveloperStatus(check.status)}</span>
                    <strong>{check.method}</strong>
                    <p>{check.detail}</p>
                  </div>
                ))}
              </div>
              {provider.id === "gemini" ? <GeminiParserDiagnostics diagnostics={diagnostics} /> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="developer-section">
        <h2>현재 대시보드 표시 상태</h2>
        <div className="developer-grid">
          {providers.map((provider) => (
            <article className="developer-card" key={provider.id}>
              <h3>{provider.name}</h3>
              <dl className="developer-dl">
                <div><dt>상태</dt><dd>{provider.status}</dd></div>
                <div><dt>버튼</dt><dd>{provider.canLogin ? provider.actionLabel ?? "표시됨" : provider.id === "gemini" ? "Gemini Apps 버튼 표시" : "없음"}</dd></div>
                <div><dt>상세</dt><dd>{provider.detail}</dd></div>
                <div><dt>안내</dt><dd>{provider.issues?.length ?? 0}개</dd></div>
              </dl>
              <div className="developer-field-list">
                {(provider.fields ?? defaultProviderFields(provider)).map((field) => (
                  <span key={field.label}>{field.label}: {field.value}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function DeveloperProviderSummary({ provider }: { provider: ProviderUsage | undefined }) {
  if (!provider) {
    return null;
  }

  return (
    <dl className="developer-provider-summary">
      <div><dt>서비스</dt><dd>{provider.source}</dd></div>
      <div><dt>이름</dt><dd>{provider.name}</dd></div>
      <div><dt>플랜</dt><dd>{provider.plan}</dd></div>
      <div><dt>로그인</dt><dd>{provider.session}</dd></div>
    </dl>
  );
}

function GeminiParserDiagnostics({ diagnostics }: { diagnostics: DeveloperDiagnostics | null }) {
  if (!diagnostics?.geminiParser) {
    return <p className="developer-inline-note">Gemini 파싱 진단 결과를 아직 읽지 못했습니다.</p>;
  }

  const parser = diagnostics.geminiParser;
  return (
    <div className="developer-parser-inline">
      <h4>Gemini 파싱 상태</h4>
      <dl className="developer-dl">
        <div><dt>웹 로그인</dt><dd>{parser.sessionLoggedIn ? "확인됨" : "미확인"}</dd></div>
        <div><dt>캐시</dt><dd>{parser.cacheAvailable ? "있음" : "없음"}</dd></div>
        <div><dt>플랜</dt><dd>{parser.planParsed ? "파싱됨" : "미확인"}</dd></div>
        <div><dt>5시간</dt><dd>{parser.fiveHourParsed ? "파싱됨" : "미확인"}</dd></div>
        <div><dt>주간</dt><dd>{parser.weeklyParsed ? "파싱됨" : "미확인"}</dd></div>
        <div><dt>최근 갱신</dt><dd>{parser.updatedAt ? formatTime(parser.updatedAt) : "없음"}</dd></div>
        <div><dt>파서 디버그</dt><dd>{parser.debugUpdatedAt ? formatTime(parser.debugUpdatedAt) : "없음"}</dd></div>
        <div><dt>사용량 단서</dt><dd>{parser.usageDetected ? "감지됨" : "미감지"}</dd></div>
        <div><dt>퍼센트 후보</dt><dd>{parser.percentCandidates.length > 0 ? parser.percentCandidates.join(", ") : "없음"}</dd></div>
        <div><dt>상세</dt><dd>{parser.detail ?? "표시 가능한 파싱 상세 없음"}</dd></div>
      </dl>
      {parser.snippets.length > 0 ? (
        <div className="developer-snippet-list" aria-label="Gemini parser structured markers">
          {parser.snippets.slice(0, 4).map((snippet) => (
            <p key={snippet}>{snippet}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatDeveloperStatus(status: "success" | "failed" | "skipped") {
  if (status === "success") {
    return "성공";
  }
  if (status === "skipped") {
    return "대기";
  }
  return "실패";
}

function formatDeveloperEnvSource(source: DeveloperDiagnostics["environment"]["source"] | undefined) {
  if (source === "process") {
    return "프로세스 환경변수";
  }
  if (source === "env-file") {
    return ".env 파일";
  }
  return "기본값";
}

function OverlayApp() {
  const [codexUsage, setCodexUsage] = useState<CodexUsageResult | null>(null);
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsageResult | null>(null);
  const [geminiUsage, setGeminiUsage] = useState<GeminiUsageResult | null>(null);
  const [cliSessions, setCliSessions] = useState<CliSessionResult | null>(null);
  const [settings, setSettings] = useState<OverlaySettings>(defaultOverlaySettings);

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

  const alpha = Math.max(0.35, Math.min(0.95, settings.opacity / 100));

  return (
    <main className="overlay-root" style={{ "--overlay-alpha": alpha } as React.CSSProperties}>
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

  const match = field.value.match(/^남은 사용량\s+(.+?)\s+\/\s+초기화\s+(.+)$/);
  if (!match) {
    return field.value;
  }

  const parts = [
    display.showRemaining ? `남은 사용량 ${match[1]}` : null,
    display.showReset ? `초기화 ${match[2]}` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : field.value;
}

function formatOverlayValue(value: string) {
  return value
    .replace(/^남은 사용량\s*/, "")
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
        { label: "로그인", value: "확인 중", kind: "session" },
        { label: "플랜", value: "확인 중", kind: "plan" },
        { label: "5시간", value: "확인 중", kind: "quota" },
        { label: "주간", value: "확인 중", kind: "quota" }
      ],
      detail: "Codex Desktop 로컬 앱 서버에서 ChatGPT 사용량을 읽고 있습니다."
    };
  }

  if (!usage.ok) {
    const login = formatAccountLogin(sessions?.codex.account?.email, formatSession(sessions?.codex));
    const issue = getCodexUserIssue(usage.errorCode);
    return {
      id: "codex",
      name: "ChatGPT",
      source: "OpenAI",
      status: "error",
      plan: "확인 불가",
      account: sessions?.codex.account?.email ?? undefined,
      session: login,
      used: "확인 불가",
      remaining: "확인 불가",
      reset: "확인 불가",
      fields: [
        { label: "로그인", value: login, kind: "session" },
        { label: "플랜", value: "확인 불가", kind: "plan" },
        { label: "5시간", value: "확인 불가", kind: "quota" },
        { label: "주간", value: "확인 불가", kind: "quota" }
      ],
      detail: usage.error,
      canConfigureCodex: issue.openSettings,
      issues: [{ reason: issue.title, steps: [issue.description] }]
    };
  }

  const accountEmail = usage.account?.email ?? sessions?.codex.account?.email ?? null;
  const login = formatAccountLogin(accountEmail, formatSession(sessions?.codex));
  return {
    id: "codex",
    name: "ChatGPT",
    source: "OpenAI",
    status: "live",
    plan: usage.planType ?? "로그인됨",
    account: accountEmail ?? undefined,
    session: login,
    used: formatCodexWindows(usage, "used"),
    remaining: formatCodexWindows(usage, "remaining"),
    reset: formatCodexResetWindows(usage),
    fields: [
      { label: "로그인", value: login, kind: "session" },
      { label: "플랜", value: usage.planType ?? "로그인됨", kind: "plan" },
      { label: "5시간", value: formatCodexWindowSummary(usage.fiveHour, "현재 한도 정보 없음"), kind: "quota" },
      { label: "주간", value: formatCodexWindowSummary(usage.weekly), kind: "quota" },
      ...usage.otherWindows.map((window) => ({ label: window.label, value: formatCodexWindowSummary(window), kind: "quota" as const }))
    ],
    detail: `최근 갱신 ${formatTime(usage.updatedAt)}`
  };
}

function getCodexUserIssue(errorCode: Extract<CodexUsageResult, { ok: false }>["errorCode"]) {
  if (errorCode === "desktop-not-installed") {
    return {
      title: "Codex Desktop이 필요합니다.",
      description: "Codex Desktop을 설치하고 ChatGPT 계정으로 로그인한 뒤 다시 확인해 주세요.",
      openSettings: false
    };
  }
  if (errorCode === "executable-not-found") {
    return {
      title: "Codex 실행 파일을 찾지 못했습니다.",
      description: "설정에서 Codex Desktop 경로를 확인해 주세요.",
      openSettings: true
    };
  }
  if (errorCode === "invalid-configured-path" || errorCode === "access-denied") {
    return {
      title: "설정된 Codex 경로를 사용할 수 없습니다.",
      description: "설정에서 다른 경로를 선택하거나 자동 설정으로 복원해 주세요.",
      openSettings: true
    };
  }
  if (errorCode === "login-required") {
    return {
      title: "Codex 로그인이 필요합니다.",
      description: "Codex Desktop에서 ChatGPT 계정으로 로그인한 뒤 다시 확인해 주세요.",
      openSettings: false
    };
  }
  if (errorCode === "app-server-start-failed") {
    return {
      title: "Codex Desktop에 연결하지 못했습니다.",
      description: "Codex Desktop을 한 번 실행하거나 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.",
      openSettings: true
    };
  }
  return {
    title: "사용량을 일시적으로 확인할 수 없습니다.",
    description: "잠시 후 다시 시도하거나 공식 사용량 대시보드에서 확인해 주세요.",
    openSettings: false
  };
}

function buildClaudeProvider(usage: ClaudeUsageResult | null, sessions: CliSessionResult | null): ProviderUsage {
  const canLogin = isClaudeCliLoginMissing(sessions);
  const accountEmail = sessions?.claude.account?.email ?? null;
  const login = formatAccountLogin(accountEmail, formatSession(sessions?.claude));

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
        { label: "로그인", value: "확인 중", kind: "session" },
        { label: "플랜", value: "확인 중", kind: "plan" },
        { label: "5시간", value: "확인 중", kind: "quota" },
        { label: "주간", value: "확인 중", kind: "quota" }
      ],
      detail: canLogin ? "Node.js/npm 설치 후 Claude Pro/Max 이상 계정으로 Claude CLI 설치와 로그인을 진행하세요." : "Claude 로컬 사용 로그를 읽고 있습니다.",
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
      account: accountEmail ?? undefined,
      session: login,
      used: "확인 불가",
      remaining: "확인 불가",
      reset: "확인 불가",
      fields: [
        { label: "로그인", value: login, kind: "session" },
        { label: "플랜", value: "확인 불가", kind: "plan" },
        { label: "5시간", value: "확인 불가", kind: "quota" },
        { label: "주간", value: "확인 불가", kind: "quota" }
      ],
      detail: canLogin ? "Node.js/npm 설치 후 Claude Pro/Max 이상 계정으로 Claude CLI 설치와 로그인을 진행하세요." : usage.error,
      canLogin,
      actionLabel: "Claude CLI 설치 및 로그인"
    };
  }

  const needsCliUsageLink = !usage.oauth;
  const recentTokens = usage.windows.sevenDay.tokens;
  const usedLabel = usage.oauth
    ? formatClaudeOAuthWindows(usage.oauth.fiveHour, usage.oauth.sevenDay, "used")
    : recentTokens > 0
      ? `5시간 ${formatNumber(usage.windows.fiveHour.tokens)} / 7일 ${formatNumber(recentTokens)}`
      : `최근 30일 0 / 전체 ${formatNumber(usage.windows.allTime.tokens)}`;
  const remainingLabel = usage.oauth ? formatClaudeOAuthWindows(usage.oauth.fiveHour, usage.oauth.sevenDay, "remaining") : "서버 한도 미연동";
  const resetLabel = usage.oauth ? formatClaudeOAuthResets(usage.oauth.fiveHour, usage.oauth.sevenDay) : "CLI/Web 연동 필요";
  const extraUsage = usage.oauth?.extraUsage?.isEnabled && usage.oauth.extraUsage.monthlyLimit != null
    ? `추가 사용 ${formatNumber(usage.oauth.extraUsage.usedCredits ?? 0)} / ${formatNumber(usage.oauth.extraUsage.monthlyLimit)} ${usage.oauth.extraUsage.currency ?? ""}`.trim()
    : null;

  return {
    id: "claude",
    name: "Claude",
    source: "Anthropic",
    status: "live",
    plan: usage.planType ?? "로컬 로그",
    account: accountEmail ?? undefined,
    session: login,
    used: usedLabel,
    remaining: remainingLabel,
    reset: resetLabel,
    fields: [
      { label: "로그인", value: login, kind: "session" },
      { label: "플랜", value: usage.planType ?? "로컬 로그", kind: "plan" },
      { label: "5시간", value: formatClaudeWindowSummary(usage.oauth?.fiveHour ?? null, usage.windows.fiveHour), kind: "quota" },
      { label: "주간", value: formatClaudeWindowSummary(usage.oauth?.sevenDay ?? null, usage.windows.sevenDay), kind: "quota" }
    ],
    detail: extraUsage ?? `최근 갱신 ${formatTime(usage.updatedAt)}`,
    canLogin: canLogin || needsCliUsageLink,
    actionLabel: canLogin ? "Claude CLI 설치 및 로그인" : "Claude CLI 재연동"
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
        { label: "로그인", value: "확인 중", kind: "session" },
        { label: "플랜", value: "확인 중", kind: "plan" },
        { label: "Gemini 5시간", value: "확인 중", kind: "quota" },
        { label: "Gemini 주간", value: "확인 중", kind: "quota" },
        { label: "Antigravity 5시간", value: "확인 중", kind: "quota" }
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
        { label: "로그인", value: formatGeminiLoginSummary(usage), kind: "session" },
        { label: "플랜", value: planLabel, kind: "plan" },
        { label: "Gemini 5시간", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.fiveHour ?? null), kind: "quota" },
        { label: "Gemini 주간", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.weekly ?? null), kind: "quota" },
        { label: "Antigravity 5시간", value: "남은 사용량 확인 불가 / 초기화 확인 불가", kind: "quota" }
      ],
      detail: usage.error,
      canLogin: true,
      actionLabel: "Antigravity CLI 설치 및 로그인",
      issues: buildGeminiIssues(usage.geminiApps, null)
    };
  }

  const antigravityFiveHourWindow = pickAntigravityFiveHourWindow(usage.models);
  const sourceLabel = formatAntigravitySource(usage.source);
  const planLabel = usage.geminiApps?.plan ?? usage.planType ?? "확인 필요";
  const promptCredits = formatPromptCredits(usage.promptCredits);
  const login = formatAccountLogin(usage.account?.email, formatGeminiLoginSummary(usage));

  return {
    id: "gemini",
    name: "Gemini",
    source: "Google",
    status: "live",
    plan: planLabel,
    account: usage.account?.email ?? undefined,
    session: login,
    used: formatGeminiWindows(antigravityFiveHourWindow, null, null, "used"),
    remaining: formatGeminiWindows(antigravityFiveHourWindow, null, null, "remaining"),
    reset: formatGeminiResets(antigravityFiveHourWindow, null, null),
    fields: [
      { label: "로그인", value: login, kind: "session" },
      { label: "플랜", value: planLabel, kind: "plan" },
      { label: "Gemini 5시간", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.fiveHour ?? null), kind: "quota" },
      { label: "Gemini 주간", value: formatGeminiAppsWebUsageSummary(usage.geminiApps?.weekly ?? null), kind: "quota" },
      { label: "Antigravity 5시간", value: formatGeminiWindowSummary(antigravityFiveHourWindow), kind: "quota" }
    ],
    detail: promptCredits ?? formatGeminiDetail(usage.geminiApps?.updatedAt ?? null, usage.geminiApps?.detail ?? null, sourceLabel, usage.updatedAt),
    issues: buildGeminiIssues(usage.geminiApps, antigravityFiveHourWindow)
  };
}

function formatGeminiDetail(geminiAppsUpdatedAt: string | null, parsedGeminiAppsDetail: string | null, antigravitySource: string, antigravityUpdatedAt: string) {
  const updateDetail = geminiAppsUpdatedAt ? `Gemini Apps 최근 갱신 ${formatTime(geminiAppsUpdatedAt)}` : "Gemini Apps Usage Limits 연동 필요";
  const parsedDetail = parsedGeminiAppsDetail ? ` / ${parsedGeminiAppsDetail}` : "";
  return `${updateDetail}${parsedDetail} / Antigravity ${antigravitySource} 기준 최근 갱신 ${formatTime(antigravityUpdatedAt)}`;
}

function formatGeminiLoginSummary(usage: GeminiUsageResult) {
  const geminiWeb = usage.geminiAppsSession.loggedIn ? "Gemini 웹 로그인됨" : "Gemini 웹 로그아웃";
  if (!usage.ok) {
    return `${geminiWeb} / Antigravity 확인 필요`;
  }
  return `${geminiWeb} / Antigravity ${formatAntigravitySource(usage.source)}`;
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
    errorCode: "usage-read-failed",
    error,
    updatedAt: new Date().toISOString()
  };
}

function makeClaudeError(error: string): ClaudeUsageResult {
  return {
    ok: false,
    source: "local-logs",
    error,
    updatedAt: new Date().toISOString()
  };
}

function makeGeminiError(error: string): GeminiUsageResult {
  return {
    ok: false,
    source: "gemini-cli-oauth",
    error,
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
  return session.loggedIn ? `로그인됨${session.authMethod ? ` (${session.authMethod})` : ""}` : "로그아웃";
}

function formatAccountLogin(email: string | null | undefined, fallback: string) {
  return email ?? fallback;
}

function formatCodexWindows(usage: Extract<CodexUsageResult, { ok: true }>, mode: "used" | "remaining") {
  const valueKey = mode === "used" ? "usedPercent" : "remainingPercent";
  const values = [
    usage.fiveHour ? `5시간 ${usage.fiveHour[valueKey]}%` : null,
    usage.weekly ? `주간 ${usage.weekly[valueKey]}%` : null,
    ...usage.otherWindows.map((window) => `${window.label} ${window[valueKey]}%`)
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function formatCodexResetWindows(usage: Extract<CodexUsageResult, { ok: true }>) {
  const values = [
    usage.fiveHour?.resetsAt ? `5시간 ${formatReset(usage.fiveHour.resetsAt)}` : null,
    usage.weekly?.resetsAt ? `주간 ${formatReset(usage.weekly.resetsAt)}` : null,
    ...usage.otherWindows
      .filter((window) => Boolean(window.resetsAt))
      .map((window) => `${window.label} ${formatReset(window.resetsAt!)}`)
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function formatClaudeOAuthWindows(fiveHour: ClaudeOAuthWindow | null, sevenDay: ClaudeOAuthWindow | null, mode: "used" | "remaining") {
  const key = mode === "used" ? "usedPercent" : "remainingPercent";
  const values = [
    fiveHour ? `5시간 ${fiveHour[key]}%` : null,
    sevenDay ? `주간 ${sevenDay[key]}%` : null
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function formatClaudeOAuthResets(fiveHour: ClaudeOAuthWindow | null, sevenDay: ClaudeOAuthWindow | null) {
  const values = [
    fiveHour?.resetsAt ? `5시간 ${formatReset(fiveHour.resetsAt)}` : null,
    sevenDay?.resetsAt ? `주간 ${formatReset(sevenDay.resetsAt)}` : null
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

function formatCodexWindowSummary(window: CodexUsageWindow | null, missingLabel = "남은 사용량 데이터 없음") {
  if (!window) {
    return missingLabel;
  }

  const reset = window.resetsAt ? formatReset(window.resetsAt) : "초기화 시간 없음";
  return `남은 사용량 ${window.remainingPercent}% / 초기화 ${reset}`;
}

function formatClaudeWindowSummary(oauthWindow: ClaudeOAuthWindow | null, localWindow: { tokens: number } | null) {
  if (oauthWindow) {
    const reset = oauthWindow.resetsAt ? formatReset(oauthWindow.resetsAt) : "초기화 시간 없음";
    return `남은 사용량 ${oauthWindow.remainingPercent}% / 초기화 ${reset}`;
  }

  return "서버 한도 미연동";
}

function formatGeminiWindowSummary(window: GeminiUsageWindow | null) {
  if (!window) {
    return "남은 사용량 데이터 없음";
  }

  const reset = window.resetsAt ? formatReset(window.resetsAt) : "초기화 시간 없음";
  return `남은 사용량 ${window.remainingPercent}% / 초기화 ${reset}`;
}

function formatGeminiAppsWebUsageSummary(window: GeminiAppsUsageWindow | null) {
  if (!window) {
    return "남은 사용량 미연동 / 초기화 미연동";
  }

  return `남은 사용량 ${window.remaining ?? "확인 필요"} / 초기화 ${window.reset ?? "확인 필요"}`;
}

function formatGeminiAppsUsageSummary(window: GeminiAppsUsageWindow | null) {
  if (!window) {
    return "남은 사용량 미연동 / 초기화 미연동";
  }
  return "남은 사용량 미연동 / 초기화 미연동";
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
