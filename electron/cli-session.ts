import { spawn } from "node:child_process";
import { type CodexUsageResult, getCodexUsage } from "./codex-usage.js";

export type CliSessionStatus = {
  provider: "codex" | "claude";
  ok: boolean;
  installed: boolean;
  loggedIn: boolean;
  authMethod: string | null;
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
      loggedIn: false,
      authMethod: null,
      detail: usage.error,
      checkedAt
    };
  }

  return {
    provider: "codex",
    ok: true,
    installed: true,
    loggedIn: usage.hasAccountEmail || Boolean(usage.accountType || usage.planType),
    authMethod: usage.accountType,
    detail: usage.planType ? `플랜 ${usage.planType}` : "Codex 계정 확인됨",
    checkedAt
  };
}

async function getClaudeSession(): Promise<CliSessionStatus> {
  const checkedAt = new Date().toISOString();
  const direct = await runJsonCommand("claude", ["auth", "status", "--json"], 5000);
  const result = direct.ok ? direct : await runJsonCommand("npx.cmd", ["-y", "@anthropic-ai/claude-code", "auth", "status", "--json"], 30000);

  if (!result.ok) {
    return {
      provider: "claude",
      ok: false,
      installed: false,
      loggedIn: false,
      authMethod: null,
      detail: result.error,
      checkedAt
    };
  }

  const loggedIn = Boolean(result.data?.loggedIn);
  const authMethod = typeof result.data?.authMethod === "string" ? result.data.authMethod : null;
  const apiProvider = typeof result.data?.apiProvider === "string" ? result.data.apiProvider : null;

  return {
    provider: "claude",
    ok: true,
    installed: true,
    loggedIn,
    authMethod,
    detail: loggedIn ? `로그인됨${apiProvider ? ` (${apiProvider})` : ""}` : "로그인되지 않음",
    checkedAt
  };
}

function runJsonCommand(command: string, args: string[], timeoutMs: number): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32"
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
