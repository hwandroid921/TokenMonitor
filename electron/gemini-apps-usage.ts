import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

export type GeminiAppsUsageWindow = {
  label: "5시간" | "주간";
  remaining: string | null;
  reset: string | null;
};

export type GeminiAppsUsage = {
  source: "gemini-web-usage-limits";
  parserVersion: 2;
  fiveHour: GeminiAppsUsageWindow | null;
  weekly: GeminiAppsUsageWindow | null;
  plan: string | null;
  updatedAt: string;
  detail: string | null;
};

type GeminiAppsParseDebug = {
  updatedAt: string;
  percentCandidates: string[];
  usageDetected: boolean;
};

export type GeminiAppsSessionStatus = {
  loggedIn: boolean;
  checkedAt: string | null;
};

let usageWindow: BrowserWindow | null = null;
let captureTimer: NodeJS.Timeout | null = null;
let isCapturing = false;

function getCachePath() {
  return path.join(app.getPath("userData"), "gemini-apps-usage.json");
}

function getSessionPath() {
  return path.join(app.getPath("userData"), "gemini-apps-session.json");
}

export function readGeminiAppsSessionStatus(): GeminiAppsSessionStatus {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSessionPath(), "utf8")) as GeminiAppsSessionStatus;
    return {
      loggedIn: Boolean(parsed.loggedIn),
      checkedAt: typeof parsed.checkedAt === "string" ? parsed.checkedAt : null
    };
  } catch {
    return { loggedIn: false, checkedAt: null };
  }
}

export function readGeminiAppsUsageCache(): GeminiAppsUsage | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(getCachePath(), "utf8")) as GeminiAppsUsage;
    if (parsed?.source !== "gemini-web-usage-limits" || parsed.parserVersion !== 2) {
      return null;
    }

    return {
      source: "gemini-web-usage-limits",
      parserVersion: 2,
      fiveHour: normalizeWindow(parsed.fiveHour, "5시간"),
      weekly: normalizeWindow(parsed.weekly, "주간"),
      plan: normalizeGeminiAppsPlan(parsed.plan),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      detail: typeof parsed.detail === "string" ? parsed.detail : null
    };
  } catch {
    return null;
  }
}

export function openGeminiAppsUsageWindow(onCaptured: () => void) {
  if (usageWindow && !usageWindow.isDestroyed()) {
    usageWindow.show();
    usageWindow.focus();
    if (readGeminiAppsSessionStatus().loggedIn) {
      void focusUsageLimitsPage(usageWindow);
    }
    return {
      ok: true,
      detail: readGeminiAppsSessionStatus().loggedIn
        ? "Gemini 사용량 확인 창이 이미 열려 있습니다. Usage Limits 화면이 보이면 자동으로 수집합니다."
        : "Gemini 로그인 창이 이미 열려 있습니다. 로그인 완료 시 창을 닫고 사용량 확인 버튼으로 전환합니다."
    };
  }

  const isKnownLoggedIn = readGeminiAppsSessionStatus().loggedIn;
  usageWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    title: isKnownLoggedIn ? "Gemini 사용량 확인" : "Gemini 로그인",
    backgroundColor: "#ffffff",
    webPreferences: {
      partition: "persist:gemini-usage",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  usageWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isGoogleLoginUrl(url) || isGeminiUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: {
            partition: "persist:gemini-usage",
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
          }
        }
      };
    }

    return { action: "deny" };
  });

  const blockUnexpectedNavigation = (event: Electron.Event, url: string) => {
    if (!isGoogleLoginUrl(url) && !isGeminiUrl(url)) {
      event.preventDefault();
    }
  };
  usageWindow.webContents.on("will-navigate", blockUnexpectedNavigation);
  usageWindow.webContents.on("will-redirect", blockUnexpectedNavigation);

  usageWindow.webContents.on("did-finish-load", () => {
    void handleGeminiWindowLoaded(onCaptured);
  });
  usageWindow.webContents.on("did-navigate", () => {
    void handleGeminiWindowLoaded(onCaptured);
  });
  usageWindow.webContents.on("did-navigate-in-page", () => {
    void handleGeminiWindowLoaded(onCaptured);
  });
  usageWindow.on("closed", () => {
    usageWindow = null;
    if (captureTimer) {
      clearInterval(captureTimer);
      captureTimer = null;
    }
  });

  captureTimer = setInterval(() => {
    void handleGeminiWindowLoaded(onCaptured);
  }, 5000);

  void usageWindow.loadURL(isKnownLoggedIn ? "https://gemini.google.com/usage" : "https://gemini.google.com/app");

  return {
    ok: true,
    detail: isKnownLoggedIn
      ? "Gemini 사용량 확인 창을 열었습니다. Usage Limits 화면이 보이면 5시간/주간 한도를 자동으로 저장합니다."
      : "Gemini 로그인 창을 열었습니다. 로그인 완료 시 창을 닫고 사용량 확인 버튼으로 전환합니다."
  };
}

export async function captureGeminiAppsUsageFromOpenWindow(onCaptured: () => void) {
  const captured = await captureFromWindow(onCaptured);
  if (captured && usageWindow && !usageWindow.isDestroyed()) {
    usageWindow.close();
  }
  return captured;
}

async function handleGeminiWindowLoaded(onCaptured: () => void) {
  if (!usageWindow || usageWindow.isDestroyed()) {
    return;
  }

  const loggedIn = await detectGeminiLoginFromWindow(usageWindow);
  if (loggedIn && !readGeminiAppsSessionStatus().loggedIn) {
    writeGeminiAppsSessionStatus({ loggedIn: true, checkedAt: new Date().toISOString() });
    onCaptured();
    usageWindow.close();
    return;
  }

  if (loggedIn) {
    await focusUsageLimitsPage(usageWindow);
  }

  const captured = await captureFromWindow(onCaptured);
  if (captured && usageWindow && !usageWindow.isDestroyed()) {
    usageWindow.close();
  }
}

async function captureFromWindow(onCaptured: () => void) {
  if (!usageWindow || usageWindow.isDestroyed() || isCapturing) {
    return false;
  }

  const currentUrl = usageWindow.webContents.getURL();
  if (!isGeminiUrl(currentUrl)) {
    return false;
  }

  isCapturing = true;
  try {
    const text = await usageWindow.webContents.executeJavaScript(
      "document.body && document.body.innerText ? document.body.innerText : ''",
      true
    ) as string;
    const usage = parseGeminiAppsUsageText(text);
    if (!usage) {
      return false;
    }

    writeGeminiAppsUsageCache(usage);
    onCaptured();
    return true;
  } catch {
    // Ignore page-script failures. The next navigation or timer tick will retry.
    return false;
  } finally {
    isCapturing = false;
  }
}

export function writeGeminiAppsUsageCache(usage: GeminiAppsUsage) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(getCachePath(), JSON.stringify(usage, null, 2), "utf8");
}

export function clearGeminiAppsUsageCache() {
  try {
    fs.rmSync(getCachePath(), { force: true });
  } catch {
    // A missing or locked cache will be replaced after the next successful capture.
  }
}

export function writeGeminiAppsSessionStatus(status: GeminiAppsSessionStatus) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(getSessionPath(), JSON.stringify(status, null, 2), "utf8");
}

async function detectGeminiLoginFromWindow(window: BrowserWindow) {
  try {
    const state = await window.webContents.executeJavaScript(`
      (() => {
        const text = document.body && document.body.innerText ? document.body.innerText : "";
        const hasLoginPrompt = /sign in|log in|로그인|계정 선택/i.test(text);
        const hasAppSurface = Boolean(
          document.querySelector("textarea, rich-textarea, [contenteditable='true'], input[aria-label*='Ask'], input[placeholder*='Ask']")
        );
        const hasUsageText = /usage limits|사용량 한도|사용량 제한|limits/i.test(text);
        return { hasLoginPrompt, hasAppSurface, hasUsageText };
      })()
    `, true) as { hasLoginPrompt?: boolean; hasAppSurface?: boolean; hasUsageText?: boolean };

    return Boolean((state.hasAppSurface || state.hasUsageText) && !state.hasLoginPrompt);
  } catch {
    return false;
  }
}

async function focusUsageLimitsPage(window: BrowserWindow) {
  try {
    await window.webContents.executeJavaScript(`
      (() => {
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
        const candidates = Array.from(document.querySelectorAll("a, button, [role='button'], [role='menuitem']"));
        const usage = candidates.find((item) => /usage limits|usage limit|사용량 한도|사용량 제한/.test(normalize(item.innerText || item.getAttribute("aria-label"))));
        if (usage) {
          usage.click();
          return "usage";
        }
        const settings = candidates.find((item) => /settings|설정|help|도움말/.test(normalize(item.innerText || item.getAttribute("aria-label"))));
        if (settings) {
          settings.click();
          return "settings";
        }
        return "none";
      })()
    `, true);
  } catch {
    // Keep the window open so the user can open Usage Limits manually.
  }
}

export function parseGeminiAppsUsageText(rawText: string): GeminiAppsUsage | null {
  const text = rawText.replace(/\s+/g, " ").trim();
  const debug = buildParseDebug(text);
  const plan = parseGeminiAppsPlan(text);
  if (!text || !isGeminiUsageText(text)) {
    return null;
  }

  const fiveHourAnchors = [
    "현재 사용량",
    "5시간",
    "5 시간",
    "5-hour",
    "5 hour",
    "five-hour",
    "five hour"
  ];
  const weeklyAnchors = [
    "주간",
    "주간 한도",
    "일주일",
    "7일",
    "weekly",
    "week",
    "7-day",
    "7 day",
    "seven-day",
    "seven day"
  ];
  const fiveHour = parseUsageWindow(text, "5시간", fiveHourAnchors, weeklyAnchors);
  const weekly = parseUsageWindow(text, "주간", weeklyAnchors, fiveHourAnchors);

  if (!fiveHour && !weekly) {
    return null;
  }

  return {
    source: "gemini-web-usage-limits",
    parserVersion: 2,
    fiveHour,
    weekly,
    plan,
    updatedAt: new Date().toISOString(),
    detail: formatParseDetail(debug, plan)
  };
}

function parseUsageWindow(
  text: string,
  label: GeminiAppsUsageWindow["label"],
  anchors: string[],
  boundaryAnchors: string[]
): GeminiAppsUsageWindow | null {
  const lower = text.toLowerCase();
  const index = anchors
    .map((anchor) => lower.indexOf(anchor.toLowerCase()))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0];

  if (index == null) {
    return null;
  }

  const nextBoundary = boundaryAnchors
    .map((anchor) => lower.indexOf(anchor.toLowerCase(), index + 1))
    .filter((value) => value > index)
    .sort((a, b) => a - b)[0];
  const segment = text.slice(index, nextBoundary ?? index + 520);
  const remaining = firstMatch(segment, [
    /(?:남은 사용량|남음|remaining|left)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?\s*%)/i,
    /([0-9]+(?:\.[0-9]+)?\s*%)\s*(?:남음|remaining|left)/i,
    /(?:남은 사용량|remaining|left)\s*[:：]?\s*([^/|]{1,42}?)(?:초기화|reset|$)/i
  ]);
  const used = firstMatch(segment, [
    /([0-9]+(?:\.[0-9]+)?\s*%)\s*(?:사용됨|used)/i
  ]);
  const reset = firstMatch(segment, [
    /((?:\d{1,2}월\s*\d{1,2}일\s*)?(?:오전|오후)\s*\d{1,2}:\d{2}\s*에\s*초기화)/i,
    /((?:\d{1,2}월\s*\d{1,2}일\s*)?(?:오전|오후)\s*\d{1,2}:\d{2})/i,
    /(?:초기화|재설정|reset(?:s)?(?: at| in| time)?)\s*[:：]?\s*([^/|]{1,70})/i,
    /(?:resets?)\s*(?:at|in)\s*([^/|]{1,70})/i
  ]);

  const remainingPercent = cleanPercentage(remaining) ?? remainingFromUsedPercentage(used);

  if (!remainingPercent) {
    return null;
  }

  return {
    label,
    remaining: remainingPercent,
    reset: cleanValue(reset)
  };
}

function firstMatch(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function isGeminiUsageText(text: string) {
  return /usage limits|usage limit|사용량 한도|사용량 제한|현재 사용량|주간 한도|초기화|limits/i.test(text);
}

function parseGeminiAppsPlan(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const currentPlan = normalized.match(/\b(?:google\s+ai\s+)?(pro|ultra|advanced|free)\s*(?:요금제|plan)/i)?.[1];
  if (currentPlan) {
    return currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1).toLowerCase();
  }
  if (/\b(?:google\s+ai\s+)?ultra\b|AI\s*Ultra/i.test(normalized)) {
    return "Ultra";
  }
  if (/\b(?:google\s+ai\s+)?pro\b|AI\s*Pro/i.test(normalized)) {
    return "Pro";
  }
  if (/\badvanced\b|AI\s*Advanced/i.test(normalized)) {
    return "Advanced";
  }
  if (/\bfree\b|무료/i.test(normalized)) {
    return "Free";
  }
  return null;
}

function normalizeGeminiAppsPlan(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 40) : null;
}

function formatParseDetail(debug: GeminiAppsParseDebug, plan: string | null) {
  const parts = [
    plan ? `플랜 후보 ${plan}` : null,
    debug.percentCandidates.length > 0 ? `파싱 후보 ${debug.percentCandidates.join(", ")}` : null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : null;
}

function buildParseDebug(rawText: string): GeminiAppsParseDebug {
  const text = rawText.replace(/\s+/g, " ").trim();
  const percentCandidates = uniqueStrings(Array.from(text.matchAll(/[0-9]+(?:\.[0-9]+)?\s*%/g)).map((match) => match[0].replace(/\s+/g, ""))).slice(0, 20);

  return {
    updatedAt: new Date().toISOString(),
    percentCandidates,
    usageDetected: /usage limits|usage limit|limits/i.test(text)
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function cleanValue(value: string | null) {
  if (!value) {
    return null;
  }
  return value.replace(/\s+/g, " ").replace(/[.。]+$/, "").trim().slice(0, 80) || null;
}

function cleanPercentage(value: string | null) {
  const cleaned = cleanValue(value);
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return match ? `${match[1]}%` : null;
}

function remainingFromUsedPercentage(value: string | null) {
  const cleaned = cleanPercentage(value);
  if (!cleaned) {
    return null;
  }
  const usedPercent = Number(cleaned.slice(0, -1));
  if (!Number.isFinite(usedPercent)) {
    return null;
  }
  return `${Math.round((100 - Math.min(100, Math.max(0, usedPercent))) * 10) / 10}%`;
}

function normalizeWindow(value: GeminiAppsUsageWindow | null, label: GeminiAppsUsageWindow["label"]) {
  if (!value || value.label !== label) {
    return null;
  }
  return {
    label,
    remaining: typeof value.remaining === "string" ? value.remaining : null,
    reset: typeof value.reset === "string" ? value.reset : null
  };
}

function isGeminiUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "gemini.google.com" || hostname.endsWith(".gemini.google.com");
  } catch {
    return false;
  }
}

function isGoogleLoginUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "accounts.google.com" || hostname.endsWith(".accounts.google.com");
  } catch {
    return false;
  }
}
