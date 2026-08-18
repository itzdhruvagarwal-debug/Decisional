#!/usr/bin/env bash
set -e

echo "==================================================="
echo "    DECISIONAL - 1-CLICK NEW LAPTOP SETUP SCRIPT"
echo "==================================================="
echo ""

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed. Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

# 2. Create .env if not present
if [ ! -f ".env" ]; then
    echo "[*] Creating .env file from template..."
    cat << 'EOF' > .env
NODE_ENV="development"
PORT=3000
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_BASE_URL="http://localhost:3000"
NEXTAUTH_SECRET="decisional-dev-super-secret-key-32-chars-long!"

# Database (Local Postgres)
DATABASE_URL="postgresql://postgres:password@localhost:5432/decisional?sslmode=disable"

# Redis (Local Redis)
REDIS_URL="redis://localhost:6379"

# Development Secrets & Features
CRON_SECRET="dev-cron-secret"
CONTRACT_SIGNING_SECRET="dev-contract-signing-secret"
SIGNING_SECRET="dev-signing-secret"
TEST_ACCOUNT_PASSWORD="Test@1234"
KYC_PROVIDER="manual"
STORAGE_PROVIDER="local"
OTP_PROVIDER="console"
SMS_PROVIDER="console"
WHATSAPP_PROVIDER="console"
DISABLE_DISPOSABLE_CHECK="true"
EOF
    echo "[OK] .env created!"
else
    echo "[OK] .env already exists."
fi

# 3. Check Docker & Start Postgres + Redis
if command -v docker &> /dev/null; then
    echo "[*] Docker detected. Starting local Postgres and Redis containers..."
    docker compose up -d
    echo "[*] Waiting for database to be ready..."
    sleep 5
else
    echo "[!] Docker not found. Make sure local Postgres (port 5432) and Redis (port 6379) are running!"
fi

# 4. Install dependencies
echo "[*] Installing NPM dependencies..."
npm install

# 5. Push Prisma schema
echo "[*] Initializing database schema (Prisma db push)..."
npx prisma db push

# 6. Seed accounts
echo "[*] Seeding database with fully verified Test Accounts (Admin, Brand, Influencer)..."
npm run seed

echo ""
echo "==================================================="
echo "  SETUP COMPLETE! SEEDED LOGIN CREDENTIALS:"
echo "==================================================="
echo "  Password for all accounts: Test@1234"
echo ""
echo "  - ADMIN:       admin@test.decisional.in"
echo "  - BRAND:       brand@test.decisional.in (Wallet: Rs 1,00,000)"
echo "  - INFLUENCER:  influencer@test.decisional.in"
echo "  - INFLUENCER 2: influencer2@test.decisional.in"
echo "==================================================="
echo ""
echo "Starting development server on http://localhost:3000..."
echo ""
npm run dev
