import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const statusLineFileName = "claude-statusline.cjs";
const legacyStatusLineFileName = "claude-statusline.ps1";
const snapshotFileName = "claude-statusline.json";

export type ClaudeStatusLineSetupResult =
  | { ok: true; snapshotPath: string; detail: string }
  | { ok: false; detail: string };

export function getClaudeStatusLineSnapshotPath(userDataPath: string) {
  return path.join(userDataPath, snapshotFileName);
}

/**
 * Installs the app-owned Status Line command without reading authentication
 * files. Existing custom Status Line commands are preserved and reported.
 */
export function ensureClaudeStatusLine(userDataPath: string): ClaudeStatusLineSetupResult {
  const snapshotPath = getClaudeStatusLineSnapshotPath(userDataPath);
  const scriptPath = path.join(userDataPath, statusLineFileName);

  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(scriptPath, makeStatusLineScript(snapshotPath), "utf8");
  } catch {
    return { ok: false, detail: "Claude Status Line 수집 도구를 준비할 수 없습니다." };
  }

  const settingsPath = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    if (fs.existsSync(settingsPath)) {
      const value = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, detail: "Claude 설정 파일 형식이 올바르지 않습니다." };
      }
      settings = value as Record<string, unknown>;
    }
  } catch {
    return { ok: false, detail: "Claude 설정 파일을 안전하게 읽을 수 없습니다." };
  }

  const existingStatusLine = settings.statusLine;
  if (existingStatusLine && !isTokenMonitorStatusLine(existingStatusLine, scriptPath)) {
    return { ok: false, detail: "기존 Claude Status Line 설정을 유지했습니다. Token Monitor 수집용 Status Line을 별도로 설정하세요." };
  }

  settings.statusLine = {
    type: "command",
    command: makeStatusLineCommand(scriptPath),
    refreshInterval: 60
  };

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    writeJsonAtomically(settingsPath, settings);
  } catch {
    return { ok: false, detail: "Claude Status Line 설정을 저장할 수 없습니다." };
  }

  return { ok: true, snapshotPath, detail: "Claude Status Line 수집이 준비되었습니다. Claude Code에서 대화를 시작하세요." };
}

function isTokenMonitorStatusLine(value: unknown, scriptPath: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const command = (value as { command?: unknown }).command;
  if (typeof command !== "string") {
    return false;
  }
  const legacyScriptPath = path.join(path.dirname(scriptPath), legacyStatusLineFileName);
  return command === makeStatusLineCommand(scriptPath)
    || command.toLocaleLowerCase() === `powershell -noprofile -executionpolicy bypass -file ${quotePowerShellArgument(legacyScriptPath)}`.toLocaleLowerCase()
    || isPreviousTokenMonitorStatusLine(command);
}

function isPreviousTokenMonitorStatusLine(command: string) {
  const match = command.match(/"([^"]*claude-statusline\.cjs)"/i);
  const scriptPath = match?.[1];
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    return false;
  }

  try {
    const script = fs.readFileSync(scriptPath, "utf8");
    return script.includes("const snapshotPath =")
      && script.includes("rate_limits?.five_hour")
      && script.includes("claude-statusline.json");
  } catch {
    return false;
  }
}

function writeJsonAtomically(targetPath: string, value: Record<string, unknown>) {
  const temporaryPath = `${targetPath}.token-monitor.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, targetPath);
}

function quotePowerShellArgument(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function makeStatusLineCommand(scriptPath: string) {
  const executable = quoteShellArgument(process.execPath);
  const script = quoteShellArgument(scriptPath);
  return process.platform === "win32"
    ? `set ELECTRON_RUN_AS_NODE=1&& ${executable} ${script}`
    : `ELECTRON_RUN_AS_NODE=1 ${executable} ${script}`;
}

function quoteShellArgument(value: string) {
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function makeStatusLineScript(snapshotPath: string) {
  return `const fs = require("node:fs");
const snapshotPath = ${JSON.stringify(snapshotPath)};
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const percent = (value) => typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value)) * 10) / 10 : null;
const resetAt = (value) => {
  const timestamp = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (Number.isFinite(timestamp)) {
    const date = new Date(timestamp * 1000);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  }
  const raw = text(value);
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
};
const windowValue = (value) => { const usedPercent = percent(value?.used_percentage); return usedPercent == null ? null : { usedPercent, remainingPercent: Math.round((100 - usedPercent) * 10) / 10, resetsAt: resetAt(value?.resets_at) }; };
let payload;
try { payload = JSON.parse(fs.readFileSync(0, "utf8")); } catch { console.log("Claude"); process.exit(0); }
const fiveHour = windowValue(payload?.rate_limits?.five_hour);
const sevenDay = windowValue(payload?.rate_limits?.seven_day);
const modelName = text(payload?.model?.display_name);
const snapshot = { version: 1, capturedAt: new Date().toISOString(), model: { id: text(payload?.model?.id), displayName: modelName }, fiveHour, sevenDay };
try { fs.writeFileSync(snapshotPath + ".tmp", JSON.stringify(snapshot), "utf8"); fs.renameSync(snapshotPath + ".tmp", snapshotPath); } catch { }
const parts = [modelName, fiveHour && "5h " + fiveHour.remainingPercent + "%", sevenDay && "weekly " + sevenDay.remainingPercent + "%"].filter(Boolean);
console.log(parts.join(" | ") || "Waiting for usage");
`;
}
