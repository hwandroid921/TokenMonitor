import fs from "node:fs";

export type ClaudeUsageWindow = {
  label: "5시간" | "주간";
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
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

type ClaudeStatusLineSnapshot = {
  version?: unknown;
  capturedAt?: unknown;
  model?: { id?: unknown; displayName?: unknown } | null;
  fiveHour?: StatusLineWindow | null;
  sevenDay?: StatusLineWindow | null;
};

type StatusLineWindow = {
  usedPercent?: unknown;
  remainingPercent?: unknown;
  resetsAt?: unknown;
};

const snapshotStaleAfterMs = 10 * 60 * 1000;

export function getClaudeUsage(snapshotPath: string): ClaudeUsageResult {
  const updatedAt = new Date().toISOString();

  let parsed: ClaudeStatusLineSnapshot;
  try {
    parsed = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as ClaudeStatusLineSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return makeError("Claude Code에서 대화를 시작하면 사용량을 확인할 수 있습니다.", updatedAt);
    }
    return makeError("Claude Status Line 사용량 정보를 읽을 수 없습니다.", updatedAt);
  }

  const capturedAt = asIsoDate(parsed.capturedAt);
  if (!capturedAt) {
    return makeError("Claude Status Line 사용량 정보 형식이 올바르지 않습니다.", updatedAt);
  }

  const fiveHour = makeWindow("5시간", parsed.fiveHour);
  const sevenDay = makeWindow("주간", parsed.sevenDay);
  const capturedAtMs = Date.parse(capturedAt);

  return {
    ok: true,
    source: "claude-code-statusline",
    model: parsed.model && typeof parsed.model === "object"
      ? { id: asString(parsed.model.id), displayName: asString(parsed.model.displayName) }
      : null,
    fiveHour,
    sevenDay,
    capturedAt,
    stale: Number.isFinite(capturedAtMs) && Date.now() - capturedAtMs > snapshotStaleAfterMs,
    updatedAt
  };
}

function makeWindow(label: ClaudeUsageWindow["label"], value: StatusLineWindow | null | undefined): ClaudeUsageWindow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const usedPercent = asPercent(value.usedPercent);
  const remainingPercent = asPercent(value.remainingPercent);
  if (usedPercent == null || remainingPercent == null) {
    return null;
  }

  return { label, usedPercent, remainingPercent, resetsAt: asIsoDate(value.resetsAt) };
}

function asPercent(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

function asIsoDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function makeError(error: string, updatedAt: string): Extract<ClaudeUsageResult, { ok: false }> {
  return { ok: false, source: "claude-code-statusline", error, updatedAt };
}
