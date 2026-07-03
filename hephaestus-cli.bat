@echo off
REM Hephaestus DevOps Portal User Management CLI

IF NOT EXIST "dist\cli.js" (
  echo Dist files not found. Building project...
  call npm run build
)

node dist\cli.js %*
