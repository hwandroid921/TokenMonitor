import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const statusLineFileName = "claude-statusline.ps1";
const snapshotFileName = "claude-statusline.json";

export type ClaudeStatusLineSetupResult =
  | { ok: true; snapshotPath: string; detail: string }
  | { ok: false; detail: string };

export function getClaudeStatusLineSnapshotPath(userDataPath: string) {
  return path.join(userDataPath, snapshotFileName);
}

/**
 * Installs the app-owned Status Line command without reading authentication
 * files. Existing custom Status Line commands are preserved and reported.
 */
export function ensureClaudeStatusLine(userDataPath: string): ClaudeStatusLineSetupResult {
  const snapshotPath = getClaudeStatusLineSnapshotPath(userDataPath);
  const scriptPath = path.join(userDataPath, statusLineFileName);

  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(scriptPath, makeStatusLineScript(snapshotPath), "utf8");
  } catch {
    return { ok: false, detail: "Claude Status Line 수집 도구를 준비할 수 없습니다." };
  }

  const settingsPath = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    if (fs.existsSync(settingsPath)) {
      const value = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, detail: "Claude 설정 파일 형식이 올바르지 않습니다." };
      }
      settings = value as Record<string, unknown>;
    }
  } catch {
    return { ok: false, detail: "Claude 설정 파일을 안전하게 읽을 수 없습니다." };
  }

  const existingStatusLine = settings.statusLine;
  if (existingStatusLine && !isTokenMonitorStatusLine(existingStatusLine, scriptPath)) {
    return { ok: false, detail: "기존 Claude Status Line 설정을 유지했습니다. Token Monitor 수집용 Status Line을 별도로 설정하세요." };
  }

  settings.statusLine = {
    type: "command",
    command: `powershell -NoProfile -ExecutionPolicy Bypass -File ${quotePowerShellArgument(scriptPath)}`,
    refreshInterval: 60
  };

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    writeJsonAtomically(settingsPath, settings);
  } catch {
    return { ok: false, detail: "Claude Status Line 설정을 저장할 수 없습니다." };
  }

  return { ok: true, snapshotPath, detail: "Claude Status Line 수집이 준비되었습니다. Claude Code에서 대화를 시작하세요." };
}

function isTokenMonitorStatusLine(value: unknown, scriptPath: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const command = (value as { command?: unknown }).command;
  return typeof command === "string" && command.toLocaleLowerCase() === `powershell -noprofile -executionpolicy bypass -file ${quotePowerShellArgument(scriptPath)}`.toLocaleLowerCase();
}

function writeJsonAtomically(targetPath: string, value: Record<string, unknown>) {
  const temporaryPath = `${targetPath}.token-monitor.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, targetPath);
}

function quotePowerShellArgument(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function makeStatusLineScript(snapshotPath: string) {
  const escapedSnapshotPath = snapshotPath.replace(/'/g, "''");
  return `$ErrorActionPreference = 'Stop'
$snapshotPath = '${escapedSnapshotPath}'

function Get-TextValue($value) {
  if ($null -eq $value) { return $null }
  $text = [string]$value
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  return $text
}

function Get-Window($window) {
  if ($null -eq $window -or $null -eq $window.used_percentage) { return $null }
  $used = [Math]::Min(100, [Math]::Max(0, [Math]::Round([double]$window.used_percentage, 1)))
  return [ordered]@{
    usedPercent = $used
    remainingPercent = [Math]::Round(100 - $used, 1)
    resetsAt = Get-TextValue $window.resets_at
  }
}

try {
  $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json -ErrorAction Stop
} catch {
  Write-Output 'Claude'
  exit 0
}

$fiveHour = Get-Window $payload.rate_limits.five_hour
$sevenDay = Get-Window $payload.rate_limits.seven_day
$modelName = Get-TextValue $payload.model.display_name
$snapshot = [ordered]@{
  version = 1
  capturedAt = [DateTime]::UtcNow.ToString('o')
  model = [ordered]@{
    id = Get-TextValue $payload.model.id
    displayName = $modelName
  }
  fiveHour = $fiveHour
  sevenDay = $sevenDay
}

try {
  $temporaryPath = "$snapshotPath.tmp"
  $json = $snapshot | ConvertTo-Json -Depth 5 -Compress
  [System.IO.File]::WriteAllText($temporaryPath, $json, [System.Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporaryPath -Destination $snapshotPath -Force
} catch { }

$parts = @()
if ($modelName) { $parts += $modelName }
if ($fiveHour) { $parts += "5h $($fiveHour.remainingPercent)% 남음" }
if ($sevenDay) { $parts += "주간 $($sevenDay.remainingPercent)% 남음" }
if ($parts.Count -eq 0) { $parts += '사용량 대기 중' }
Write-Output ($parts -join ' · ')
`;
}
