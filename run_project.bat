@echo off
REM Start the backend in a new command prompt window
start cmd /k "cd src\Backend && if not exist node_modules (call npm install) && call npm run server"

REM Start the frontend in a new command prompt window
start cmd /k "cd src\Frontend && if not exist node_modules (call npm install) && if not exist node_modules\d3 (call npm install d3) && call npm run dev"

REM Open localhost in the default browser
start "" "http://localhost:5173"
pause
