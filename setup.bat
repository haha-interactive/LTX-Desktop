@echo off
REM Windows setup for LTX Desktop. Checks Node.js, uv, pnpm; installs missing
REM tools via winget when available; runs `pnpm install` and `uv sync`.

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ============================================================
echo   LTX Desktop - Windows setup
echo ============================================================
echo.

REM ---------- Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo [!] Node.js not found.
    where winget >nul 2>nul
    if errorlevel 1 (
        echo [X] winget is not available on this system.
        echo     Install Node.js LTS manually from https://nodejs.org/ then re-run setup.bat
        exit /b 1
    )
    echo [...] Installing Node.js LTS via winget
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo [X] winget failed to install Node.js
        exit /b 1
    )
    echo.
    echo [!] Node.js installed. Open a NEW terminal so PATH refreshes,
    echo     then run setup.bat again.
    exit /b 0
)
for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
echo [OK] node !NODE_VER!

REM ---------- uv ----------
where uv >nul 2>nul
if errorlevel 1 (
    echo [!] uv not found.
    where winget >nul 2>nul
    if errorlevel 1 (
        echo [...] Installing uv via official installer
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    ) else (
        echo [...] Installing uv via winget
        winget install -e --id astral-sh.uv --accept-source-agreements --accept-package-agreements
    )
    if errorlevel 1 (
        echo [X] uv installation failed
        exit /b 1
    )
    echo.
    echo [!] uv installed. Open a NEW terminal so PATH refreshes,
    echo     then run setup.bat again.
    exit /b 0
)
for /f "tokens=*" %%v in ('uv --version') do set "UV_VER=%%v"
echo [OK] !UV_VER!

REM ---------- pnpm ----------
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [...] Installing pnpm via npm
    call npm install -g pnpm
    if errorlevel 1 (
        echo [X] pnpm install failed
        exit /b 1
    )
)
for /f "tokens=*" %%v in ('pnpm --version') do set "PNPM_VER=%%v"
echo [OK] pnpm !PNPM_VER!

echo.
echo ------------------------------------------------------------
echo   Installing Node dependencies
echo ------------------------------------------------------------
call pnpm install
if errorlevel 1 (
    echo [X] pnpm install failed
    exit /b 1
)

echo.
echo ------------------------------------------------------------
echo   Setting up Python backend (uv sync)
echo ------------------------------------------------------------
pushd backend
call uv sync --extra dev
set "UV_RC=!errorlevel!"
popd
if not "!UV_RC!"=="0" (
    echo [X] uv sync failed
    exit /b !UV_RC!
)

echo.
echo ------------------------------------------------------------
echo   Verifying PyTorch CUDA
echo ------------------------------------------------------------
pushd backend
.venv\Scripts\python.exe -c "import torch; cuda=torch.cuda.is_available(); print(f'CUDA available: {cuda}'); print(f'GPU: {torch.cuda.get_device_name(0)}') if cuda else None"
popd

REM ---------- ffmpeg ----------
echo.
where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo [!] ffmpeg not on PATH.
    where winget >nul 2>nul
    if errorlevel 1 (
        echo [!] winget not available - skipping ffmpeg install.
        echo     ^(imageio-ffmpeg bundled binary will be used as fallback^)
    ) else (
        echo [...] Installing ffmpeg via winget
        winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
        if errorlevel 1 (
            echo [!] ffmpeg install failed - continuing.
            echo     ^(imageio-ffmpeg bundled binary will be used as fallback^)
        ) else (
            echo [OK] ffmpeg installed. Open a NEW terminal for PATH to refresh.
        )
    )
) else (
    echo [OK] ffmpeg found
)

echo.
echo ============================================================
echo   Setup complete. Launch with: launch.bat   ^(or: pnpm dev^)
echo ============================================================
endlocal
