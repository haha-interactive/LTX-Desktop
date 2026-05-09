@echo off
REM Download LTX models for local generation.
REM Usage:
REM   download.bat        -- download from huggingface.co (default)
REM   download.bat --cn   -- use hf-mirror.com (China)

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
    echo [X] uv not found. Run setup.bat first.
    exit /b 1
)

set "ARGS="
if not defined HF_ENDPOINT (
    echo %* | find /i "--cn" >nul 2>nul && set "HF_ENDPOINT=https://hf-mirror.com"
)
if not defined HF_ENDPOINT set "HF_ENDPOINT=https://huggingface.co"

uv run --directory "%SCRIPT_DIR%backend" python "%SCRIPT_DIR%scripts\download_models.py"
endlocal
