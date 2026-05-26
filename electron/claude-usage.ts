import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ClaudeLogUsage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
};

type ClaudeLogMessage = {
  model?: string;
  id?: string;
  usage?: ClaudeLogUsage;
};

type ClaudeLogLine = {
  type?: string;
  timestamp?: string;
  requestId?: string;
  uuid?: string;
  message?: ClaudeLogMessage;
};

type UsageEntry = {
  key: string;
  timestamp: number;
  model: string;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ClaudeUsageResult =
  | {
      ok: true;
      source: "oauth+local-logs" | "local-logs";
      planType: string | null;
      oauth: ClaudeOAuthUsage | null;
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

export type ClaudeOAuthUsage = {
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
};

export type ClaudeOAuthWindow = {
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
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

// Keyed by absolute file path — persists across getClaudeUsage() calls within the process.
const fileEntryCache = new Map<string, { mtime: number; entries: Map<string, UsageEntry> }>();

export async function getClaudeUsage(): Promise<ClaudeUsageResult> {
  try {
    const oauth = await getClaudeOAuthUsage().catch(() => null);
    const roots = getClaudeProjectRoots();
    const files = roots.flatMap((root) => listJsonlFiles(root));

    if (files.length === 0) {
      return {
        ok: false,
        source: "local-logs",
        error: "Claude 로컬 사용 로그를 찾을 수 없습니다.",
        updatedAt: new Date().toISOString()
      };
    }

    const entriesByKey = new Map<string, UsageEntry>();
    for (const file of files) {
      readUsageEntriesCached(file, entriesByKey);
    }

    const entries = [...entriesByKey.values()];
    const now = Date.now();

    return {
      ok: true,
      source: oauth ? "oauth+local-logs" : "local-logs",
      planType: getClaudePlanType() ?? (oauth ? "Claude 구독" : "로컬 로그"),
      oauth,
      windows: {
        fiveHour: makeWindow("최근 5시간", entries, now - 5 * 60 * 60 * 1000),
        sevenDay: makeWindow("최근 7일", entries, now - 7 * 24 * 60 * 60 * 1000),
        thirtyDay: makeWindow("최근 30일", entries, now - 30 * 24 * 60 * 60 * 1000),
        allTime: makeWindow("전체 로그", entries, 0)
      },
      modelBreakdown: makeModelBreakdown(entries, now - 7 * 24 * 60 * 60 * 1000),
      logFileCount: files.length,
      lastActivityAt: entries.length > 0 ? new Date(entries.reduce((max, e) => Math.max(max, e.timestamp), 0)).toISOString() : null,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      source: "local-logs",
      error: error instanceof Error ? error.message : "Claude 사용 로그를 읽을 수 없습니다.",
      updatedAt: new Date().toISOString()
    };
  }
}

type ClaudeCredentials = {
  claudeAiOauth?: {
    accessToken?: string;
    subscriptionType?: string;
    rateLimitTier?: string;
  };
};

type ClaudeOAuthUsageResponse = {
  five_hour?: { utilization?: number | null; resets_at?: string | null } | null;
  seven_day?: { utilization?: number | null; resets_at?: string | null } | null;
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number | null;
    used_credits?: number | null;
    utilization?: number | null;
    currency?: string | null;
    disabled_reason?: string | null;
  } | null;
};

async function getClaudeOAuthUsage(): Promise<ClaudeOAuthUsage | null> {
  const credentials = readClaudeCredentials();
  const token = credentials?.claudeAiOauth?.accessToken;
  if (!token) {
    return null;
  }

  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "anthropic-beta": "oauth-2025-04-20"
    }
  });

  if (!response.ok) {
    throw new Error(`Claude OAuth usage API ${response.status}`);
  }

  const json = (await response.json()) as ClaudeOAuthUsageResponse;
  return {
    fiveHour: makeOAuthWindow("5시간 한도", json.five_hour ?? null),
    sevenDay: makeOAuthWindow("이번 주 한도", json.seven_day ?? null),
    extraUsage: json.extra_usage
      ? {
          isEnabled: Boolean(json.extra_usage.is_enabled),
          monthlyLimit: numberOrNull(json.extra_usage.monthly_limit),
          usedCredits: numberOrNull(json.extra_usage.used_credits),
          utilization: numberOrNull(json.extra_usage.utilization),
          currency: json.extra_usage.currency ?? null,
          disabledReason: json.extra_usage.disabled_reason ?? null
        }
      : null
  };
}

function makeOAuthWindow(label: string, value: ClaudeOAuthUsageResponse["five_hour"]): ClaudeOAuthWindow | null {
  if (!value || value.utilization == null) {
    return null;
  }

  const usedPercent = clampPercent(value.utilization);
  return {
    label,
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
    resetsAt: value.resets_at ?? null
  };
}

function readClaudeCredentials(): ClaudeCredentials | null {
  const configured = process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, ".credentials.json") : null;
  const candidates = [
    configured,
    path.join(os.homedir(), ".claude", ".credentials.json")
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8")) as ClaudeCredentials;
    } catch {
      // Try the next known credentials path.
    }
  }

  return null;
}

function getClaudePlanType() {
  const credentials = readClaudeCredentials();
  const type = credentials?.claudeAiOauth?.subscriptionType;
  if (type) {
    return type;
  }

  try {
    const globalConfig = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8")) as {
      oauthAccount?: { organizationType?: string; billingType?: string };
    };
    return globalConfig.oauthAccount?.organizationType ?? globalConfig.oauthAccount?.billingType ?? null;
  } catch {
    return null;
  }
}

function getClaudeProjectRoots() {
  const configured = process.env.CLAUDE_CONFIG_DIR
    ?.split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((root) => path.join(root, "projects")) ?? [];

  return [
    ...configured,
    path.join(os.homedir(), ".config", "claude", "projects"),
    path.join(os.homedir(), ".claude", "projects")
  ].filter((root, index, all) => fs.existsSync(root) && all.indexOf(root) === index);
}

function listJsonlFiles(root: string) {
  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function readUsageEntries(file: string, entriesByKey: Map<string, UsageEntry>) {
  const content = fs.readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let parsed: ClaudeLogLine;
    try {
      parsed = JSON.parse(line) as ClaudeLogLine;
    } catch {
      continue;
    }

    if (parsed.type !== "assistant" || !parsed.timestamp || !parsed.message?.usage) {
      continue;
    }

    const timestamp = Date.parse(parsed.timestamp);
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const usage = parsed.message.usage;
    const inputTokens = safeNumber(usage.input_tokens);
    const cacheCreationTokens = safeNumber(usage.cache_creation_input_tokens);
    const cacheReadTokens = safeNumber(usage.cache_read_input_tokens);
    const outputTokens = safeNumber(usage.output_tokens);
    const key = parsed.requestId ?? parsed.message.id ?? parsed.uuid ?? `${file}:${timestamp}`;

    entriesByKey.set(key, {
      key,
      timestamp,
      model: parsed.message.model ?? "unknown",
      inputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      outputTokens,
      totalTokens: inputTokens + cacheCreationTokens + cacheReadTokens + outputTokens
    });
  }
}

function readUsageEntriesCached(file: string, entriesByKey: Map<string, UsageEntry>) {
  let mtime: number;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return;
  }

  const cached = fileEntryCache.get(file);
  if (cached && cached.mtime === mtime) {
    for (const [key, entry] of cached.entries) {
      entriesByKey.set(key, entry);
    }
    return;
  }

  const fresh = new Map<string, UsageEntry>();
  readUsageEntries(file, fresh);
  fileEntryCache.set(file, { mtime, entries: fresh });
  for (const [key, entry] of fresh) {
    entriesByKey.set(key, entry);
  }
}

function makeWindow(label: string, entries: UsageEntry[], since: number): ClaudeUsageWindow {
  const selected = entries.filter((entry) => entry.timestamp >= since);

  return {
    label,
    tokens: sum(selected, "totalTokens"),
    inputTokens: sum(selected, "inputTokens"),
    cacheCreationTokens: sum(selected, "cacheCreationTokens"),
    cacheReadTokens: sum(selected, "cacheReadTokens"),
    outputTokens: sum(selected, "outputTokens"),
    requestCount: selected.length,
    since: new Date(since).toISOString()
  };
}

function makeModelBreakdown(entries: UsageEntry[], since: number) {
  const byModel = new Map<string, number>();

  for (const entry of entries) {
    if (entry.timestamp < since) {
      continue;
    }

    byModel.set(entry.model, (byModel.get(entry.model) ?? 0) + entry.totalTokens);
  }

  return [...byModel.entries()]
    .map(([model, tokens]) => ({ model, tokens }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 4);
}

function sum(entries: UsageEntry[], key: keyof Pick<UsageEntry, "totalTokens" | "inputTokens" | "cacheCreationTokens" | "cacheReadTokens" | "outputTokens">) {
  return entries.reduce((total, entry) => total + entry[key], 0);
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}
