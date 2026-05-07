@echo off
REM Starts the DIGIVET server and client in separate windows.
cd /d "%~dp0"
start "DIGIVET server" cmd /k "npm run dev --prefix server"
start "DIGIVET client" cmd /k "npm run dev --prefix client"
