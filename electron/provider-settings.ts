import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export type ProviderSettings = {
  codexExecutablePath: string | null;
};

export const defaultProviderSettings: ProviderSettings = {
  codexExecutablePath: null
};

function getProviderSettingsPath() {
  return path.join(app.getPath("userData"), "provider-settings.json");
}

export function loadProviderSettings(): ProviderSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(getProviderSettingsPath(), "utf8")) as Partial<ProviderSettings>;
    return normalizeProviderSettings(parsed);
  } catch {
    return defaultProviderSettings;
  }
}

export function saveProviderSettings(settings: ProviderSettings) {
  const normalized = normalizeProviderSettings(settings);
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(getProviderSettingsPath(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function normalizeProviderSettings(value: Partial<ProviderSettings>): ProviderSettings {
  const configuredPath = typeof value.codexExecutablePath === "string"
    ? value.codexExecutablePath.trim()
    : "";

  return {
    codexExecutablePath: configuredPath || null
  };
}
