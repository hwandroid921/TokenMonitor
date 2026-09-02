import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const statusLineFileName = "claude-statusline.cjs";
const legacyStatusLineFileName = "claude-statusline.ps1";
const snapshotFileName = "claude-statusline.json";
const backupFileName = "claude-statusline-backup.json";

export type ClaudeStatusLineSetupResult =
  | { ok: true; snapshotPath: string; detail: string }
  | { ok: false; detail: string; requiresIntegration?: boolean };

export type ClaudeStatusLineRegistrationStatus = {
  state: "registered" | "needs-registration" | "error";
  mode: "standalone" | "bridge" | "custom" | "none";
  registered: boolean;
  scriptReady: boolean;
  snapshotAvailable: boolean;
  backupAvailable: boolean;
  detail: string;
};

type ClaudeStatusLineSetupOptions = { integrateExisting?: boolean };
type StatusLineConfig = Record<string, unknown>;
type ClaudeStatusLineBackup = { version: 1; statusLine: StatusLineConfig; bridgeCommand: string };

export function getClaudeStatusLineSnapshotPath(userDataPath: string) {
  return path.join(userDataPath, snapshotFileName);
}

export function getClaudeStatusLineRegistrationStatus(userDataPath: string): ClaudeStatusLineRegistrationStatus {
  const scriptPath = path.join(userDataPath, statusLineFileName);
  const scriptReady = fs.existsSync(scriptPath);
  const snapshotAvailable = fs.existsSync(getClaudeStatusLineSnapshotPath(userDataPath));
  const backup = readClaudeStatusLineBackup(userDataPath);
  const backupAvailable = backup?.bridgeCommand === makeStatusLineCommand(scriptPath);
  const settingsPath = getClaudeSettingsPath();
  let settings: Record<string, unknown>;

  try {
    if (!fs.existsSync(settingsPath)) {
      return registration("needs-registration", "none", false, scriptReady, snapshotAvailable, backupAvailable, "Claude Status Line 등록이 필요합니다.");
    }
    settings = readSettings(settingsPath);
  } catch {
    return registration("error", "none", false, scriptReady, snapshotAvailable, backupAvailable, "Claude Status Line 설정을 확인할 수 없습니다.");
  }

  if (scriptReady && isTokenMonitorStatusLine(settings.statusLine, scriptPath)) {
    const mode = backupAvailable ? "bridge" : "standalone";
    return registration(
      "registered",
      mode,
      true,
      true,
      snapshotAvailable,
      backupAvailable,
      mode === "bridge"
        ? "기존 Claude Status Line 표시를 유지하는 Token Monitor 브리지가 등록되었습니다."
        : "Token Monitor Claude Status Line이 등록되었습니다."
    );
  }

  if (isStatusLineConfig(settings.statusLine)) {
    return registration("needs-registration", "custom", false, scriptReady, snapshotAvailable, backupAvailable, "기존 Claude Status Line이 감지되었습니다. 통합 모드로 등록하면 기존 표시를 유지하면서 사용량을 수집합니다.");
  }
  return registration("needs-registration", "none", false, scriptReady, snapshotAvailable, backupAvailable, "Claude Status Line 등록이 필요합니다.");
}

/** Registers Token Monitor alone, or a bridge that preserves an existing command Status Line. */
export function ensureClaudeStatusLine(userDataPath: string, options: ClaudeStatusLineSetupOptions = {}): ClaudeStatusLineSetupResult {
  const snapshotPath = getClaudeStatusLineSnapshotPath(userDataPath);
  const scriptPath = path.join(userDataPath, statusLineFileName);
  const settingsPath = getClaudeSettingsPath();
  let settings: Record<string, unknown> = {};

  try {
    if (fs.existsSync(settingsPath)) {
      settings = readSettings(settingsPath);
    }
  } catch {
    return { ok: false, detail: "Claude 설정 파일을 안전하게 읽을 수 없습니다." };
  }

  const existingStatusLine = asStatusLineConfig(settings.statusLine);
  const existingIsTokenMonitor = Boolean(existingStatusLine && isTokenMonitorStatusLine(existingStatusLine, scriptPath));
  if (existingStatusLine && !existingIsTokenMonitor) {
    if (!isCommandStatusLine(existingStatusLine)) {
      return { ok: false, detail: "기존 Claude Status Line 형식을 자동으로 통합할 수 없습니다. 기존 설정을 유지했습니다." };
    }
    if (!options.integrateExisting) {
      return {
        ok: false,
        requiresIntegration: true,
        detail: "기존 Claude Status Line이 감지되었습니다. 통합하면 기존 표시는 유지하고 Token Monitor 사용량 수집을 함께 실행합니다."
      };
    }
  }

  const existingBackup = existingIsTokenMonitor ? readClaudeStatusLineBackup(userDataPath) : null;
  const originalCommand = existingIsTokenMonitor
    ? existingBackup?.bridgeCommand === makeStatusLineCommand(scriptPath) ? getStatusLineCommand(existingBackup.statusLine) : null
    : existingStatusLine ? getStatusLineCommand(existingStatusLine) : null;
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(scriptPath, makeStatusLineScript(snapshotPath, originalCommand), "utf8");
  } catch {
    return { ok: false, detail: "Claude Status Line 수집 도구를 준비할 수 없습니다." };
  }

  const isBridge = Boolean(existingStatusLine && !existingIsTokenMonitor && originalCommand);
  if (isBridge && existingStatusLine) {
    try {
      writeJsonAtomically(getClaudeStatusLineBackupPath(userDataPath), { version: 1, statusLine: existingStatusLine, bridgeCommand: makeStatusLineCommand(scriptPath) });
    } catch {
      return { ok: false, detail: "기존 Claude Status Line 백업을 저장할 수 없어 통합을 중단했습니다." };
    }
  }

  settings.statusLine = {
    ...(existingStatusLine ?? {}),
    type: "command",
    command: makeStatusLineCommand(scriptPath),
    refreshInterval: getRefreshInterval(existingStatusLine) ?? 60
  };
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    writeJsonAtomically(settingsPath, settings);
  } catch {
    if (isBridge) removeClaudeStatusLineBackup(userDataPath);
    return { ok: false, detail: "Claude Status Line 설정을 저장할 수 없습니다." };
  }

  return {
    ok: true,
    snapshotPath,
    detail: isBridge
      ? "기존 Claude Status Line 표시를 유지하는 Token Monitor 브리지를 등록했습니다. 원래 설정은 안전하게 백업되었습니다."
      : "Token Monitor Claude Status Line 수집 스크립트를 등록했습니다. Claude Code에서 대화를 시작하세요."
  };
}

export function restoreClaudeStatusLine(userDataPath: string): ClaudeStatusLineSetupResult {
  const backup = readClaudeStatusLineBackup(userDataPath);
  if (!backup) return { ok: false, detail: "복원할 기존 Claude Status Line 백업이 없습니다." };

  const settingsPath = getClaudeSettingsPath();
  const scriptPath = path.join(userDataPath, statusLineFileName);
  let settings: Record<string, unknown>;
  try {
    settings = fs.existsSync(settingsPath) ? readSettings(settingsPath) : {};
  } catch {
    return { ok: false, detail: "Claude 설정 파일을 안전하게 읽을 수 없습니다." };
  }
  if (!isTokenMonitorStatusLine(settings.statusLine, scriptPath) || backup.bridgeCommand !== makeStatusLineCommand(scriptPath)) {
    return { ok: false, detail: "현재 Claude Status Line이 Token Monitor 브리지가 아니므로 기존 설정을 덮어쓰지 않았습니다." };
  }

  settings.statusLine = backup.statusLine;
  try {
    writeJsonAtomically(settingsPath, settings);
    removeClaudeStatusLineBackup(userDataPath);
  } catch {
    return { ok: false, detail: "기존 Claude Status Line을 복원하지 못했습니다." };
  }
  return { ok: true, snapshotPath: getClaudeStatusLineSnapshotPath(userDataPath), detail: "기존 Claude Status Line을 복원했습니다. Token Monitor 사용량 수집은 중지됩니다." };
}

function registration(
  state: ClaudeStatusLineRegistrationStatus["state"],
  mode: ClaudeStatusLineRegistrationStatus["mode"],
  registered: boolean,
  scriptReady: boolean,
  snapshotAvailable: boolean,
  backupAvailable: boolean,
  detail: string
): ClaudeStatusLineRegistrationStatus {
  return { state, mode, registered, scriptReady, snapshotAvailable, backupAvailable, detail };
}

function getClaudeSettingsPath() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "settings.json");
}

function getClaudeStatusLineBackupPath(userDataPath: string) {
  return path.join(userDataPath, backupFileName);
}

function readSettings(settingsPath: string): Record<string, unknown> {
  const value = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Claude settings");
  return value as Record<string, unknown>;
}

function readClaudeStatusLineBackup(userDataPath: string): ClaudeStatusLineBackup | null {
  try {
    const value = JSON.parse(fs.readFileSync(getClaudeStatusLineBackupPath(userDataPath), "utf8")) as Partial<ClaudeStatusLineBackup>;
    return value.version === 1 && isStatusLineConfig(value.statusLine) && typeof value.bridgeCommand === "string"
      ? { version: 1, statusLine: value.statusLine, bridgeCommand: value.bridgeCommand }
      : null;
  } catch {
    return null;
  }
}

function removeClaudeStatusLineBackup(userDataPath: string) {
  try { fs.rmSync(getClaudeStatusLineBackupPath(userDataPath), { force: true }); } catch { /* stale backup does not change active settings */ }
}

function asStatusLineConfig(value: unknown): StatusLineConfig | null {
  return isStatusLineConfig(value) ? value : null;
}

function isStatusLineConfig(value: unknown): value is StatusLineConfig {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCommandStatusLine(value: StatusLineConfig) {
  return value.type === "command" && typeof value.command === "string" && value.command.trim().length > 0;
}

function getStatusLineCommand(value: StatusLineConfig) {
  return typeof value.command === "string" ? value.command.trim() : null;
}

function getRefreshInterval(value: StatusLineConfig | null) {
  const interval = value?.refreshInterval;
  return typeof interval === "number" && Number.isFinite(interval) && interval >= 1 ? interval : null;
}

function isTokenMonitorStatusLine(value: unknown, scriptPath: string) {
  const config = asStatusLineConfig(value);
  const command = config ? getStatusLineCommand(config) : null;
  if (!command) return false;
  const legacyScriptPath = path.join(path.dirname(scriptPath), legacyStatusLineFileName);
  return command === makeStatusLineCommand(scriptPath)
    || command.toLocaleLowerCase() === `powershell -noprofile -executionpolicy bypass -file ${quotePowerShellArgument(legacyScriptPath)}`.toLocaleLowerCase()
    || isPreviousTokenMonitorStatusLine(command);
}

function isPreviousTokenMonitorStatusLine(command: string) {
  const match = command.match(/"([^"]*claude-statusline\.cjs)"/i);
  const scriptPath = match?.[1];
  if (!scriptPath || !fs.existsSync(scriptPath)) return false;
  try {
    const script = fs.readFileSync(scriptPath, "utf8");
    return script.includes("const snapshotPath =") && script.includes("rate_limits?.five_hour") && script.includes("claude-statusline.json");
  } catch {
    return false;
  }
}

function writeJsonAtomically(targetPath: string, value: unknown) {
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
  return process.platform === "win32" ? `set ELECTRON_RUN_AS_NODE=1&& ${executable} ${script}` : `ELECTRON_RUN_AS_NODE=1 ${executable} ${script}`;
}

function quoteShellArgument(value: string) {
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function makeStatusLineScript(snapshotPath: string, originalCommand: string | null) {
  return `const fs = require("node:fs");
const { spawn } = require("node:child_process");
const snapshotPath = ${JSON.stringify(snapshotPath)};
const originalCommand = ${JSON.stringify(originalCommand)};
const originalCommandTimeoutMs = 3000;
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const percent = (value) => typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value)) * 10) / 10 : null;
const resetAt = (value) => {
  const timestamp = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (Number.isFinite(timestamp)) { const date = new Date(timestamp * 1000); return Number.isNaN(date.valueOf()) ? null : date.toISOString(); }
  const raw = text(value); return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
};
const windowValue = (value) => { const usedPercent = percent(value?.used_percentage); return usedPercent == null ? null : { usedPercent, remainingPercent: Math.round((100 - usedPercent) * 10) / 10, resetsAt: resetAt(value?.resets_at) }; };
function writeSnapshot(payload) {
  const fiveHour = windowValue(payload?.rate_limits?.five_hour); const sevenDay = windowValue(payload?.rate_limits?.seven_day); const modelName = text(payload?.model?.display_name);
  const snapshot = { version: 1, capturedAt: new Date().toISOString(), model: { id: text(payload?.model?.id), displayName: modelName }, fiveHour, sevenDay };
  try { fs.writeFileSync(snapshotPath + ".tmp", JSON.stringify(snapshot), "utf8"); fs.renameSync(snapshotPath + ".tmp", snapshotPath); } catch { }
  return { modelName, fiveHour, sevenDay };
}
function runOriginalStatusLine(command, input) {
  return new Promise((resolve) => {
    let settled = false; const finish = (output) => { if (!settled) { settled = true; resolve(output); } }; let child;
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    try { child = spawn(command, { shell: true, windowsHide: true, stdio: ["pipe", "pipe", "ignore"], env }); } catch { finish(""); return; }
    const chunks = []; let length = 0;
    child.stdout.on("data", (chunk) => { if (length < 8192) { const next = Buffer.from(chunk); chunks.push(next); length += next.length; } });
    child.on("error", () => finish("")); child.on("close", () => finish(Buffer.concat(chunks).toString("utf8")));
    const timer = setTimeout(() => { try { child.kill(); } catch { } finish(""); }, originalCommandTimeoutMs);
    child.on("close", () => clearTimeout(timer));
    try { child.stdin.end(input); } catch { finish(""); }
  });
}
async function main() {
  const input = fs.readFileSync(0, "utf8"); let payload = null; try { payload = JSON.parse(input); } catch { }
  const summary = writeSnapshot(payload);
  if (originalCommand) { const output = await runOriginalStatusLine(originalCommand, input); if (output.trim()) { process.stdout.write(output); return; } }
  const parts = [summary.modelName, summary.fiveHour && "5h " + summary.fiveHour.remainingPercent + "%", summary.sevenDay && "weekly " + summary.sevenDay.remainingPercent + "%"].filter(Boolean);
  process.stdout.write(parts.join(" | ") || "Waiting for usage");
}
void main().catch(() => process.stdout.write("Waiting for usage"));
`;
}
