import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, LayoutDashboard, Link, RefreshCw, Settings, Zap } from "lucide-react";
import "./styles.css";
import type {
  ClaudeOAuthWindow,
  ClaudeUsageResult,
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
  issues?: ProviderIssue[];
};

type ProviderField = {
  label: string;
  value: string;
  kind: "plan" | "quota" | "usage" | "remaining" | "reset";
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
    } finally {
      setIsRefreshing(false);
    }
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
/*
    setIsGeminiAppsLoginPending(true);
    setGeminiAppsLoginNotice(null);
    try {
      const startResult = await window.tokenMonitor?.startGeminiAppsLogin();
      if (!startResult?.ok) {
        setGeminiAppsLoginNotice(startResult?.detail ?? "Gemini 로그인 창을 열 수 없습니다.");
        return;
      }

      setGeminiAppsLoginNotice(startResult.detail ?? "Gemini 로그인 후 Usage Limits 화면이 보이면 자동으로 한도를 저장합니다.");
      window.setTimeout(() => {
        void refreshUsage();
        setIsGeminiAppsLoginPending(false);
      }, 5000);
    } catch (error) {
      setGeminiAppsLoginNotice(error instanceof Error ? error.message : "Gemini 로그인을 시작할 수 없습니다.");
      setIsGeminiAppsLoginPending(false);
    }
  }
*/

  }

  useEffect(() => {
    void refreshUsage();
    void window.tokenMonitor?.getOverlaySettings().then(setOverlaySettings);
  }, []);

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
              />
            ))}
          </section>
          </>
        ) : (
          <SettingsPanel settings={overlaySettings} onChange={updateOverlaySettings} />
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
  onGeminiAppsLogin
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
}) {
  const isActionPending = provider.id === "claude" && isClaudeLoginPending || provider.id === "gemini" && isGeminiLoginPending;
  const actionLabel = isActionPending ? "연동 확인 중" : (provider.actionLabel ?? "사용량 수집 연동");
  const isGeminiAppsLoggedIn = provider.id === "gemini" && Boolean(geminiUsage?.geminiAppsSession.loggedIn);
  const geminiAppsActionLabel = isGeminiAppsLoginPending
    ? isGeminiAppsLoggedIn ? "사용량 확인 중" : "Gemini 로그인 확인 중"
    : isGeminiAppsLoggedIn ? "사용량 확인" : "Gemini 로그인";
  const handleAction = provider.id === "gemini" ? onGeminiLogin : onClaudeLogin;
  const showHeaderActions = Boolean(provider.canLogin || provider.id === "gemini");
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

function ProviderCollectionGuide({ providerId }: { providerId: ProviderId }) {
  const guide = getProviderCollectionGuide(providerId);

  return (
    <section className="collection-guide" aria-label={`${providerLabels[providerId]} 수집 경로`}>
      <div className="collection-guide-heading">
        <span>수집 경로</span>
        <strong>{guide.title}</strong>
      </div>
      <p>{guide.summary}</p>
      <ol>
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}

function getProviderCollectionGuide(providerId: ProviderId) {
  if (providerId === "codex") {
    return {
      title: "ChatGPT 로컬 앱 서버",
      summary: "Codex Desktop 설치와 로그인이 완료된 상태에서 ChatGPT 5시간/주간 quota를 확인합니다.",
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
      title: "Claude Code OAuth",
      summary: "Node.js/npm이 준비된 상태에서 Claude Pro/Max 이상 계정으로 Claude CLI 설치와 OAuth 로그인을 진행한 뒤 서버 quota를 읽습니다.",
      steps: [
        "Node.js/npm 설치 상태 확인",
        "Claude Pro/Max 이상 계정 확인",
        "Claude CLI 설치 및 로그인 버튼 실행",
        "OAuth usage endpoint에서 5시간/주간 quota 조회",
        "서버 quota 미연동 시 local log를 보조 정보로 사용"
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

  return {
    title: "Gemini Usage Limits + Antigravity CLI",
    summary: "Google AI 플랜은 공통으로 표시하고, Gemini Apps 한도는 gemini.google.com Usage Limits 기준으로 분리합니다. Antigravity 5시간 한도는 Node.js/npm 기반 CLI와 local fallback에서 수집합니다.",
    steps: [
      "Gemini Apps 5시간/주간 한도는 gemini.google.com의 Usage Limits 데이터가 필요",
      "Google 플랜은 OAuth 또는 local provider 응답의 Free/Plus/Pro/Ultra 값을 표시",
      "Antigravity 5시간 한도는 Antigravity CLI 설치 및 로그인 버튼 실행 후 수집",
      "Antigravity 실행 시 local fallback 유지",
      "계정 이메일과 OAuth token은 UI와 로그에 표시하지 않음"
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
        "필요 시 CODEX_CLI_PATH 설정"
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
        "필요 시 CODEX_CLI_PATH 설정"
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
    { label: "플랜", value: provider.plan, kind: "plan" },
    { label: "잔여 사용량", value: provider.remaining, kind: "remaining" },
    { label: "초기화", value: provider.reset, kind: "reset" }
  ];
}

function SettingsPanel({ settings, onChange }: { settings: OverlaySettings; onChange: (settings: OverlaySettings) => void }) {
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
    <section className="settings-panel" aria-label="설정">
      <div className="settings-heading">
        <div>
          <span className="eyebrow">기본 설정</span>
          <h1>오버레이와 종료 동작</h1>
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

                <ProviderCollectionGuide providerId={id} />
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
        { label: "플랜", value: "확인 중", kind: "plan" },
        { label: "5시간", value: "확인 중", kind: "quota" },
        { label: "주간", value: "확인 중", kind: "quota" }
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
        { label: "5시간", value: "확인 불가", kind: "quota" },
        { label: "주간", value: "확인 불가", kind: "quota" }
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
    used: formatWindows(usage.primary, usage.secondary, "used"),
    remaining: formatWindows(usage.primary, usage.secondary, "remaining"),
    reset: formatResetWindows(usage.primary, usage.secondary),
    fields: [
      { label: "플랜", value: usage.planType ?? "로그인됨", kind: "plan" },
      { label: "5시간", value: formatCodexWindowSummary(usage.primary), kind: "quota" },
      { label: "주간", value: formatCodexWindowSummary(usage.secondary), kind: "quota" }
    ],
    detail: `최근 갱신 ${formatTime(usage.updatedAt)}`
  };
}

function buildClaudeProvider(usage: ClaudeUsageResult | null, sessions: CliSessionResult | null): ProviderUsage {
  const canLogin = isClaudeCliLoginMissing(sessions);

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
      session: formatSession(sessions?.claude),
      used: "확인 불가",
      remaining: "확인 불가",
      reset: "확인 불가",
      fields: [
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
    session: formatSession(sessions?.claude),
    used: usedLabel,
    remaining: remainingLabel,
    reset: resetLabel,
    fields: [
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

  return {
    id: "gemini",
    name: "Gemini",
    source: "Google",
    status: "live",
    plan: planLabel,
    session: sourceLabel,
    used: formatGeminiWindows(antigravityFiveHourWindow, null, null, "used"),
    remaining: formatGeminiWindows(antigravityFiveHourWindow, null, null, "remaining"),
    reset: formatGeminiResets(antigravityFiveHourWindow, null, null),
    fields: [
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

function formatWindows(primary: CodexUsageWindow | null, secondary: CodexUsageWindow | null, mode: "used" | "remaining") {
  const valueKey = mode === "used" ? "usedPercent" : "remainingPercent";
  const values = [
    primary ? `5시간 ${primary[valueKey]}%` : null,
    secondary ? `주간 ${secondary[valueKey]}%` : null
  ].filter(Boolean);

  return values.length > 0 ? values.join(" / ") : "데이터 없음";
}

function formatResetWindows(primary: CodexUsageWindow | null, secondary: CodexUsageWindow | null) {
  const values = [
    primary?.resetsAt ? `5시간 ${formatReset(primary.resetsAt)}` : null,
    secondary?.resetsAt ? `주간 ${formatReset(secondary.resetsAt)}` : null
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

function formatCodexWindowSummary(window: CodexUsageWindow | null) {
  if (!window) {
    return "남은 사용량 데이터 없음";
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
