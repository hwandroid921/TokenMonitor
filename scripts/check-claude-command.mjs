import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { claudeInvocation, findClaudeCommand } from "../dist-electron/claude-command.js";

function run(command, args) {
  const invocation = claudeInvocation(command, args);
  return spawnSync(invocation.command, invocation.args, {
    shell: false, windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    encoding: "utf8", timeout: 5000
  });
}

const direct = run(process.execPath, ["-e", "process.stdout.write(process.argv[1])", "value with spaces"]);
assert.equal(direct.status, 0);
assert.equal(direct.stdout, "value with spaces");

if (process.platform === "win32") {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "Token Monitor 한글 & "));
  const fixture = path.join(directory, "claude.cmd");
  const previousPath = process.env.PATH;
  try {
    await fs.writeFile(fixture, "@echo off\r\necho %~1\r\n", "utf8");
    process.env.PATH = `"${directory}"`;
    assert.equal(findClaudeCommand(["claude.exe", "claude.cmd"]), fixture);
    assert.equal(findClaudeCommand(["not-installed.exe"]), null);
    const result = run(fixture, ["value with spaces"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "value with spaces");
  } finally {
    process.env.PATH = previousPath;
    await fs.rm(directory, { recursive: true, force: true });
  }
}
console.log("PASS: direct executable, quoted PATH, missing command, Windows script with spaces and Unicode");
