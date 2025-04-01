#!/bin/bash
# Start the backend in the background
echo "Starting backend..."
cd src/Backend || exit
if [ ! -d "node_modules" ]; then npm install; fi
npm run server &
back_pid=$!
trap 'echo "Shutting down backend..."; kill "$back_pid"; exit' SIGINT SIGTERM
cd ../..

# Start the frontend in the foreground
echo "Starting frontend..."
cd src/Frontend || exit
if [ ! -d "node_modules" ]; then npm install; fi
# Open localhost in the default browser after a short delay
(sleep 5 && open "http://localhost:5173") &
npm run dev
