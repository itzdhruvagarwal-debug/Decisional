#!/usr/bin/env bash
set -e

DIVIDER="==================================================="

echo "${DIVIDER}"
echo "    DECISIONAL - FULL AUTOMATED SETUP SCRIPT"
echo "${DIVIDER}"
echo ""

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "[!] Node.js not found. Installing..."
    if command -v brew &> /dev/null; then
        brew install node@20
    elif command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y nodejs npm
    else
        echo "[ERROR] Please install Node.js 20+ from https://nodejs.org/" >&2
        exit 1
    fi
fi

# 2. Check Docker
if ! command -v docker &> /dev/null; then
    echo "[!] Docker not detected. Attempting automated install..."
    if command -v brew &> /dev/null; then
        brew install --cask docker
        echo "[!] Please open Docker Desktop once to initialize it, then re-run ./setup.sh"
        exit 0
    elif command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y docker.io docker-compose
        sudo systemctl start docker
    fi
fi

# 3. Create .env if not present
if [[ ! -f ".env" ]]; then
    echo "[*] Creating .env configuration..."
    cat << 'EOF' > .env
NODE_ENV="development"
PORT=3000
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_BASE_URL="http://localhost:3000"
NEXTAUTH_SECRET="decisional-dev-super-secret-key-32-chars-long!"

# Database (Local Postgres inside Docker)
DATABASE_URL="postgresql://postgres:password@localhost:5432/decisional?sslmode=disable"

# Redis (Local Redis inside Docker)
REDIS_URL="redis://localhost:6379"

# Development Secrets & Feature Mocks
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
fi

# 4. Start Postgres + Redis via Docker Compose
if command -v docker &> /dev/null; then
    echo "[*] Starting automated PostgreSQL 16 and Redis 7 containers..."
    docker compose up -d
    echo "[*] Waiting 6 seconds for database to accept connections..."
    sleep 6
fi

# 5. Install NPM dependencies securely
echo "[*] Installing NPM dependencies..."
npm install --ignore-scripts
npx --no-install prisma generate

# 6. Push Prisma schema using local binaries
echo "[*] Syncing database schema with Prisma..."
npx --no-install prisma db push

# 7. Seed accounts
echo "[*] Seeding database with fully verified test accounts (Admin, Brand, Influencer)..."
npm run seed

echo ""
echo "${DIVIDER}"
echo "  SETUP 100% COMPLETE! READY-TO-USE TEST ACCOUNTS:"
echo "${DIVIDER}"
echo "  Password for all accounts: Test@1234"
echo ""
echo "  1. ADMIN:       admin@test.decisional.in"
echo "  2. BRAND:       brand@test.decisional.in (Wallet: Rs 1,00,000)"
echo "  3. INFLUENCER:  influencer@test.decisional.in"
echo "  4. INFLUENCER 2: influencer2@test.decisional.in"
echo "${DIVIDER}"
echo ""
echo "Launching development server on http://localhost:3000..."
echo ""
npm run dev
