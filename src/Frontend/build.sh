#!/bin/bash
echo "Setting up manual build process..."
npm install
mkdir -p dist
cp index.html dist/
npx tsc --jsx react --outDir dist/js
cp -r public/* dist/ || true
echo "Build completed manually"