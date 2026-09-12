import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type CodexUsageResult, getCodexUsage } from "./codex-usage.js";
import { createClaudeOAuthEnvironment } from "./claude-oauth-env.js";
import { observeAccount, type AccountAliasState } from "./account-aliases.js";

export type CliSessionStatus = {
  provider: "codex" | "claude";
  ok: boolean;
  installed: boolean;
  nodeReady: boolean;
  loggedIn: boolean;
  authMethod: string | null;
  account: AccountAliasState;
  detail: string;
  checkedAt: string;
};

export type CliSessionResult = {
  codex: CliSessionStatus;
  claude: CliSessionStatus;
};

export async function getCliSessionStatus(codexResult?: CodexUsageResult): Promise<CliSessionResult> {
  const [codex, claude] = await Promise.all([getCodexSession(codexResult), getClaudeSession()]);
  return { codex, claude };
}

async function getCodexSession(usageResult?: CodexUsageResult): Promise<CliSessionStatus> {
  const checkedAt = new Date().toISOString();
  const usage = usageResult ?? await getCodexUsage();

  if (!usage.ok) {
    return {
      provider: "codex",
      ok: false,
      installed: false,
      nodeReady: false,
      loggedIn: false,
      authMethod: null,
      account: emptyAccountState(),
      detail: usage.error,
      checkedAt
    };
  }

  return {
    provider: "codex",
    ok: true,
    installed: true,
    nodeReady: false,
    loggedIn: Boolean(usage.accountType || usage.planType),
    authMethod: usage.accountType,
    account: usage.account,
    detail: usage.planType ? `플랜 ${usage.planType}` : "ChatGPT 계정 확인됨",
    checkedAt
  };
}

async function getClaudeSession(): Promise<CliSessionStatus> {
  const checkedAt = new Date().toISOString();
  const environment = createClaudeOAuthEnvironment();
  const claudeCommand = findCommandOnPath(process.platform === "win32" ? ["claude.cmd", "claude.exe", "claude"] : ["claude"]);
  const npxCommand = findCommandOnPath(process.platform === "win32" ? ["npx.cmd", "npx.exe", "npx"] : ["npx"]);
  const nodeReady = Boolean(npxCommand);
  const direct = claudeCommand
    ? await runJsonCommand(claudeCommand, ["auth", "status", "--json"], 5000, environment)
    : { ok: false as const, error: "Claude CLI를 찾을 수 없습니다." };
  const result = direct.ok || !npxCommand
    ? direct
    : await runJsonCommand(npxCommand, ["-y", "@anthropic-ai/claude-code", "auth", "status", "--json"], 30000, environment);

  if (!result.ok) {
    return {
      provider: "claude",
      ok: false,
      installed: Boolean(claudeCommand || npxCommand),
      nodeReady,
      loggedIn: false,
      authMethod: null,
      account: emptyAccountState(),
      detail: nodeReady
        ? "Claude CLI 로그인 상태를 확인하지 못했습니다. Claude 로그인으로 다시 연결하세요."
        : "Node.js LTS와 npm이 필요합니다.",
      checkedAt
    };
  }

  const loggedIn = Boolean(result.data?.loggedIn);
  const authMethod = typeof result.data?.authMethod === "string" ? result.data.authMethod : null;
  const apiProvider = typeof result.data?.apiProvider === "string" ? result.data.apiProvider : null;
  const account = readAccount(result.data);

  return {
    provider: "claude",
    ok: true,
    installed: true,
    nodeReady,
    loggedIn,
    authMethod,
    account,
    detail: loggedIn ? `로그인됨${apiProvider ? ` (${apiProvider})` : ""}` : "로그인되지 않음",
    checkedAt
  };
}

function findCommandOnPath(candidates: string[]) {
  const directories = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const candidate of candidates) {
      const target = path.join(directory, candidate);
      try {
        if (fs.statSync(target).isFile()) {
          return target;
        }
      } catch {
        // Continue searching PATH candidates.
      }
    }
  }
  return null;
}

function readAccount(data: Record<string, unknown>) {
  const account = data.account && typeof data.account === "object" ? data.account as Record<string, unknown> : null;
  const user = data.user && typeof data.user === "object" ? data.user as Record<string, unknown> : null;
  return observeAccount("claude", data.email ?? account?.email ?? user?.email);
}

function emptyAccountState(): AccountAliasState {
  return { detected: false, alias: null, aliasRequired: false, accountChanged: false, confidence: null };
}

function runJsonCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  env?: NodeJS.ProcessEnv
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32",
        env
      });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : `${command} 실행 실패` });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => finish({ ok: false, error: `${command} 실행 시간이 초과되었습니다.` }), timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      finish({ ok: false, error: error.message });
    });

    child.on("close", () => {
      try {
        finish({ ok: true, data: JSON.parse(stdout.trim()) as Record<string, unknown> });
      } catch {
        finish({ ok: false, error: stderr.trim() || stdout.trim() || `${command} 출력 파싱 실패` });
      }
    });

    function finish(result: { ok: true; data: Record<string, unknown> } | { ok: false; error: string }) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (!child.killed) {
        child.kill();
      }
      resolve(result);
    }
  });
}
