@echo off
REM Start the backend in a new command prompt window
start cmd /k "cd src\Backend && npm run server"

REM Start the frontend in a new command prompt window
start cmd /k "cd src\Frontend && npm run dev"
