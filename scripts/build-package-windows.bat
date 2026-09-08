@echo off
setlocal EnableExtensions

cd /d "%~dp0.."

if not exist "package.json" (
  echo [ERROR] package.json was not found. Run this file from the repository's scripts folder.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Install Node.js LTS and try again.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$processes = Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','makensis.exe','signtool.exe','7za.exe') -and $_.CommandLine -match 'electron-builder|dist:win' }; if ($processes) { $processes | Select-Object ProcessId, Name, CommandLine | Format-Table -AutoSize; exit 1 }"
if errorlevel 1 (
  echo [ERROR] A packaging process is already running. Finish or close it before retrying.
  exit /b 1
)

echo [1/4] Type checking...
call npm run typecheck
if errorlevel 1 exit /b %errorlevel%

echo [2/4] Building the renderer and Electron processes...
call npm run build
if errorlevel 1 exit /b %errorlevel%

echo [3/4] Creating the Windows portable package...
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
cmd /d /s /c "npx electron-builder --win portable --x64 --publish never --config.win.signAndEditExecutable=false"
set "PACKAGE_EXIT_CODE=%errorlevel%"
if not "%PACKAGE_EXIT_CODE%"=="0" (
  echo [ERROR] Portable packaging failed with exit code %PACKAGE_EXIT_CODE%.
  exit /b %PACKAGE_EXIT_CODE%
)

echo [4/4] Verifying the package and cleaning older portable files...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$manifest = Get-Content -Raw package.json | ConvertFrom-Json; $artifact = Join-Path $PWD ('TokenMonitor-' + $manifest.version + '-x64.exe'); if (-not (Test-Path -LiteralPath $artifact)) { Write-Error ('The expected portable executable was not created: ' + $artifact); exit 1 }; Get-FileHash -LiteralPath $artifact -Algorithm SHA256; Get-ChildItem -LiteralPath $PWD -Filter 'TokenMonitor-*-x64.exe' -File | Where-Object { $_.FullName -ne $artifact } | ForEach-Object { try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop; Write-Host ('Removed older package: ' + $_.Name) } catch { Write-Warning ('Could not remove older package: ' + $_.Name) } }; if (Test-Path -LiteralPath (Join-Path $PWD 'dist-app')) { Get-ChildItem -LiteralPath (Join-Path $PWD 'dist-app') -Force | Remove-Item -Force -Recurse }; Write-Host ('Artifact: ' + $artifact)"
if errorlevel 1 exit /b %errorlevel%

echo.
echo Build and portable packaging completed.
exit /b 0
