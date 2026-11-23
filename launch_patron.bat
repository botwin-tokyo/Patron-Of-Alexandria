@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo Build the frontend with npm ci and npm run build first.
  exit /b 1
)
if not exist "backend\.venv\Scripts\python.exe" (
  echo Create the backend environment as described in README.md.
  exit /b 1
)
echo Open http://127.0.0.1:5055 in your browser.
"backend\.venv\Scripts\python.exe" -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 5055 --no-access-log
