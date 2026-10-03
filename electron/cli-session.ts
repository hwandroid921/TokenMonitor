import { spawn } from "node:child_process";
import { type CodexUsageResult, getCodexUsage } from "./codex-usage.js";
import { createClaudeOAuthEnvironment } from "./claude-oauth-env.js";
import { getClaudeCommands, claudeInvocation } from "./claude-command.js";
import { observeAccount, type AccountAliasState } from "./account-aliases.js";

export type CliSessionStatus = {
  provider: "codex" | "claude";
  ok: boolean;
  installed: boolean;
  nodeReady: boolean;
  loggedIn: boolean;
  authMethod: string | null;
  subscription?: "supported" | "unsupported" | "unknown";
  subscriptionType?: string | null;
  cliVersion?: string | null;
  npxAvailable?: boolean;
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
  const { claude: claudeCommand, npx: npxCommand } = getClaudeCommands();
  const nodeReady = Boolean(npxCommand);
  const versionResult = claudeCommand ? await runJsonCommand(claudeCommand, ["--version"], 5000, environment) : null;
  const installed = Boolean(versionResult?.ok);
  const direct = claudeCommand
    ? await runJsonCommand(claudeCommand, ["auth", "status", "--json"], 5000, environment)
    : { ok: false as const, error: "Claude CLI를 찾을 수 없습니다." };
  const result = direct.ok || !npxCommand
    ? direct
    : await runJsonCommand(npxCommand, ["-y", "@anthropic-ai/claude-code", "auth", "status", "--json"], 30000, environment);

  if (!result.ok || typeof result.data?.loggedIn !== "boolean") {
    return {
      provider: "claude",
      ok: false,
      installed,
      npxAvailable: Boolean(npxCommand),
      nodeReady,
      loggedIn: false,
      authMethod: null,
      account: emptyAccountState(),
      detail: nodeReady
        ? result.ok ? "Claude CLI의 로그인 상태 응답을 읽지 못했습니다. Claude Code를 업데이트한 뒤 다시 확인해 주세요." : result.error
        : "Node.js LTS와 npm이 필요합니다.",
      checkedAt
    };
  }

  const loggedIn = result.data?.loggedIn === true;
  const authMethod = typeof result.data?.authMethod === "string" ? result.data.authMethod : null;
  const apiProvider = typeof result.data?.apiProvider === "string" ? result.data.apiProvider : null;
  const account = readAccount(result.data);
  const subscriptionType = typeof result.data.subscriptionType === "string" ? result.data.subscriptionType.toLowerCase() : null;
  const subscription = !loggedIn ? "unknown"
    : !["oauth", "claudeai", "claude.ai"].includes(authMethod ?? "") ? (authMethod ? "unsupported" : "unknown")
    : subscriptionType ? (["pro", "max", "team", "enterprise"].includes(subscriptionType) ? "supported" : "unsupported")
    : "unknown";

  return {
    provider: "claude",
    ok: true,
    installed,
    cliVersion: versionResult?.ok ? String(versionResult.data.version ?? "") : null,
    npxAvailable: Boolean(npxCommand),
    nodeReady,
    loggedIn,
    authMethod,
    subscription,
    subscriptionType: subscriptionType && ["pro", "max", "team", "enterprise", "free"].includes(subscriptionType) ? subscriptionType : null,
    account,
    detail: loggedIn ? `로그인됨${apiProvider ? ` (${apiProvider})` : ""}` : "로그인되지 않음",
    checkedAt
  };
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
      const invocation = claudeInvocation(command, args);
      child = spawn(invocation.command, invocation.args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: false,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
        env
      });
    } catch (error) {
      resolve({ ok: false, error: "Claude CLI를 실행하지 못했습니다. 설치 상태를 확인한 뒤 앱을 다시 실행해 주세요." });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => finish({ ok: false, error: "Claude CLI의 응답이 늦어 로그인 상태를 확인하지 못했습니다. 잠시 후 새로고침해 주세요." }), timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      finish({ ok: false, error: "Claude CLI를 실행하지 못했습니다. 설치 상태를 확인한 뒤 앱을 다시 실행해 주세요." });
    });

    child.on("close", () => {
      try {
        if (args.length === 1 && args[0] === "--version") {
          if (!/^\d+\.\d+\.\d+.*Claude Code/i.test(stdout.trim())) throw new Error("Invalid version");
          finish({ ok: true, data: { version: stdout.trim() } });
          return;
        }
        const data = JSON.parse(stdout.trim());
        if (!data || typeof data !== "object" || typeof data.loggedIn !== "boolean") throw new Error("Invalid auth status");
        finish({ ok: true, data });
      } catch {
        finish({ ok: false, error: "Claude CLI의 로그인 상태 응답을 읽지 못했습니다. Claude Code를 업데이트한 뒤 다시 확인해 주세요." });
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
