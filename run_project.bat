@echo off
REM Start the backend in the background in the same window
pushd %~dp0\src\Backend
if not exist "node_modules\package.json" (
    call npm install
)
start /b npm run server
popd

REM Start the frontend in the background in the same window
pushd %~dp0\src\Frontend
if not exist "node_modules\package.json" (
    call npm install
)
if not exist "node_modules\d3\package.json" (
    call npm install d3
)
start /b npm run dev
popd

REM Open localhost in the default browser
start "" "http://localhost:5173"
pause
