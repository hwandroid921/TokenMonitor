export type AccountIdentity = {
  name: string | null;
  nickname: string | null;
  email: string | null;
  source: string;
};

type AccountIdentityInput = {
  name?: unknown;
  displayName?: unknown;
  nickname?: unknown;
  preferredUsername?: unknown;
  email?: unknown;
};

export function makeAccountIdentity(input: AccountIdentityInput, source: string): AccountIdentity | null {
  const name = cleanIdentityValue(input.displayName ?? input.name, 100);
  const nickname = cleanIdentityValue(input.nickname ?? input.preferredUsername, 80);
  const email = cleanEmail(input.email);

  if (!name && !nickname && !email) {
    return null;
  }

  return { name, nickname, email, source };
}

export function readAccountIdentity(value: unknown, source: string): AccountIdentity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return makeAccountIdentity(
    {
      name: record.name ?? record.fullName,
      displayName: record.displayName,
      nickname: record.nickname,
      preferredUsername: record.preferredUsername ?? record.preferred_username ?? record.username,
      email: record.email
    },
    source
  );
}

function cleanIdentityValue(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maxLength || looksLikeSecret(cleaned)) {
    return null;
  }
  return cleaned;
}

function cleanEmail(value: unknown) {
  const cleaned = cleanIdentityValue(value, 254);
  if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function looksLikeSecret(value: string) {
  return /^(?:Bearer\s+|ya29\.|1\/\/)/i.test(value) || /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}
