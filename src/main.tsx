import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, LayoutDashboard, MonitorUp, RefreshCw, Settings, Zap } from "lucide-react";
import "./styles.css";
import type { ClaudeOAuthWindow, ClaudeUsageResult, CliSessionResult, CodexUsageResult, CodexUsageWindow, OverlaySettings, ProviderId } from "./global";

type ProviderUsage = {
  id: ProviderId;
  name: string;
  source: string;
  status: "live" | "pending" | "error" | "loading";
  plan: string;
  session: string;
  used: string;
  remaining: string;
  reset: string;
  detail: string;
  canLogin?: boolean;
};

const providerLabels: Record<ProviderId, string> = {
  codex: "Codex",
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

function App() {
  const [codexUsage, setCodexUsage] = useState<CodexUsageResult | null>(null);
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsageResult | null>(null);
  const [cliSessions, setCliSessions] = useState<CliSessionResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(defaultOverlaySettings);
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings">("dashboard");

  const providers = useMemo(() => buildProviderUsage(codexUsage, claudeUsage, cliSessions), [codexUsage, claudeUsage, cliSessions]);

  async function refreshUsage() {
    setIsRefreshing(true);
    try {
      if (!window.tokenMonitor?.getCodexUsage || !window.tokenMonitor?.getClaudeUsage || !window.tokenMonitor?.getCliSessionStatus) {
        setCodexUsage(makeCodexError("데스크탑 앱 연결을 확인할 수 없습니다."));
        setClaudeUsage(makeClaudeError("데스크탑 앱 연결을 확인할 수 없습니다."));
        return;
      }

      const [latestCodex, latestClaude, latestSessions] = await Promise.all([
        window.tokenMonitor.getCodexUsage(),
        window.tokenMonitor.getClaudeUsage(),
        window.tokenMonitor.getCliSessionStatus()
      ]);
      setCodexUsage(latestCodex);
      setClaudeUsage(latestClaude);
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

  useEffect(() => {
    void refreshUsage();
    void window.tokenMonitor?.getOverlaySettings().then(setOverlaySettings);
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
              <span>플랜, CLI 세션, 사용량, 잔여량, 초기화 시간</span>
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
              aria-label="Codex 사용량 대시보드 열기"
              title="Codex 사용량 대시보드 열기"
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
          <section className="provider-grid" aria-label="서비스별 사용량">
            {providers.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} onClaudeLogin={startClaudeLogin} />
            ))}
          </section>
        ) : (
          <SettingsPanel settings={overlaySettings} onChange={updateOverlaySettings} />
        )}
      </section>
    </main>
  );
}

async function startClaudeLogin() {
  await window.tokenMonitor?.startClaudeLogin();
}

function ProviderCard({ provider, onClaudeLogin }: { provider: ProviderUsage; onClaudeLogin: () => void }) {
  return (
    <article className="provider-card">
      <div className="provider-card-header">
        <div>
          <span className="provider-source">{provider.source}</span>
          <h2>{provider.name}</h2>
        </div>
        <span className={`status-badge ${provider.status}`}>{formatProviderStatus(provider.status)}</span>
      </div>

      <dl className="usage-fields">
        <div>
          <dt>현재 플랜</dt>
          <dd>{provider.plan}</dd>
        </div>
        <div>
          <dt>CLI 세션</dt>
          <dd>{provider.session}</dd>
        </div>
        <div>
          <dt>사용량</dt>
          <dd>{provider.used}</dd>
        </div>
        <div>
          <dt>잔여량</dt>
          <dd>{provider.remaining}</dd>
        </div>
        <div>
          <dt>초기화 시간</dt>
          <dd>{provider.reset}</dd>
        </div>
      </dl>

      <p>{provider.detail}</p>
      {provider.canLogin ? (
        <button className="provider-action" type="button" onClick={onClaudeLogin}>
          Claude CLI 로그인 시작
        </button>
      ) : null}
    </article>
  );
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
                    <input type="checkbox" checked={item.showSession} onChange={(event) => updateProviderItem(id, { showSession: event.target.checked })} />
                    CLI 세션
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
  const [cliSessions, setCliSessions] = useState<CliSessionResult | null>(null);
  const [settings, setSettings] = useState<OverlaySettings>(defaultOverlaySettings);

  const providers = useMemo(
    () => buildProviderUsage(codexUsage, claudeUsage, cliSessions).filter((provider) => getProviderDisplay(settings, provider.id).enabled),
    [codexUsage, claudeUsage, cliSessions, settings]
  );

  useEffect(() => {
    document.body.classList.add("overlay-body");
    return () => document.body.classList.remove("overlay-body");
  }, []);

  useEffect(() => {
    void window.tokenMonitor?.getOverlaySettings().then(setSettings);
    const unsubscribe = window.tokenMonitor?.onOverlaySettingsChanged(setSettings);
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    async function refresh() {
      if (!window.tokenMonitor?.getCodexUsage || !window.tokenMonitor?.getClaudeUsage || !window.tokenMonitor?.getCliSessionStatus) {
        setCodexUsage(makeCodexError("데스크탑 앱 연결을 확인할 수 없습니다."));
        setClaudeUsage(makeClaudeError("데스크탑 앱 연결을 확인할 수 없습니다."));
        return;
      }

      const [latestCodex, latestClaude, latestSessions] = await Promise.all([
        window.tokenMonitor.getCodexUsage(),
        window.tokenMonitor.getClaudeUsage(),
        window.tokenMonitor.getCliSessionStatus()
      ]);
      setCodexUsage(latestCodex);
      setClaudeUsage(latestClaude);
      setCliSessions(latestSessions);
    }

    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const alpha = Math.max(0.35, Math.min(0.95, settings.opacity / 100));

  return (
    <main className="overlay-root" style={{ "--overlay-alpha": alpha } as React.CSSProperties}>
      <section className="overlay-card">
        <div className="overlay-title">
          <MonitorUp size={15} aria-hidden="true" />
          <span>사용량</span>
        </div>

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

  return (
    <article className="overlay-provider">
      <strong>{provider.name}</strong>
      {display.showPlan ? <span>플랜 {provider.plan}</span> : null}
      {display.showSession ? <span>세션 {provider.session}</span> : null}
      {display.showUsed ? <span>사용 {provider.used}</span> : null}
      {display.showRemaining ? <span>잔여 {provider.remaining}</span> : null}
      {display.showReset ? <span>초기화 {provider.reset}</span> : null}
    </article>
  );
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

function buildProviderUsage(codexUsage: CodexUsageResult | null, claudeUsage: ClaudeUsageResult | null, sessions: CliSessionResult | null): ProviderUsage[] {
  return [
    buildCodexProvider(codexUsage, sessions),
    buildClaudeProvider(claudeUsage, sessions),
    {
      id: "gemini",
      name: "Gemini",
      source: "Google",
      status: "pending",
      plan: "연동 필요",
      session: "확인 불가",
      used: "확인 불가",
      remaining: "확인 불가",
      reset: "확인 불가",
      detail: "Gemini 사용량 수집기는 아직 연결되지 않았습니다."
    }
  ];
}

function buildCodexProvider(usage: CodexUsageResult | null, sessions: CliSessionResult | null): ProviderUsage {
  if (usage == null) {
    return {
      id: "codex",
      name: "Codex",
      source: "OpenAI",
      status: "loading",
      plan: "확인 중",
      session: "확인 중",
      used: "확인 중",
      remaining: "확인 중",
      reset: "확인 중",
      detail: "Codex 로컬 앱 서버에서 사용량을 읽고 있습니다."
    };
  }

  if (!usage.ok) {
    return {
      id: "codex",
      name: "Codex",
      source: "OpenAI",
      status: "error",
      plan: "확인 불가",
      session: formatSession(sessions?.codex),
      used: "확인 불가",
      remaining: "확인 불가",
      reset: "확인 불가",
      detail: usage.error
    };
  }

  return {
    id: "codex",
    name: "Codex",
    source: "OpenAI",
    status: "live",
    plan: usage.planType ?? "로그인됨",
    session: formatSession(sessions?.codex),
    used: formatWindows(usage.primary, usage.secondary, "used"),
    remaining: formatWindows(usage.primary, usage.secondary, "remaining"),
    reset: formatResetWindows(usage.primary, usage.secondary),
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
      detail: canLogin ? "Claude CLI 로그인이 필요합니다." : "Claude 로컬 사용 로그를 읽고 있습니다.",
      canLogin
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
      detail: canLogin ? "Claude CLI 로그인 후 사용량을 다시 확인할 수 있습니다." : usage.error,
      canLogin
    };
  }

  const topModels = usage.modelBreakdown.map((item) => `${shortModelName(item.model)} ${formatNumber(item.tokens)}`).join(" / ");
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
    detail: extraUsage ?? (topModels
      ? `최근 7일 모델별 ${topModels}`
      : `마지막 사용 ${usage.lastActivityAt ? formatReset(usage.lastActivityAt) : "없음"}`),
    canLogin
  };
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

function formatProviderStatus(status: ProviderUsage["status"]) {
  if (status === "live") {
    return "연결됨";
  }
  if (status === "loading") {
    return "확인 중";
  }
  if (status === "error") {
    return "오류";
  }
  return "대기";
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

function shortModelName(model: string) {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
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
