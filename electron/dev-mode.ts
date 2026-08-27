import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

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

  const parsed = readDeveloperEnvValue();
  if (parsed) {
    process.env[developerEnvKey] = parsed.value;
    envStatus = {
      enabled: parsed.value === "1",
      source: "env-file",
      checkedPathCount: parsed.checkedPathCount,
      loadedFileName: parsed.fileName
    };
    return;
  }

  envStatus = {
    enabled: false,
    source: "default",
    checkedPathCount: getDeveloperEnvCandidates().length,
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

function readDeveloperEnvValue() {
  const candidates = getDeveloperEnvCandidates();
  for (const file of candidates) {
    try {
      const parsed = parseDeveloperEnv(fs.readFileSync(file, "utf8"));
      if (parsed != null) {
        return {
          value: parsed,
          checkedPathCount: candidates.length,
          fileName: path.basename(file)
        };
      }
    } catch {
      // Try the next candidate path.
    }
  }

  return null;
}

function getDeveloperEnvCandidates() {
  const candidates = new Set<string>();
  const push = (base: string | undefined) => {
    if (!base) {
      return;
    }
    candidates.add(path.join(base, ".env"));
  };

  push(process.cwd());
  push(path.dirname(process.execPath));
  push(path.resolve(path.dirname(process.execPath), ".."));
  push(path.resolve(path.dirname(process.execPath), "..", ".."));
  push(process.env.PORTABLE_EXECUTABLE_DIR);

  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    push(path.dirname(process.env.PORTABLE_EXECUTABLE_FILE));
  }

  for (const parentDir of getWindowsParentProcessDirs()) {
    push(parentDir);
  }

  if (process.env.INIT_CWD) {
    push(process.env.INIT_CWD);
  }

  return [...candidates];
}

function getWindowsParentProcessDirs() {
  if (process.platform !== "win32") {
    return [];
  }

  const dirs: string[] = [];
  let nextPid = process.ppid;

  for (let index = 0; index < 4 && nextPid; index += 1) {
    const info = readWindowsProcessInfo(nextPid);
    if (!info) {
      break;
    }

    if (info.executablePath) {
      dirs.push(path.dirname(info.executablePath));
    }

    nextPid = info.parentProcessId;
  }

  return dirs;
}

function readWindowsProcessInfo(processId: number) {
  if (!Number.isInteger(processId) || processId <= 0) {
    return null;
  }

  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process -Filter "ProcessId = ${processId}" | Select-Object ParentProcessId,ExecutablePath | ConvertTo-Json -Compress`
      ],
      { encoding: "utf8", timeout: 1500, windowsHide: true }
    ).trim();
    if (!output) {
      return null;
    }

    const parsed = JSON.parse(output) as { ParentProcessId?: unknown; ExecutablePath?: unknown };
    return {
      parentProcessId: typeof parsed.ParentProcessId === "number" ? parsed.ParentProcessId : 0,
      executablePath: typeof parsed.ExecutablePath === "string" ? parsed.ExecutablePath : null
    };
  } catch {
    return null;
  }
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
