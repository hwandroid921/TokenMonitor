import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function findClaudeCommand(candidates: string[]) {
  for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
    const directory = entry.trim().replace(/^"|"$/g, "");
    if (!directory) continue;
    for (const name of candidates) {
      const target = path.join(directory, name);
      try {
        if (fs.statSync(target).isFile()) return target;
      } catch {
        // Continue checking the current process PATH.
      }
    }
  }
  return null;
}

export function getClaudeCommands() {
  const candidates = process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"];
  const nativeCommand = path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
  return {
    claude: findClaudeCommand(candidates) ?? (fs.existsSync(nativeCommand) && fs.statSync(nativeCommand).isFile() ? nativeCommand : null),
    npx: findClaudeCommand(process.platform === "win32" ? ["npx.exe", "npx.cmd", "npx"] : ["npx"])
  };
}

export function claudeInvocation(command: string, args: string[]) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    // /s removes the outer quotes; the inner quotes preserve spaces in the path.
    const quoted = [command, ...args].map((value) => `"${value.replace(/"/g, '""')}"`).join(" ");
    return { command: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `"${quoted}"`], windowsVerbatimArguments: true };
  }
  return { command, args, windowsVerbatimArguments: false };
}
