import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Cached once per process — Gemini CLI install location doesn't change at runtime.
let oauthClientCache: { clientId: string; clientSecret: string } | null | undefined;

type GeminiOAuthCredentials = {
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
  idToken?: string;
  id_token?: string;
  expiryDate?: number | string;
  expiry_date?: number | string;
};

type GeminiQuotaModel = {
  modelId: string;
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
};

export type GeminiUsageWindow = {
  label: string;
  modelId: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
};

export type GeminiUsageResult =
  | {
      ok: true;
      source: "gemini-cli-oauth";
      planType: string | null;
      accountEmail: string | null;
      primary: GeminiUsageWindow | null;
      secondary: GeminiUsageWindow | null;
      tertiary: GeminiUsageWindow | null;
      models: GeminiQuotaModel[];
      updatedAt: string;
    }
  | {
      ok: false;
      source: "gemini-cli-oauth";
      error: string;
      updatedAt: string;
    };

const loadCodeAssistEndpoint = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const quotaEndpoint = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
const tokenRefreshEndpoint = "https://oauth2.googleapis.com/token";

export async function getGeminiUsage(): Promise<GeminiUsageResult> {
  try {
    const authType = readGeminiAuthType();
    if (authType === "api-key" || authType === "vertex-ai") {
      return makeError(`Gemini ${authType} 인증은 잔여 quota 조회를 지원하지 않습니다. Google OAuth 로그인을 사용하세요.`);
    }

    const credentials = readGeminiCredentials();
    if (!credentials) {
      return makeError("Gemini CLI OAuth credentials를 찾을 수 없습니다. gemini 실행 후 Google 로그인을 완료하세요.");
    }

    const accessToken = await getValidAccessToken(credentials);
    const claims = parseJwtClaims(readString(credentials.idToken ?? credentials.id_token));
    const assist = await loadCodeAssist(accessToken);
    const quota = await retrieveUserQuota(accessToken, assist.projectId);
    const models = parseQuotaModels(quota);

    if (models.length === 0) {
      return makeError("Gemini quota 응답에서 모델별 사용량을 찾을 수 없습니다.");
    }

    return {
      ok: true,
      source: "gemini-cli-oauth",
      planType: planFromTier(assist.tier, claims.hostedDomain),
      accountEmail: claims.email,
      primary: makeWindow("Gemini Pro", pickModel(models, "pro")),
      secondary: makeWindow("Gemini Flash", pickModel(models, "flash")),
      tertiary: makeWindow("Gemini Flash Lite", pickModel(models, "flash-lite")),
      models,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    return makeError(error instanceof Error ? error.message : "Gemini 사용량을 읽을 수 없습니다.");
  }
}

function makeError(error: string): GeminiUsageResult {
  return {
    ok: false,
    source: "gemini-cli-oauth",
    error,
    updatedAt: new Date().toISOString()
  };
}

function readGeminiAuthType() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".gemini", "settings.json"), "utf8")) as {
      security?: { auth?: { selectedType?: string } };
      selectedAuthType?: string;
    };
    return settings.security?.auth?.selectedType ?? settings.selectedAuthType ?? "unknown";
  } catch {
    return "unknown";
  }
}

function readGeminiCredentials(): GeminiOAuthCredentials | null {
  const candidates = [
    path.join(os.homedir(), ".gemini", "oauth_creds.json"),
    path.join(os.homedir(), ".gemini", "tokens.json")
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8")) as GeminiOAuthCredentials;
    } catch {
      // Try the next known Gemini credential location.
    }
  }

  return null;
}

async function getValidAccessToken(credentials: GeminiOAuthCredentials) {
  const accessToken = readString(credentials.accessToken ?? credentials.access_token);
  const expiryDate = readExpiryDate(credentials.expiryDate ?? credentials.expiry_date);
  if (accessToken && (!expiryDate || expiryDate.getTime() - Date.now() > 60_000)) {
    return accessToken;
  }

  const refreshToken = readString(credentials.refreshToken ?? credentials.refresh_token);
  if (!refreshToken) {
    throw new Error("Gemini OAuth access token이 만료되었고 refresh token이 없습니다.");
  }

  const client = await findOAuthClient();
  if (!client) {
    throw new Error("Gemini CLI OAuth client 정보를 찾을 수 없습니다. gemini를 다시 실행해 로그인 상태를 갱신하세요.");
  }

  const body = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch(tokenRefreshEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Gemini OAuth token refresh failed: HTTP ${response.status}`);
  }

  const json = (await response.json()) as { access_token?: string; id_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("Gemini OAuth token refresh 응답에 access token이 없습니다.");
  }

  saveRefreshedCredentials(credentials, {
    access_token: json.access_token,
    id_token: json.id_token,
    expires_in: json.expires_in
  });
  return json.access_token;
}

function saveRefreshedCredentials(credentials: GeminiOAuthCredentials, refreshed: { access_token: string; id_token?: string; expires_in?: number }) {
  const credentialsPath = path.join(os.homedir(), ".gemini", "oauth_creds.json");
  const next: GeminiOAuthCredentials = {
    ...credentials,
    access_token: refreshed.access_token,
    accessToken: credentials.accessToken ? refreshed.access_token : credentials.accessToken,
    id_token: refreshed.id_token ?? credentials.id_token,
    idToken: credentials.idToken ? refreshed.id_token ?? credentials.idToken : credentials.idToken,
    expiry_date: Date.now() + (refreshed.expires_in ?? 3600) * 1000
  };

  try {
    fs.writeFileSync(credentialsPath, JSON.stringify(next, null, 2));
  } catch {
    // A refreshed token is still usable for this request even if persisting fails.
  }
}

async function findOAuthClient(): Promise<{ clientId: string; clientSecret: string } | null> {
  if (oauthClientCache !== undefined) {
    return oauthClientCache;
  }

  const fromEnv = {
    clientId: process.env.GEMINI_OAUTH_CLIENT_ID,
    clientSecret: process.env.GEMINI_OAUTH_CLIENT_SECRET
  };
  if (fromEnv.clientId && fromEnv.clientSecret) {
    oauthClientCache = { clientId: fromEnv.clientId, clientSecret: fromEnv.clientSecret };
    return oauthClientCache;
  }

  const candidates = await findGeminiOAuthFiles();
  for (const candidate of candidates) {
    try {
      const content = fs.readFileSync(candidate, "utf8");
      const clientId = matchConstant(content, "OAUTH_CLIENT_ID");
      const clientSecret = matchConstant(content, "OAUTH_CLIENT_SECRET");
      if (clientId && clientSecret) {
        oauthClientCache = { clientId, clientSecret };
        return oauthClientCache;
      }
    } catch {
      // Keep searching known Gemini CLI install layouts.
    }
  }

  oauthClientCache = null;
  return null;
}

async function findGeminiOAuthFiles(): Promise<string[]> {
  const roots = [
    path.join(process.env.APPDATA ?? "", "npm", "node_modules", "@google", "gemini-cli"),
    path.join(process.env.LOCALAPPDATA ?? "", "fnm_multishells"),
    path.join(process.env.ProgramFiles ?? "", "nodejs", "node_modules", "@google", "gemini-cli")
  ].filter(Boolean);

  const geminiPaths = await resolveGeminiCliPaths();
  for (const geminiPath of geminiPaths) {
    roots.push(path.dirname(geminiPath));
  }

  const files = new Set<string>();
  for (const root of roots) {
    addOAuthFilesFromRoot(root, files, 0);
  }

  return [...files];
}

function resolveGeminiCliPaths(): Promise<string[]> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const child = spawn(cmd, ["gemini"], { windowsHide: true });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.on("close", () => resolve(stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)));
    child.on("error", () => resolve([]));
  });
}

function addOAuthFilesFromRoot(root: string, files: Set<string>, depth: number) {
  if (!root || depth > 7 || !fs.existsSync(root)) {
    return;
  }

  const direct = [
    path.join(root, "bundle"),
    path.join(root, "node_modules", "@google", "gemini-cli-core", "dist", "src", "code_assist", "oauth2.js"),
    path.join(root, "node_modules", "@google", "gemini-cli", "node_modules", "@google", "gemini-cli-core", "dist", "src", "code_assist", "oauth2.js"),
    path.join(root, "libexec", "lib", "node_modules", "@google", "gemini-cli", "node_modules", "@google", "gemini-cli-core", "dist", "src", "code_assist", "oauth2.js")
  ];

  for (const candidate of direct) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      files.add(candidate);
    }
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.add(path.join(root, entry.name));
      continue;
    }
    if (!entry.isDirectory()) {
      continue;
    }
    if (!["@google", "gemini-cli", "gemini-cli-core", "node_modules", "bundle", "dist", "src", "code_assist"].some((part) => entry.name.includes(part))) {
      continue;
    }
    addOAuthFilesFromRoot(path.join(root, entry.name), files, depth + 1);
  }
}

function matchConstant(content: string, name: string) {
  const pattern = new RegExp(`${name}["']?\\s*[:=]\\s*["']([^"']+)["']`);
  return content.match(pattern)?.[1] ?? null;
}

async function loadCodeAssist(accessToken: string): Promise<{ tier: string | null; projectId: string | null }> {
  const response = await fetch(loadCodeAssistEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ metadata: { ideType: "GEMINI_CLI", pluginType: "GEMINI" } })
  });

  if (!response.ok) {
    return { tier: null, projectId: null };
  }

  const json = (await response.json()) as Record<string, unknown>;
  return {
    tier: readNestedString(json, ["currentTier", "id"]),
    projectId: readProjectId(json)
  };
}

async function retrieveUserQuota(accessToken: string, projectId: string | null) {
  const response = await fetch(quotaEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: projectId ? JSON.stringify({ project: projectId }) : "{}"
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Gemini OAuth 세션이 만료되었거나 quota API 권한이 없습니다.");
  }
  if (!response.ok) {
    throw new Error(`Gemini quota API HTTP ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

function parseQuotaModels(value: unknown): GeminiQuotaModel[] {
  const models: GeminiQuotaModel[] = [];

  function visit(node: unknown) {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }

    const record = node as Record<string, unknown>;
    const remaining = readNumber(record.remainingFraction);
    const modelId = readString(record.modelId ?? record.model ?? record.modelName ?? record.id);

    if (remaining != null && modelId) {
      const label = readString(record.label ?? record.displayName ?? record.name) ?? modelId;
      models.push({
        modelId,
        label,
        usedPercent: clampPercent(100 - remaining * 100),
        remainingPercent: clampPercent(remaining * 100),
        resetsAt: readResetTime(record.resetTime ?? record.reset_time ?? record.resetAt ?? record.resetsAt)
      });
    }

    Object.values(record).forEach(visit);
  }

  visit(value);

  return dedupeModels(models).sort((a, b) => a.remainingPercent - b.remainingPercent);
}

function dedupeModels(models: GeminiQuotaModel[]) {
  const byKey = new Map<string, GeminiQuotaModel>();
  for (const model of models) {
    const key = `${model.modelId}:${model.label}`;
    const current = byKey.get(key);
    if (!current || model.remainingPercent < current.remainingPercent) {
      byKey.set(key, model);
    }
  }
  return [...byKey.values()];
}

function pickModel(models: GeminiQuotaModel[], family: "pro" | "flash" | "flash-lite") {
  const candidates = models.filter((model) => {
    const text = `${model.modelId} ${model.label}`.toLowerCase();
    if (family === "flash-lite") {
      return text.includes("flash-lite") || (text.includes("flash") && text.includes("lite"));
    }
    if (family === "flash") {
      return text.includes("flash") && !text.includes("lite");
    }
    return text.includes("pro");
  });

  return candidates[0] ?? null;
}

function makeWindow(label: string, model: GeminiQuotaModel | null): GeminiUsageWindow | null {
  if (!model) {
    return null;
  }
  return {
    label,
    modelId: model.modelId,
    usedPercent: model.usedPercent,
    remainingPercent: model.remainingPercent,
    resetsAt: model.resetsAt
  };
}

function planFromTier(tier: string | null, hostedDomain: string | null) {
  if (tier === "standard-tier") {
    return "Paid";
  }
  if (tier === "legacy-tier") {
    return "Legacy";
  }
  if (tier === "free-tier") {
    return hostedDomain ? "Workspace" : "Free";
  }
  return null;
}

function parseJwtClaims(token: string | null): { email: string | null; hostedDomain: string | null } {
  if (!token) {
    return { email: null, hostedDomain: null };
  }

  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; hd?: string };
    return {
      email: typeof decoded.email === "string" ? decoded.email : null,
      hostedDomain: typeof decoded.hd === "string" ? decoded.hd : null
    };
  } catch {
    return { email: null, hostedDomain: null };
  }
}

function readProjectId(json: Record<string, unknown>) {
  const direct = readString(json.cloudaicompanionProject);
  if (direct) {
    return direct;
  }
  const project = json.cloudaicompanionProject;
  if (project && typeof project === "object") {
    const record = project as Record<string, unknown>;
    return readString(record.id ?? record.projectId);
  }
  return null;
}

function readNestedString(value: Record<string, unknown>, pathParts: string[]) {
  let current: unknown = value;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return readString(current);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readExpiryDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 10_000_000_000 ? value * 1000 : value);
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return readExpiryDate(numeric);
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function readResetTime(value: unknown) {
  const text = readString(value);
  if (text) {
    const parsed = new Date(text);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const numeric = readNumber(value);
  if (numeric != null) {
    return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric).toISOString();
  }

  return null;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}
