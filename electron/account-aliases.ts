import { safeStorage } from "electron";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { maskEmail } from "./masked-email.js";

export type AccountProvider = "codex" | "claude" | "google";
export type AccountIdentityConfidence = "verified" | "inferred";
type LegacyAccountProvider = AccountProvider | "gemini-apps" | "antigravity";

export type AccountAliasState = {
  detected: boolean;
  alias: string | null;
  aliasRequired: boolean;
  accountChanged: boolean;
  confidence: AccountIdentityConfidence | null;
};

export type AccountAliasView = {
  recordId: string;
  provider: AccountProvider;
  maskedEmail: string;
  alias: string | null;
  isCurrent: boolean;
  confidence: AccountIdentityConfidence;
  createdAt: string;
  lastSeenAt: string;
};

type StoredAccountAlias = {
  recordId: string;
  provider: AccountProvider;
  identityKey: string;
  maskedEmail: string;
  alias: string | null;
  confidence: AccountIdentityConfidence;
  createdAt: string;
  lastSeenAt: string;
};

type StoredAliasFile = {
  version: 1;
  accounts: unknown[];
  lastCurrent?: Partial<Record<LegacyAccountProvider, string>>;
};

type CurrentAccount = {
  identityKey: string;
  confidence: AccountIdentityConfidence;
  accountChanged: boolean;
};

let aliasFilePath = "";
let keyFilePath = "";
let identitySecret: Buffer | null = null;
let accounts: StoredAccountAlias[] = [];
let initialized = false;
let persistenceAvailable = false;
const currentAccounts = new Map<AccountProvider, CurrentAccount>();
const persistedCurrentAccounts = new Map<AccountProvider, string>();

export function initializeAccountAliases(userDataPath: string) {
  if (initialized) {
    return;
  }

  aliasFilePath = path.join(userDataPath, "account-aliases.dat");
  keyFilePath = path.join(userDataPath, "account-alias-key.dat");
  fs.mkdirSync(userDataPath, { recursive: true });
  persistenceAvailable = safeStorage.isEncryptionAvailable();
  identitySecret = loadOrCreateIdentitySecret();
  accounts = loadAccounts();
  initialized = true;
}

export function observeAccount(
  provider: AccountProvider,
  email: unknown,
  confidence: AccountIdentityConfidence = "verified"
): AccountAliasState {
  ensureInitialized();
  const normalizedEmail = normalizeEmail(email);
  const maskedEmail = maskEmail(normalizedEmail);
  if (!normalizedEmail || !maskedEmail || !identitySecret) {
    return emptyAccountState();
  }

  const identityKey = makeIdentityKey(provider, normalizedEmail);
  const previousIdentityKey = currentAccounts.get(provider)?.identityKey ?? persistedCurrentAccounts.get(provider);
  const accountChanged = Boolean(previousIdentityKey && previousIdentityKey !== identityKey);
  const now = new Date().toISOString();
  let record = accounts.find((item) => item.provider === provider && item.identityKey === identityKey);

  if (!record) {
    record = {
      recordId: randomUUID(),
      provider,
      identityKey,
      maskedEmail,
      alias: null,
      confidence,
      createdAt: now,
      lastSeenAt: now
    };
    accounts.push(record);
  } else {
    record.maskedEmail = maskedEmail;
    record.confidence = confidence;
    record.lastSeenAt = now;
  }

  currentAccounts.set(provider, { identityKey, confidence, accountChanged });
  persistedCurrentAccounts.set(provider, identityKey);
  saveAccounts();
  return makePublicState(record, accountChanged);
}

export function getCurrentAccountState(provider: AccountProvider): AccountAliasState {
  ensureInitialized();
  const current = currentAccounts.get(provider);
  if (!current) {
    return emptyAccountState();
  }

  const record = accounts.find((item) => item.provider === provider && item.identityKey === current.identityKey);
  if (!record) {
    return {
      detected: true,
      alias: null,
      aliasRequired: true,
      accountChanged: current.accountChanged,
      confidence: current.confidence
    };
  }
  return makePublicState(record, current.accountChanged);
}

export function listAccountAliases(): AccountAliasView[] {
  ensureInitialized();
  return accounts
    .map((record) => ({
      recordId: record.recordId,
      provider: record.provider,
      maskedEmail: record.maskedEmail,
      alias: record.alias,
      isCurrent: currentAccounts.get(record.provider)?.identityKey === record.identityKey,
      confidence: record.confidence,
      createdAt: record.createdAt,
      lastSeenAt: record.lastSeenAt
    }))
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export function renameAccountAlias(recordId: string, value: unknown) {
  ensureInitialized();
  const alias = normalizeAlias(value);
  const record = accounts.find((item) => item.recordId === recordId);
  if (!record) {
    return { ok: false as const, detail: "별칭을 변경할 계정을 찾을 수 없습니다." };
  }
  if (!alias) {
    return { ok: false as const, detail: "별칭은 1~24자의 이메일이 아닌 이름으로 입력하세요." };
  }

  record.alias = alias;
  saveAccounts();
  return { ok: true as const, account: listAccountAliases().find((item) => item.recordId === recordId) ?? null };
}

export function deleteAccountAlias(recordId: string) {
  ensureInitialized();
  const next = accounts.filter((item) => item.recordId !== recordId);
  if (next.length === accounts.length) {
    return { ok: false as const, detail: "삭제할 계정 별칭을 찾을 수 없습니다." };
  }
  accounts = next;
  saveAccounts();
  return { ok: true as const };
}

export function deleteProviderAliases(provider: AccountProvider) {
  ensureInitialized();
  accounts = accounts.filter((item) => item.provider !== provider);
  saveAccounts();
  return { ok: true as const };
}

export function deleteAllAccountAliases() {
  ensureInitialized();
  accounts = [];
  saveAccounts();
  return { ok: true as const };
}

function makePublicState(record: StoredAccountAlias, accountChanged: boolean): AccountAliasState {
  return {
    detected: true,
    alias: record.alias,
    aliasRequired: !record.alias,
    accountChanged,
    confidence: record.confidence
  };
}

function emptyAccountState(): AccountAliasState {
  return {
    detected: false,
    alias: null,
    aliasRequired: false,
    accountChanged: false,
    confidence: null
  };
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLocaleLowerCase();
  return maskEmail(normalized) ? normalized : null;
}

function normalizeAlias(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 24 || normalized.includes("@")) {
    return null;
  }
  if (/https?:\/\/|\b(?:ya29|1\/\/|bearer)\S*/i.test(normalized)) {
    return null;
  }
  return normalized;
}

function makeIdentityKey(provider: AccountProvider, normalizedEmail: string) {
  const namespace = provider === "google" ? "google-account" : provider;
  return createHmac("sha256", identitySecret!).update(`${namespace}\0${normalizedEmail}`, "utf8").digest("base64url");
}

function loadOrCreateIdentitySecret() {
  if (!persistenceAvailable) {
    return randomBytes(32);
  }
  try {
    if (fs.existsSync(keyFilePath)) {
      return Buffer.from(safeStorage.decryptString(fs.readFileSync(keyFilePath)), "base64");
    }
  } catch {
    // Replace an unreadable local key. Existing aliases will remain encrypted and unavailable.
  }

  const secret = randomBytes(32);
  writeFileAtomically(keyFilePath, safeStorage.encryptString(secret.toString("base64")));
  return secret;
}

function loadAccounts(): StoredAccountAlias[] {
  if (!persistenceAvailable || !fs.existsSync(aliasFilePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(safeStorage.decryptString(fs.readFileSync(aliasFilePath))) as StoredAliasFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) {
      return [];
    }
    for (const provider of ["codex", "claude", "google"] as AccountProvider[]) {
      const identityKey = provider === "google"
        ? parsed.lastCurrent?.google ?? parsed.lastCurrent?.["gemini-apps"] ?? parsed.lastCurrent?.antigravity
        : parsed.lastCurrent?.[provider];
      if (typeof identityKey === "string" && identityKey) {
        persistedCurrentAccounts.set(provider, identityKey);
      }
    }
    return mergeStoredAccounts(parsed.accounts.filter(isStoredAccountAlias).map((record) => ({
      ...record,
      provider: normalizeStoredProvider(record.provider)
    })));
  } catch {
    return [];
  }
}

function saveAccounts() {
  if (!persistenceAvailable) {
    return;
  }
  const value: StoredAliasFile = {
    version: 1,
    accounts,
    lastCurrent: Object.fromEntries(persistedCurrentAccounts) as Partial<Record<AccountProvider, string>>
  };
  writeFileAtomically(aliasFilePath, safeStorage.encryptString(JSON.stringify(value)));
}

function writeFileAtomically(targetPath: string, value: Buffer) {
  const temporaryPath = `${targetPath}.tmp`;
  fs.writeFileSync(temporaryPath, value);
  fs.renameSync(temporaryPath, targetPath);
}

function isStoredAccountAlias(value: unknown): value is Omit<StoredAccountAlias, "provider"> & { provider: LegacyAccountProvider } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<Omit<StoredAccountAlias, "provider"> & { provider: LegacyAccountProvider }>;
  return typeof record.recordId === "string"
    && ["codex", "claude", "google", "gemini-apps", "antigravity"].includes(record.provider ?? "")
    && typeof record.identityKey === "string"
    && typeof record.maskedEmail === "string"
    && (record.alias == null || typeof record.alias === "string")
    && (record.confidence === "verified" || record.confidence === "inferred")
    && typeof record.createdAt === "string"
    && typeof record.lastSeenAt === "string";
}

function normalizeStoredProvider(provider: LegacyAccountProvider): AccountProvider {
  return provider === "gemini-apps" || provider === "antigravity" ? "google" : provider;
}

function mergeStoredAccounts(values: StoredAccountAlias[]) {
  const merged = new Map<string, StoredAccountAlias>();
  for (const value of values) {
    const key = `${value.provider}:${value.identityKey}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, value);
      continue;
    }
    const newer = value.lastSeenAt > existing.lastSeenAt ? value : existing;
    const older = newer === value ? existing : value;
    merged.set(key, {
      ...newer,
      alias: newer.alias ?? older.alias,
      confidence: existing.confidence === "verified" || value.confidence === "verified" ? "verified" : "inferred",
      createdAt: existing.createdAt < value.createdAt ? existing.createdAt : value.createdAt,
      lastSeenAt: existing.lastSeenAt > value.lastSeenAt ? existing.lastSeenAt : value.lastSeenAt
    });
  }
  return [...merged.values()];
}

function ensureInitialized() {
  if (!initialized) {
    throw new Error("Account alias storage is not initialized.");
  }
}
