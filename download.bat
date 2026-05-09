@echo off
REM Download LTX models for local generation.
REM Usage:
REM   download.bat                            -- download from huggingface.co (default)
REM   download.bat --cn                       -- use hf-mirror.com (China)
REM   download.bat --data-dir=F:\LTX         -- custom data directory

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
    echo [X] uv not found. Run setup.bat first.
    exit /b 1
)

if not defined HF_ENDPOINT (
    echo %* | find /i "--cn" >nul 2>nul && set "HF_ENDPOINT=https://hf-mirror.com"
)
if not defined HF_ENDPOINT set "HF_ENDPOINT=https://huggingface.co"

REM Parse --data-dir=<path> if provided (string substitution method)
set "_args=%*"
if "!_args:--data-dir=!" neq "!_args!" (
    for /f "tokens=* delims=--data-dir=" %%z in ("!_args!") do (
        set "_remainder=%%z"
        for /f "tokens=1" %%d in ("!_remainder!") do set "LTX_APP_DATA_DIR=%%d"
    )
)
if defined LTX_APP_DATA_DIR (
    echo [...] App data directory: !LTX_APP_DATA_DIR!
    if not exist "!LTX_APP_DATA_DIR!" mkdir "!LTX_APP_DATA_DIR!"
)

uv run --directory "%SCRIPT_DIR%backend" python "%SCRIPT_DIR%scripts\download_models.py"
endlocal
