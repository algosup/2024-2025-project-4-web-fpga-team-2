#!/bin/bash
# Start the backend in the background
echo "Starting backend..."
cd src/Backend || exit
if [ ! -d "node_modules" ]; then npm install; fi
npm run server &
cd ../..

# Start the frontend in the foreground
echo "Starting frontend..."
cd src/Frontend || exit
if [ ! -d "node_modules" ]; then npm install; fi
npm run dev
