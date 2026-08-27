import fs from "node:fs";
import path from "node:path";

export type AlertProviderId = "codex" | "claude" | "antigravity";

export type NotificationSettings = {
  enabled: boolean;
  windowsNotifications: boolean;
  alwaysOnTopAlerts: boolean;
  overlayWarnings: boolean;
  notifyExhausted: boolean;
  notifyReset: boolean;
  thresholds: number[];
  providers: Record<AlertProviderId, boolean>;
};

export const availableThresholds = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

export const defaultNotificationSettings: NotificationSettings = {
  enabled: false,
  windowsNotifications: true,
  alwaysOnTopAlerts: false,
  overlayWarnings: true,
  notifyExhausted: true,
  notifyReset: true,
  thresholds: [10, 20, 30],
  providers: {
    codex: true,
    claude: true,
    antigravity: true
  }
};

let settingsPath = "";
let settings = defaultNotificationSettings;

export function initializeNotificationSettings(userDataPath: string) {
  settingsPath = path.join(userDataPath, "notification-settings.json");
  settings = readSettings();
  return settings;
}

export function getNotificationSettings() {
  return settings;
}

export function updateNotificationSettings(value: Partial<NotificationSettings>) {
  settings = normalizeNotificationSettings(value);
  writeJsonAtomically(settingsPath, settings);
  return settings;
}

export function normalizeNotificationSettings(value: Partial<NotificationSettings> | null | undefined): NotificationSettings {
  const thresholdSet = new Set(availableThresholds);
  const thresholds = Array.isArray(value?.thresholds)
    ? [...new Set(value.thresholds.filter((item): item is number => Number.isInteger(item) && thresholdSet.has(item as typeof availableThresholds[number])))]
        .sort((a, b) => a - b)
    : defaultNotificationSettings.thresholds;

  return {
    enabled: Boolean(value?.enabled ?? defaultNotificationSettings.enabled),
    windowsNotifications: Boolean(value?.windowsNotifications ?? defaultNotificationSettings.windowsNotifications),
    alwaysOnTopAlerts: Boolean(value?.alwaysOnTopAlerts ?? defaultNotificationSettings.alwaysOnTopAlerts),
    overlayWarnings: Boolean(value?.overlayWarnings ?? defaultNotificationSettings.overlayWarnings),
    notifyExhausted: Boolean(value?.notifyExhausted ?? defaultNotificationSettings.notifyExhausted),
    notifyReset: Boolean(value?.notifyReset ?? defaultNotificationSettings.notifyReset),
    thresholds,
    providers: {
      codex: Boolean(value?.providers?.codex ?? defaultNotificationSettings.providers.codex),
      claude: Boolean(value?.providers?.claude ?? defaultNotificationSettings.providers.claude),
      antigravity: Boolean(value?.providers?.antigravity ?? defaultNotificationSettings.providers.antigravity)
    }
  };
}

function readSettings() {
  try {
    return normalizeNotificationSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Partial<NotificationSettings>);
  } catch {
    return defaultNotificationSettings;
  }
}

function writeJsonAtomically(targetPath: string, value: unknown) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, targetPath);
}
