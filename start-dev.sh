#!/usr/bin/env bash
echo "[*] Starting Postgres & Redis containers in background..."
docker compose up -d
echo "[*] Starting Next.js Dev Server on http://localhost:3000..."
echo ""
npm run dev
