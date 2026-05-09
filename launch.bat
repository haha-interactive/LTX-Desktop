@echo off
REM Launch LTX Desktop on Windows. Mirrors launch.sh: verifies Node.js + uv +
REM pnpm, runs first-time setup if needed, then starts `pnpm dev`.

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM API-only by default — pass --local to enable local model downloads.
set "LTX_API_ONLY=1"
echo %* | find /i "--local" >nul 2>nul && set "LTX_API_ONLY=0"

REM ---------- Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js not found. Run setup.bat first.
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
echo [OK] node !NODE_VER!

REM ---------- uv ----------
where uv >nul 2>nul
if errorlevel 1 (
    echo [X] uv not found. Run setup.bat first.
    exit /b 1
)
for /f "tokens=*" %%v in ('uv --version') do set "UV_VER=%%v"
echo [OK] !UV_VER!

REM ---------- pnpm ----------
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [...] Installing pnpm via npm
    call npm install -g pnpm
    if errorlevel 1 (
        echo [X] pnpm install failed. Run setup.bat.
        exit /b 1
    )
)
for /f "tokens=*" %%v in ('pnpm --version') do set "PNPM_VER=%%v"
echo [OK] pnpm !PNPM_VER!

REM ---------- First-time installs ----------
if not exist "node_modules\.bin\vite.cmd" (
    echo [!] node_modules missing or incomplete - running pnpm install
    call pnpm install
    if errorlevel 1 exit /b 1
)

echo [...] Syncing Python backend (uv sync)
pushd backend
call uv sync --extra dev
set "UV_RC=!errorlevel!"
popd
if not "!UV_RC!"=="0" (
    echo [X] uv sync failed
    exit /b !UV_RC!
)

echo.
echo Launching LTX Desktop...
if "!LTX_API_ONLY!"=="1" echo [...] API-only mode ^(use --local to enable local model downloads^)
call pnpm dev
endlocal
