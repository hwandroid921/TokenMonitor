import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, LayoutDashboard, Link, RefreshCw, Settings, Zap } from "lucide-react";
import "./styles.css";
import type {
  ClaudeOAuthWindow,
  ClaudeUsageResult,
  CliSessionResult,
  CodexUsageResult,
  CodexUsageWindow,
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
  fields?: Array<{ label: string; value: string }>;
  plan: string;
  session: string;
  used: string;
  remaining: string;
  reset: string;
  detail: string;
  canLogin?: boolean;
  actionLabel?: string;
};

const providerLabels: Record<ProviderId, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Antigravity"
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
const claudeLoginPollTimeoutMs = 20 * 60_000;

function App() {
  const [codexUsage, setCodexUsage] = useState<CodexUsageResult | null>(null);
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsageResult | null>(null);
  const [geminiUsage, setGeminiUsage] = useState<GeminiUsageResult | null>(null);
  const [cliSessions, setCliSessions] = useState<CliSessionResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(defaultOverlaySettings);
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings">("dashboard");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isClaudeLoginPending, setIsClaudeLoginPending] = useState(false);

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
        window.tokenMonitor.getGeminiUsage(),
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

  async function handleMinimizeToTray() {
    setShowExitConfirm(false);
    await window.tokenMonitor?.minimizeToTray();
  }

  async function handleClaudeLogin() {
    if (isClaudeLoginPending) {
      return;
    }

    setIsClaudeLoginPending(true);
    try {
      await window.tokenMonitor?.startClaudeLogin();
      await waitForClaudeLoginCompletion({
        onUpdate: ({ claudeUsage, cliSessions }) => {
          setClaudeUsage(claudeUsage);
          setCliSessions(cliSessions);
        }
      });
      await refreshUsage();
    } finally {
      setIsClaudeLoginPending(false);
    }
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
              <ProviderCard key={provider.id} provider={provider} isClaudeLoginPending={isClaudeLoginPending} onClaudeLogin={handleClaudeLogin} />
            ))}
          </section>
        ) : (
          <SettingsPanel settings={overlaySettings} onChange={updateOverlaySettings} />
        )}
      </section>

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

function ProviderCard({ provider, isClaudeLoginPending, onClaudeLogin }: { provider: ProviderUsage; isClaudeLoginPending: boolean; onClaudeLogin: () => void }) {
  const isActionPending = provider.id === "claude" && isClaudeLoginPending;
  const actionLabel = isActionPending ? "연동 확인 중" : (provider.actionLabel ?? "Claude CLI");

  return (
    <article className="provider-card">
      <div className="provider-card-header">
        <div>
          <span className="provider-source">{provider.source}</span>
          <h2>{provider.name}</h2>
        </div>
        {provider.canLogin ? (
          <button
            className="provider-action provider-header-action"
            type="button"
            onClick={onClaudeLogin}
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

      <dl className="usage-fields">
        {(provider.fields ?? defaultProviderFields(provider)).map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>

      {provider.canLogin ? (
        <button className="provider-action" type="button" onClick={onClaudeLogin} disabled={isActionPending} aria-busy={isActionPending}>
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

async function waitForClaudeLoginCompletion({ onUpdate }: { onUpdate: (usage: { claudeUsage: ClaudeUsageResult; cliSessions: CliSessionResult }) => void }) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < claudeLoginPollTimeoutMs) {
    const [claudeUsage, cliSessions] = await Promise.all([
      window.tokenMonitor?.getClaudeUsage(true),
      window.tokenMonitor?.getCliSessionStatus(true)
    ]);

    if (claudeUsage && cliSessions) {
      onUpdate({ claudeUsage, cliSessions });

      if (isClaudeUsageLinked(claudeUsage, cliSessions)) {
        return;
      }
    }

    await delay(claudeLoginPollIntervalMs);
  }
}

function isClaudeUsageLinked(claudeUsage: ClaudeUsageResult, cliSessions: CliSessionResult) {
  return Boolean(cliSessions.claude.loggedIn && claudeUsage.ok && claudeUsage.oauth);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function defaultProviderFields(provider: ProviderUsage) {
  return [
    { label: "플랜", value: provider.plan },
    { label: "잔여 사용량", value: provider.remaining },
    { label: "초기화", value: provider.reset }
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
  const fields = provider.fields ?? defaultProviderFields(provider);
  const planField = fields[0];
  const detailFields = fields.slice(1);
  const heading = display.showPlan && planField?.value ? `${provider.name.toUpperCase()} / ${formatOverlayValue(planField.value)}` : provider.name.toUpperCase();

  return (
    <article className="overlay-provider">
      <strong>{heading}</strong>
      {(!display.showRemaining && !display.showReset) ? null : detailFields.map((field) => (
        <span key={field.label}>{field.label} {formatOverlayValue(field.value)}</span>
      ))}
    </article>
  );
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
      name: "Codex",
      source: "OpenAI",
      status: "loading",
      plan: "확인 중",
      session: "확인 중",
      used: "확인 중",
      remaining: "확인 중",
      reset: "확인 중",
      fields: [
        { label: "플랜", value: "확인 중" },
        { label: "5시간", value: "확인 중" },
        { label: "주간", value: "확인 중" }
      ],
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
      fields: [
        { label: "플랜", value: "확인 불가" },
        { label: "5시간", value: "확인 불가" },
        { label: "주간", value: "확인 불가" }
      ],
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
    fields: [
      { label: "플랜", value: usage.planType ?? "로그인됨" },
      { label: "5시간", value: formatCodexWindowSummary(usage.primary) },
      { label: "주간", value: formatCodexWindowSummary(usage.secondary) }
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
        { label: "플랜", value: "확인 중" },
        { label: "5시간", value: "확인 중" },
        { label: "주간", value: "확인 중" }
      ],
      detail: canLogin ? "Claude CLI 로그인이 필요합니다." : "Claude 로컬 사용 로그를 읽고 있습니다.",
      canLogin,
      actionLabel: "Claude CLI 로그인 시작"
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
        { label: "플랜", value: "확인 불가" },
        { label: "5시간", value: "확인 불가" },
        { label: "주간", value: "확인 불가" }
      ],
      detail: canLogin ? "Claude CLI 로그인 후 사용량을 다시 확인할 수 있습니다." : usage.error,
      canLogin,
      actionLabel: "Claude CLI 로그인 시작"
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
      { label: "플랜", value: usage.planType ?? "로컬 로그" },
      { label: "5시간", value: formatClaudeWindowSummary(usage.oauth?.fiveHour ?? null, usage.windows.fiveHour) },
      { label: "주간", value: formatClaudeWindowSummary(usage.oauth?.sevenDay ?? null, usage.windows.sevenDay) }
    ],
    detail: extraUsage ?? `최근 갱신 ${formatTime(usage.updatedAt)}`,
    canLogin: canLogin || needsCliUsageLink,
    actionLabel: canLogin ? "Claude CLI 로그인 시작" : "Claude CLI 연동"
  };
}

function buildGeminiProvider(usage: GeminiUsageResult | null): ProviderUsage {
  if (usage == null) {
    return {
      id: "gemini",
      name: "Antigravity",
      source: "Google",
      status: "loading",
      plan: "확인 중",
      session: "확인 중",
      used: "확인 중",
      remaining: "확인 중",
      reset: "확인 중",
      fields: [
        { label: "플랜", value: "확인 중" },
        { label: "Pro", value: "확인 중" },
        { label: "Flash", value: "확인 중" },
        { label: "Flash Lite", value: "확인 중" }
      ],
      detail: "Gemini CLI OAuth quota API에서 Antigravity 사용량을 읽고 있습니다."
    };
  }

  if (!usage.ok) {
    return {
      id: "gemini",
      name: "Antigravity",
      source: "Google",
      status: "error",
      plan: "확인 불가",
      session: "Google OAuth 확인 필요",
      used: "확인 불가",
      remaining: "확인 불가",
      reset: "확인 불가",
      fields: [
        { label: "플랜", value: "확인 불가" },
        { label: "Pro", value: "확인 불가" },
        { label: "Flash", value: "확인 불가" },
        { label: "Flash Lite", value: "확인 불가" }
      ],
      detail: usage.error
    };
  }

  return {
    id: "gemini",
    name: "Antigravity",
    source: "Google",
    status: "live",
    plan: usage.planType ?? "Google OAuth",
    session: usage.accountEmail ? "Google OAuth 연결됨" : "Google OAuth",
    used: formatGeminiWindows(usage.primary, usage.secondary, usage.tertiary, "used"),
    remaining: formatGeminiWindows(usage.primary, usage.secondary, usage.tertiary, "remaining"),
    reset: formatGeminiResets(usage.primary, usage.secondary, usage.tertiary),
    fields: [
      { label: "플랜", value: usage.planType ?? "Google OAuth" },
      { label: "Pro", value: formatGeminiWindowSummary(usage.primary) },
      { label: "Flash", value: formatGeminiWindowSummary(usage.secondary) },
      { label: "Flash Lite", value: formatGeminiWindowSummary(usage.tertiary) }
    ],
    detail: `기존 Gemini CLI quota API 기준 최근 갱신 ${formatTime(usage.updatedAt)}`
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

function makeGeminiError(error: string): GeminiUsageResult {
  return {
    ok: false,
    source: "gemini-cli-oauth",
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

function formatGeminiWindows(primary: GeminiUsageWindow | null, secondary: GeminiUsageWindow | null, tertiary: GeminiUsageWindow | null, mode: "used" | "remaining") {
  const key = mode === "used" ? "usedPercent" : "remainingPercent";
  const values = [
    primary ? `Pro ${primary[key]}%` : null,
    secondary ? `Flash ${secondary[key]}%` : null,
    tertiary ? `Flash Lite ${tertiary[key]}%` : null
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

function formatGeminiResets(primary: GeminiUsageWindow | null, secondary: GeminiUsageWindow | null, tertiary: GeminiUsageWindow | null) {
  const values = [
    primary?.resetsAt ? `Pro ${formatReset(primary.resetsAt)}` : null,
    secondary?.resetsAt ? `Flash ${formatReset(secondary.resetsAt)}` : null,
    tertiary?.resetsAt ? `Flash Lite ${formatReset(tertiary.resetsAt)}` : null
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
