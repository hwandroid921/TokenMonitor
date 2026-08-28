export type ProviderId = "codex" | "claude" | "gemini";

export type ProviderDisplaySettings = {
  enabled: boolean;
  showPlan: boolean;
  showSession: boolean;
  showUsed: boolean;
  showRemaining: boolean;
  showReset: boolean;
};

export type OverlaySettings = {
  enabled: boolean;
  closeToTray: boolean;
  providers: Record<ProviderId, boolean>;
  providerItems: Record<ProviderId, ProviderDisplaySettings>;
  showPlan: boolean;
  showSession: boolean;
  showUsed: boolean;
  showRemaining: boolean;
  showReset: boolean;
  opacity: number;
  fontSizePercent: number;
  position: OverlayPosition;
};

export type OverlayPosition = {
  mode: "default" | "custom";
  displayId?: number;
  right?: number;
  bottom?: number;
};

export const defaultOverlaySettings: OverlaySettings = {
  enabled: false,
  closeToTray: true,
  providers: {
    codex: true,
    claude: true,
    gemini: true
  },
  providerItems: {
    codex: { enabled: true, showPlan: true, showSession: true, showUsed: true, showRemaining: true, showReset: true },
    claude: { enabled: true, showPlan: true, showSession: true, showUsed: true, showRemaining: true, showReset: true },
    gemini: { enabled: true, showPlan: true, showSession: true, showUsed: true, showRemaining: true, showReset: true }
  },
  showPlan: true,
  showSession: true,
  showUsed: true,
  showRemaining: true,
  showReset: true,
  opacity: 50,
  fontSizePercent: 100,
  position: { mode: "default" }
};

export function normalizeOverlaySettings(value: Partial<OverlaySettings>): OverlaySettings {
  const providers = {
    ...defaultOverlaySettings.providers,
    ...(value.providers ?? {})
  };
  const providerItems = normalizeProviderItems(value, providers);

  return {
    ...defaultOverlaySettings,
    ...value,
    providers,
    providerItems,
    closeToTray: Boolean(value.closeToTray ?? defaultOverlaySettings.closeToTray),
    opacity: 50,
    fontSizePercent: normalizeFontSizePercent(value.fontSizePercent),
    position: normalizeOverlayPosition(value.position)
  };
}

function normalizeFontSizePercent(value: unknown) {
  const requested = Number.isFinite(value) ? Number(value) : defaultOverlaySettings.fontSizePercent;
  return Math.min(150, Math.max(50, Math.round(requested / 5) * 5));
}

function normalizeOverlayPosition(value: Partial<OverlayPosition> | undefined): OverlayPosition {
  if (value?.mode !== "custom") {
    return { mode: "default" };
  }

  const displayId = Number.isFinite(value.displayId) ? Math.round(Number(value.displayId)) : undefined;
  const right = Number.isFinite(value.right) ? Math.max(0, Math.round(Number(value.right))) : 4;
  const bottom = Number.isFinite(value.bottom) ? Math.max(0, Math.round(Number(value.bottom))) : 4;
  return { mode: "custom", displayId, right, bottom };
}

function normalizeProviderItems(value: Partial<OverlaySettings>, providers: Record<ProviderId, boolean>) {
  const providerItems = { ...defaultOverlaySettings.providerItems };
  const keys: ProviderId[] = ["codex", "claude", "gemini"];

  for (const id of keys) {
    providerItems[id] = {
      ...defaultOverlaySettings.providerItems[id],
      ...(value.providerItems?.[id] ?? {}),
      enabled: Boolean(value.providerItems?.[id]?.enabled ?? providers[id]),
      showPlan: Boolean(value.providerItems?.[id]?.showPlan ?? value.showPlan ?? defaultOverlaySettings.showPlan),
      showSession: Boolean(value.providerItems?.[id]?.showSession ?? value.showSession ?? defaultOverlaySettings.showSession),
      showUsed: Boolean(value.providerItems?.[id]?.showUsed ?? value.showUsed ?? defaultOverlaySettings.showUsed),
      showRemaining: Boolean(value.providerItems?.[id]?.showRemaining ?? value.showRemaining ?? defaultOverlaySettings.showRemaining),
      showReset: Boolean(value.providerItems?.[id]?.showReset ?? value.showReset ?? defaultOverlaySettings.showReset)
    };
  }

  return providerItems;
}
