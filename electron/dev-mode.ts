import fs from "node:fs";
import path from "node:path";
import type { AccountAliasState } from "./account-aliases.js";

export type DeveloperCheckStatus = "success" | "failed" | "skipped";

export type DeveloperProviderCheck = {
  method: string;
  status: DeveloperCheckStatus;
  detail: string;
};

export type DeveloperProviderDiagnostic = {
  id: "codex" | "claude" | "gemini";
  name: string;
  account: AccountAliasState | null;
  userPrerequisites: string[];
  checks: DeveloperProviderCheck[];
};

const developerEnvKey = "TOKEN_MONITOR_DEV_MODE";
let envLoaded = false;
let envStatus: DeveloperEnvStatus = {
  enabled: false,
  source: "default",
  checkedPathCount: 0,
  loadedFileName: null
};

export type DeveloperEnvStatus = {
  enabled: boolean;
  source: "process" | "env-file" | "default";
  checkedPathCount: number;
  loadedFileName: string | null;
};

export function loadDeveloperEnv() {
  if (envLoaded) {
    return;
  }

  envLoaded = true;

  if (process.env[developerEnvKey]) {
    envStatus = {
      enabled: process.env[developerEnvKey] === "1",
      source: "process",
      checkedPathCount: 0,
      loadedFileName: null
    };
    return;
  }

  const candidates = getDeveloperEnvCandidates();
  const parsed = readDeveloperEnvValue(candidates);
  if (parsed) {
    process.env[developerEnvKey] = parsed.value;
    envStatus = {
      enabled: parsed.value === "1",
      source: "env-file",
      checkedPathCount: candidates.length,
      loadedFileName: parsed.fileName
    };
    return;
  }

  envStatus = {
    enabled: false,
    source: "default",
    checkedPathCount: candidates.length,
    loadedFileName: null
  };
}

export function isDeveloperMode() {
  loadDeveloperEnv();
  return process.env.TOKEN_MONITOR_DEV_MODE === "1";
}

export function getDeveloperEnvStatus(): DeveloperEnvStatus {
  loadDeveloperEnv();
  return {
    ...envStatus,
    enabled: process.env.TOKEN_MONITOR_DEV_MODE === "1"
  };
}

function readDeveloperEnvValue(candidates: string[]) {
  for (const file of candidates) {
    try {
      const parsed = parseDeveloperEnv(fs.readFileSync(file, "utf8"));
      if (parsed != null) {
        return {
          value: parsed,
          fileName: path.basename(file)
        };
      }
    } catch {
      // Try the next candidate path.
    }
  }

  return null;
}

// Cheap, synchronous candidate locations only. A launcher-relative `.env` is
// found through cwd / INIT_CWD; portable builds through PORTABLE_EXECUTABLE_*.
// No process-tree walk here: it cost several blocking `powershell.exe` spawns
// during startup for every user, developer or not.
function getDeveloperEnvCandidates() {
  const candidates = new Set<string>();
  const push = (base: string | undefined) => {
    if (!base) {
      return;
    }
    candidates.add(path.join(base, ".env"));
  };

  push(process.cwd());
  push(process.env.INIT_CWD);
  push(path.dirname(process.execPath));
  push(path.resolve(path.dirname(process.execPath), ".."));
  push(path.resolve(path.dirname(process.execPath), "..", ".."));
  push(process.env.PORTABLE_EXECUTABLE_DIR);

  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    push(path.dirname(process.env.PORTABLE_EXECUTABLE_FILE));
  }

  return [...candidates];
}

function parseDeveloperEnv(content: string) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (key !== developerEnvKey) {
      continue;
    }

    return cleanEnvValue(line.slice(separatorIndex + 1));
  }

  return null;
}

function cleanEnvValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
