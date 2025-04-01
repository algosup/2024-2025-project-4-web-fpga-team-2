#!/bin/bash
# Start the backend in the background
echo "Starting backend..."
cd src/Backend || exit
npm run server &
cd ../..

# Start the frontend in the foreground
echo "Starting frontend..."
cd src/Frontend || exit
npm run dev
