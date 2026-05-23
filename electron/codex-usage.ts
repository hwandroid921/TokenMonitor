import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

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
    email?: string;
    planType?: string;
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
  hasAccountEmail: boolean;
  primary: CodexUsageWindow | null;
  secondary: CodexUsageWindow | null;
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
  const rpc = new JsonRpcClient();

  try {
    await rpc.request("initialize", { clientInfo: { name: "token-monitor", version: "0.1.0" } }, 12000);
    rpc.notify("initialized");

    const limitsResult = await rpc.request<RpcRateLimitsResponse>("account/rateLimits/read", {}, 6000);
    const accountResult = await rpc.request<RpcAccountResponse>("account/read", {}, 6000).catch(() => null);
    const rateLimits = limitsResult.rateLimits;

    return {
      ok: true,
      source: "codex-app-server",
      accountType: accountResult?.account?.type ?? null,
      planType: accountResult?.account?.planType ?? rateLimits?.planType ?? null,
      hasAccountEmail: Boolean(accountResult?.account?.email),
      primary: makeWindow("5시간 한도", rateLimits?.primary ?? null),
      secondary: makeWindow("이번 주 한도", rateLimits?.secondary ?? null),
      credits: makeCredits(rateLimits?.credits ?? null),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      source: "codex-app-server",
      error: error instanceof Error ? error.message : "Codex 사용량을 읽을 수 없습니다.",
      updatedAt: new Date().toISOString()
    };
  } finally {
    rpc.close();
  }
}

function makeWindow(label: string, value: RpcRateWindow | null): CodexUsageWindow | null {
  if (!value) {
    return null;
  }

  const usedPercent = clampPercent(value.usedPercent);

  return {
    label,
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
    windowMinutes: value.windowDurationMins ?? null,
    resetsAt: value.resetsAt ? new Date(value.resetsAt * 1000).toISOString() : null
  };
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
  if (process.env.CODEX_CLI_PATH) {
    return process.env.CODEX_CLI_PATH;
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe");
  }

  return "codex";
}
