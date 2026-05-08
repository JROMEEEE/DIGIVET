@echo off
title DIGIVET R Analytics API
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   DIGIVET R Analytics API            ║
echo  ║   http://localhost:8000              ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: ── Open RStudio (non-blocking) ────────────────────────────────
set RSTUDIO_EXE=
for %%p in (
    "C:\Program Files\RStudio\rstudio.exe"
    "C:\Program Files\RStudio\bin\rstudio.exe"
    "C:\Program Files (x86)\RStudio\rstudio.exe"
) do (
    if exist %%p (
        set RSTUDIO_EXE=%%p
    )
)

if defined RSTUDIO_EXE (
    echo Opening RStudio...
    start "" %RSTUDIO_EXE%
) else (
    echo RStudio not found - skipping.
)

:: ── Find Rscript ───────────────────────────────────────────────
set RSCRIPT_EXE=

:: 1. Check PATH
where Rscript >nul 2>&1
if %ERRORLEVEL% == 0 (
    set RSCRIPT_EXE=Rscript
    goto run_plumber
)

:: 2. Wildcard scan — matches any R version (4.4.2, 4.3.1, etc.)
for /d %%d in ("C:\Program Files\R\R-*") do (
    if exist "%%d\bin\Rscript.exe" (
        set RSCRIPT_EXE=%%d\bin\Rscript.exe
    )
)

if defined RSCRIPT_EXE goto run_plumber

:: 3. Not found
echo.
echo  ERROR: Rscript.exe not found.
echo  Install R from https://cran.r-project.org/ and re-run.
echo.
pause
exit /b 1

:: ── Run Plumber ────────────────────────────────────────────────
:run_plumber
echo.
echo  Rscript: %RSCRIPT_EXE%
echo  Starting R Plumber on http://localhost:8000 ...
echo  Close this window to stop the API.
echo.
"%RSCRIPT_EXE%" r-api/run.R

pause
