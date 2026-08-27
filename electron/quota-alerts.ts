import fs from "node:fs";
import path from "node:path";
import type { ClaudeUsageResult } from "./claude-usage.js";
import type { CodexUsageResult } from "./codex-usage.js";
import type { GeminiUsageResult } from "./gemini-usage.js";
import type { AlertProviderId, NotificationSettings } from "./notification-settings.js";

export type QuotaWindowType = "weekly" | "periodic";

export type NormalizedQuotaSample = {
  key: string;
  provider: AlertProviderId;
  providerLabel: string;
  windowType: QuotaWindowType;
  windowLabel: string;
  modelId: string | null;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
  collectedAt: string;
};

export type QuotaAlertEvent = {
  kind: "threshold" | "exhausted" | "reset";
  quotaKey: string;
  provider: AlertProviderId;
  title: string;
  body: string;
};

type StoredQuotaState = {
  remainingPercent: number;
  usedPercent: number;
  resetsAt: string | null;
  firedThresholds: number[];
  exhaustedNotified: boolean;
  lastResetSignature: string | null;
  collectedAt: string;
};

type StoredAlertState = {
  version: 1;
  quotas: Record<string, StoredQuotaState>;
};

let statePath = "";
let alertState: StoredAlertState = { version: 1, quotas: {} };

export function initializeQuotaAlertState(userDataPath: string) {
  statePath = path.join(userDataPath, "notification-state.json");
  alertState = readState();
}

export function normalizeQuotaSamples(
  codex: CodexUsageResult,
  claude: ClaudeUsageResult,
  gemini: GeminiUsageResult
): NormalizedQuotaSample[] {
  const samples: NormalizedQuotaSample[] = [];

  if (codex.ok) {
    addWindow(samples, "codex", "ChatGPT", "weekly", "주간", codex.weekly, codex.updatedAt);
    addWindow(samples, "codex", "ChatGPT", "periodic", codex.periodic?.label ?? "주기", codex.periodic, codex.updatedAt);
  }

  if (claude.ok && !claude.stale) {
    addWindow(samples, "claude", "Claude", "weekly", "주간", claude.sevenDay, claude.capturedAt);
    addWindow(samples, "claude", "Claude", "periodic", "5시간", claude.fiveHour, claude.capturedAt);
  }

  if (gemini.ok) {
    const weekly = pickAntigravityModel(gemini.models, true);
    const periodic = pickAntigravityModel(gemini.models, false);
    addModel(samples, gemini.source, "weekly", "주간", weekly, gemini.updatedAt);
    addModel(samples, gemini.source, "periodic", "5시간", periodic, gemini.updatedAt);
  }

  return samples;
}

export function evaluateQuotaAlerts(samples: NormalizedQuotaSample[], settings: NotificationSettings) {
  const events: QuotaAlertEvent[] = [];
  for (const sample of samples) {
    const previous = alertState.quotas[sample.key];
    if (!previous) {
      alertState.quotas[sample.key] = makeStoredState(sample);
      continue;
    }

    const resetConfirmed = Boolean(
      previous.resetsAt
      && sample.resetsAt
      && previous.resetsAt !== sample.resetsAt
      && sample.remainingPercent - previous.remainingPercent >= 5
      && previous.usedPercent - sample.usedPercent >= 5
    );
    let firedThresholds = resetConfirmed ? [] : [...previous.firedThresholds];
    let exhaustedNotified = resetConfirmed ? false : previous.exhaustedNotified;

    if (settings.enabled && settings.providers[sample.provider]) {
      if (resetConfirmed && settings.notifyReset) {
        events.push({
          kind: "reset",
          quotaKey: sample.key,
          provider: sample.provider,
          title: `${sample.providerLabel} ${sample.windowLabel} 사용량 초기화`,
          body: `잔여량이 ${formatPercent(sample.remainingPercent)}로 갱신되었습니다.${formatNextReset(sample.resetsAt)}`
        });
      } else if (settings.notifyExhausted && sample.remainingPercent <= 0.5 && previous.remainingPercent > 0.5 && !exhaustedNotified) {
        events.push({
          kind: "exhausted",
          quotaKey: sample.key,
          provider: sample.provider,
          title: `${sample.providerLabel} ${sample.windowLabel} 사용량 소진`,
          body: `잔여량이 모두 소진되었습니다.${formatNextReset(sample.resetsAt)}`
        });
        exhaustedNotified = true;
      } else {
        const crossed = settings.thresholds.filter((threshold) =>
          previous.remainingPercent > threshold
          && sample.remainingPercent <= threshold
          && !firedThresholds.includes(threshold)
        );
        if (crossed.length > 0) {
          const reachedThreshold = Math.min(...crossed);
          events.push({
            kind: "threshold",
            quotaKey: sample.key,
            provider: sample.provider,
            title: `${sample.providerLabel} ${sample.windowLabel} 잔여량 경고`,
            body: `잔여량이 ${reachedThreshold}% 이하로 감소했습니다. 현재 ${formatPercent(sample.remainingPercent)}입니다.${formatNextReset(sample.resetsAt)}`
          });
          firedThresholds = [...new Set([...firedThresholds, ...crossed])];
        }
      }
    }

    alertState.quotas[sample.key] = {
      remainingPercent: sample.remainingPercent,
      usedPercent: sample.usedPercent,
      resetsAt: sample.resetsAt,
      firedThresholds,
      exhaustedNotified,
      lastResetSignature: resetConfirmed ? sample.resetsAt : previous.lastResetSignature,
      collectedAt: sample.collectedAt
    };
  }

  pruneMissingQuotaState(samples);
  writeState();
  return events;
}

export function getUpcomingResetTimes(samples: NormalizedQuotaSample[]) {
  const now = Date.now();
  return samples
    .map((sample) => ({ sample, time: sample.resetsAt ? Date.parse(sample.resetsAt) : Number.NaN }))
    .filter((item) => Number.isFinite(item.time) && item.time > now)
    .sort((a, b) => a.time - b.time);
}

function addWindow(
  samples: NormalizedQuotaSample[],
  provider: Extract<AlertProviderId, "codex" | "claude">,
  providerLabel: string,
  windowType: QuotaWindowType,
  windowLabel: string,
  window: { usedPercent: number; remainingPercent: number; resetsAt: string | null } | null,
  collectedAt: string
) {
  if (!window) {
    return;
  }
  samples.push({
    key: `${provider}:${windowType}`,
    provider,
    providerLabel,
    windowType,
    windowLabel,
    modelId: null,
    usedPercent: window.usedPercent,
    remainingPercent: window.remainingPercent,
    resetsAt: window.resetsAt,
    collectedAt
  });
}

function addModel(
  samples: NormalizedQuotaSample[],
  source: string,
  windowType: QuotaWindowType,
  windowLabel: string,
  model: { modelId: string; usedPercent: number; remainingPercent: number; resetsAt: string | null } | null,
  collectedAt: string
) {
  if (!model) {
    return;
  }
  samples.push({
    key: `antigravity:${source}:${windowType}:${model.modelId}`,
    provider: "antigravity",
    providerLabel: "Antigravity",
    windowType,
    windowLabel,
    modelId: model.modelId,
    usedPercent: model.usedPercent,
    remainingPercent: model.remainingPercent,
    resetsAt: model.resetsAt,
    collectedAt
  });
}

function pickAntigravityModel<T extends { modelId: string; label: string; remainingPercent: number; isAutocompleteOnly?: boolean }>(models: T[], weekly: boolean): T | null {
  const candidates = models.filter((model) => {
    const isWeekly = /\b(weekly|week|seven[-_\s]?day|7[-_\s]?day)\b|주간|7일/i.test(`${model.modelId} ${model.label}`);
    return !model.isAutocompleteOnly && isWeekly === weekly;
  });
  return candidates.reduce<T | null>((current, model) => !current || model.remainingPercent < current.remainingPercent ? model : current, null);
}

function makeStoredState(sample: NormalizedQuotaSample): StoredQuotaState {
  return {
    remainingPercent: sample.remainingPercent,
    usedPercent: sample.usedPercent,
    resetsAt: sample.resetsAt,
    firedThresholds: [],
    exhaustedNotified: sample.remainingPercent <= 0.5,
    lastResetSignature: null,
    collectedAt: sample.collectedAt
  };
}

function formatPercent(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

function formatNextReset(value: string | null) {
  if (!value) {
    return "";
  }
  const formatted = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  return ` 다음 초기화는 ${formatted}입니다.`;
}

function pruneMissingQuotaState(samples: NormalizedQuotaSample[]) {
  const activeKeys = new Set(samples.map((sample) => sample.key));
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [key, value] of Object.entries(alertState.quotas)) {
    if (!activeKeys.has(key) && Date.parse(value.collectedAt) < cutoff) {
      delete alertState.quotas[key];
    }
  }
}

function readState(): StoredAlertState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as StoredAlertState;
    return parsed.version === 1 && parsed.quotas && typeof parsed.quotas === "object" ? parsed : { version: 1, quotas: {} };
  } catch {
    return { version: 1, quotas: {} };
  }
}

function writeState() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(alertState, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, statePath);
}
