@echo off
setlocal EnableExtensions

cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Could not open the project directory.
  exit /b 1
)

set "POWERSHELL_EXE=powershell.exe"
where pwsh.exe >nul 2>nul
if not errorlevel 1 set "POWERSHELL_EXE=pwsh.exe"

set "CLEANUP_ONLY=0"
if /i "%~1"=="--cleanup-only" set "CLEANUP_ONLY=1"

if "%CLEANUP_ONLY%"=="0" (
  echo [1/4] Checking for another packaging process...
  "%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command ^
    "$currentPid=$PID; $running=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $currentPid -and $_.Name -in @('node.exe','makensis.exe','signtool.exe') -and $_.CommandLine -match 'electron-builder|dist:win|package:portable' }); if ($running.Count -gt 0) { $running | Select-Object ProcessId,Name,CommandLine | Format-Table -AutoSize; exit 2 }"
  if errorlevel 1 (
    echo [ERROR] Another packaging process is running. Stop it before retrying.
    exit /b 1
  )

  echo [2/4] Building the portable package...
  set "CSC_IDENTITY_AUTO_DISCOVERY=false"
  call npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false
  if errorlevel 1 (
    echo [ERROR] Packaging failed. Existing portable files were not removed.
    exit /b 1
  )
) else (
  echo [1/4] Cleanup-only mode: using the existing current package.
  echo [2/4] Packaging skipped.
)

echo [3/4] Verifying the current package and removing older versions...
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; $version=(Get-Content -Raw -LiteralPath '.\package.json' | ConvertFrom-Json).version; if ([string]::IsNullOrWhiteSpace($version)) { throw 'package.json does not contain a version.' }; $currentName='TokenMonitor-' + $version + '-x64.exe'; $currentPath=Join-Path (Get-Location) $currentName; if (-not (Test-Path -LiteralPath $currentPath -PathType Leaf)) { throw ('Current package was not found: ' + $currentName) }; $currentFile=Get-Item -LiteralPath $currentPath; if ($currentFile.Length -le 0) { throw ('Current package is empty: ' + $currentName) }; $hash=Get-FileHash -LiteralPath $currentPath -Algorithm SHA256; Write-Host ('KEEP    ' + $currentName); Write-Host ('SIZE    ' + $currentFile.Length + ' bytes'); Write-Host ('SHA256  ' + $hash.Hash); $oldFiles=@(Get-ChildItem -LiteralPath (Get-Location) -Filter 'TokenMonitor-*-x64.exe' -File | Where-Object { $_.Name -ne $currentName }); foreach ($oldFile in $oldFiles) { Write-Host ('DELETE  ' + $oldFile.Name); Remove-Item -LiteralPath $oldFile.FullName -Force }; if (Test-Path -LiteralPath '.\dist-app') { Get-ChildItem -LiteralPath '.\dist-app' -Force | Remove-Item -Recurse -Force }; $remaining=@(Get-ChildItem -LiteralPath (Get-Location) -Filter 'TokenMonitor-*-x64.exe' -File); if ($remaining.Count -ne 1 -or $remaining[0].Name -ne $currentName) { throw 'Portable package cleanup verification failed.' }"
if errorlevel 1 (
  echo [ERROR] Package verification or cleanup failed.
  exit /b 1
)

echo [4/4] Complete. Remaining portable package:
dir /b "TokenMonitor-*-x64.exe"
exit /b 0
