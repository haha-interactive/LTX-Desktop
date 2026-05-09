@echo off
REM Download LTX models for local generation.
REM Usage:
REM   download.bat                                  -- download from huggingface.co (default)
REM   download.bat --cn                             -- use hf-mirror.com (China)
REM   download.bat --data-dir F:\LTX               -- custom data directory (note: SPACE, not =)
REM   download.bat --cn --data-dir F:\LTX_APP_DIR  -- both flags

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
    echo [X] uv not found. Run setup.bat first.
    exit /b 1
)

REM Parse all flags. Note: Windows batch treats '=' as arg separator,
REM so --data-dir=F:\X gets split into two args. We handle both forms.
:parse_args
if "%~1"=="" goto args_done
set "_arg=%~1"
if defined _PENDING_DDIR (
    set "LTX_APP_DATA_DIR=!_arg!"
    set "_PENDING_DDIR="
) else (
    if /i "!_arg!"=="--cn" set "HF_ENDPOINT=https://hf-mirror.com"
    if /i "!_arg!"=="--data-dir" set "_PENDING_DDIR=1"
    if /i "!_arg:~0,11!"=="--data-dir=" set "LTX_APP_DATA_DIR=!_arg:~11!"
)
shift
goto parse_args
:args_done

if not defined HF_ENDPOINT set "HF_ENDPOINT=https://huggingface.co"

if defined LTX_APP_DATA_DIR (
    echo [...] App data directory: !LTX_APP_DATA_DIR!
    if not exist "!LTX_APP_DATA_DIR!" mkdir "!LTX_APP_DATA_DIR!"
)

uv run --directory "%SCRIPT_DIR%backend" python "%SCRIPT_DIR%scripts\download_models.py"
endlocal
