import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { maskEmail } from "./masked-email.js";

export const activeChildProcesses = new Set<ChildProcess>();

let _appVersion = "0.0.0";
export function setAppVersion(version: string) { _appVersion = version; }

export function registerChildProcess(child: ChildProcess) {
  activeChildProcesses.add(child);
  child.on("exit", () => {
    activeChildProcesses.delete(child);
  });
  child.on("error", () => {
    activeChildProcesses.delete(child);
  });
}

export function killAllActiveChildProcesses() {
  for (const child of activeChildProcesses) {
    try {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    } catch {
      // Ignore
    }
  }
  activeChildProcesses.clear();
}


type RpcMessage = {
  id?: number;
  result?: unknown;
  error?: {
    message?: string;
  };
};

type RpcRateLimitsResponse = {
  rateLimits?: {
    primary?: RpcRateWindow | null;
    secondary?: RpcRateWindow | null;
    credits?: RpcCredits | null;
    planType?: string | null;
  };
};

type RpcAccountResponse = {
  account?: {
    type?: string;
    planType?: string;
    email?: string;
  } | null;
};

type RpcRateWindow = {
  usedPercent: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
};

type RpcCredits = {
  hasCredits: boolean;
  unlimited: boolean;
  balance?: string | null;
};

export type CodexUsageWindow = {
  label: string;
  usedPercent: number;
  remainingPercent: number;
  windowMinutes: number | null;
  resetsAt: string | null;
};

export type CodexUsageSnapshot = {
  ok: true;
  source: "codex-app-server";
  accountType: string | null;
  planType: string | null;
  maskedEmail: string | null;
  weekly: CodexUsageWindow | null;
  periodic: CodexUsageWindow | null;
  credits: {
    hasCredits: boolean;
    unlimited: boolean;
    balance: number | null;
  } | null;
  updatedAt: string;
};

export type CodexUsageResult =
  | CodexUsageSnapshot
  | {
      ok: false;
      source: "codex-app-server";
      error: string;
      updatedAt: string;
    };

class JsonRpcClient {
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, (message: RpcMessage) => void>();
  private readonly child = spawn(resolveCodexExecutable(), ["-s", "read-only", "-a", "untrusted", "app-server"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  constructor() {
    registerChildProcess(this.child);
    this.child.on("error", (error) => {
      for (const resolver of this.pending.values()) {
        resolver({ error: { message: error.message } });
      }
      this.pending.clear();
    });
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");

      let lineEnd = this.buffer.indexOf("\n");
      while (lineEnd >= 0) {
        const line = this.buffer.slice(0, lineEnd).trim();
        this.buffer = this.buffer.slice(lineEnd + 1);
        this.handleLine(line);
        lineEnd = this.buffer.indexOf("\n");
      }
    });
  }

  request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      this.pending.set(id, (message) => {
        clearTimeout(timeout);

        if (message.error) {
          reject(new Error(message.error.message ?? `${method} failed`));
          return;
        }

        resolve(message.result as T);
      });

      this.child.stdin.write(`${payload}\n`, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  notify(method: string, params: Record<string, unknown> = {}) {
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  close() {
    if (!this.child.killed) {
      this.child.kill();
    }
  }

  private handleLine(line: string) {
    if (!line) {
      return;
    }

    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }

    if (typeof message.id === "number") {
      const resolver = this.pending.get(message.id);
      if (resolver) {
        this.pending.delete(message.id);
        resolver(message);
      }
    }
  }
}

export async function getCodexUsage(): Promise<CodexUsageResult> {
  let rpc: JsonRpcClient | null = null;

  try {
    rpc = new JsonRpcClient();
    await rpc.request("initialize", { clientInfo: { name: "token-monitor", version: _appVersion } }, 12000);
    rpc.notify("initialized");

    const limitsResult = await rpc.request<RpcRateLimitsResponse>("account/rateLimits/read", {}, 6000);
    const accountResult = await rpc.request<RpcAccountResponse>("account/read", {}, 6000).catch(() => null);
    const rateLimits = limitsResult.rateLimits;

    return {
      ok: true,
      source: "codex-app-server",
      accountType: accountResult?.account?.type ?? null,
      planType: accountResult?.account?.planType ?? rateLimits?.planType ?? null,
      maskedEmail: maskEmail(accountResult?.account?.email),
      ...classifyRateWindows([rateLimits?.primary ?? null, rateLimits?.secondary ?? null]),
      credits: makeCredits(rateLimits?.credits ?? null),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      source: "codex-app-server",
      error: "ChatGPT 사용량을 읽을 수 없습니다. Codex Desktop 연결 상태를 확인하세요.",
      updatedAt: new Date().toISOString()
    };
  } finally {
    rpc?.close();
  }
}

function classifyRateWindows(values: Array<RpcRateWindow | null>) {
  const windows = values
    .map((value) => makeWindow(value))
    .filter((value): value is CodexUsageWindow => value != null);
  const weekly = windows.find((window) => window.windowMinutes != null && Math.abs(window.windowMinutes - 7 * 24 * 60) <= 60) ?? null;
  const periodic = windows.find((window) => window !== weekly) ?? null;
  return { weekly, periodic };
}

function makeWindow(value: RpcRateWindow | null): CodexUsageWindow | null {
  if (!value) {
    return null;
  }

  const usedPercent = clampPercent(value.usedPercent);

  return {
    label: formatWindowLabel(value.windowDurationMins ?? null),
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
    windowMinutes: value.windowDurationMins ?? null,
    resetsAt: value.resetsAt ? new Date(value.resetsAt * 1000).toISOString() : null
  };
}

function formatWindowLabel(windowMinutes: number | null) {
  if (windowMinutes != null && Math.abs(windowMinutes - 7 * 24 * 60) <= 60) {
    return "주간";
  }
  if (windowMinutes != null && Math.abs(windowMinutes - 5 * 60) <= 30) {
    return "주기 (5시간)";
  }
  return "주기";
}

function makeCredits(value: RpcCredits | null): CodexUsageSnapshot["credits"] {
  if (!value) {
    return null;
  }

  return {
    hasCredits: value.hasCredits,
    unlimited: value.unlimited,
    balance: value.balance == null ? null : Number(value.balance)
  };
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function resolveCodexExecutable() {
  const configuredPath = process.env.CODEX_CLI_PATH?.trim();
  if (configuredPath) {
    if (isExecutableFile(configuredPath)) {
      return configuredPath;
    }
    throw new Error(`CODEX_CLI_PATH is set but codex.exe was not found: ${configuredPath}`);
  }

  if (process.platform === "win32") {
    const resolved = resolveWindowsCodexExecutable();
    if (resolved) {
      return resolved;
    }
    throw new Error("Codex CLI executable was not found. Install or run Codex, or set CODEX_CLI_PATH to codex.exe.");
  }

  return "codex";
}

function resolveWindowsCodexExecutable() {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const directPath = path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe");
  if (isExecutableFile(directPath)) {
    return directPath;
  }

  const localBin = path.join(localAppData, "OpenAI", "Codex", "bin");
  const localCandidate = findNewestCodexExecutableInSubdirs(localBin);
  if (localCandidate) {
    return localCandidate;
  }

  const windowsAppsCandidate = findNewestCodexWindowsAppsExecutable();
  if (windowsAppsCandidate) {
    return windowsAppsCandidate;
  }

  return findCommandOnPath("codex.exe") ?? findCommandOnPath("codex.cmd") ?? findCommandOnPath("codex");
}

function findNewestCodexExecutableInSubdirs(root: string) {
  try {
    const candidates = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, "codex.exe"))
      .filter(isExecutableFile);
    return newestFile(candidates);
  } catch {
    return null;
  }
}

function findNewestCodexWindowsAppsExecutable() {
  const windowsAppsRoot = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "WindowsApps");
  try {
    const candidates = fs.readdirSync(windowsAppsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("OpenAI.Codex_"))
      .map((entry) => path.join(windowsAppsRoot, entry.name, "app", "resources", "codex.exe"))
      .filter(isExecutableFile);
    return newestFile(candidates);
  } catch {
    return null;
  }
}

function findCommandOnPath(command: string) {
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, command);
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }
  return null;
}

function newestFile(candidates: string[]) {
  return candidates
    .map((candidate) => ({ candidate, mtime: safeMtime(candidate) }))
    .filter((item) => item.mtime != null)
    .sort((a, b) => b.mtime! - a.mtime!)[0]?.candidate ?? null;
}

function isExecutableFile(candidate: string) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function safeMtime(candidate: string) {
  try {
    return fs.statSync(candidate).mtimeMs;
  } catch {
    return null;
  }
}
