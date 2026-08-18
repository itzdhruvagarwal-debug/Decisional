@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo     DECISIONAL - 1-CLICK NEW LAPTOP SETUP SCRIPT
echo ===================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js 20+ from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Create .env if not present
if not exist ".env" (
    echo [*] Creating .env file from template...
    (
        echo NODE_ENV="development"
        echo PORT=3000
        echo NEXTAUTH_URL="http://localhost:3000"
        echo NEXT_PUBLIC_APP_URL="http://localhost:3000"
        echo APP_BASE_URL="http://localhost:3000"
        echo NEXTAUTH_SECRET="decisional-dev-super-secret-key-32-chars-long!"
        echo.
        echo # Database (Local Postgres)
        echo DATABASE_URL="postgresql://postgres:password@localhost:5432/decisional?sslmode=disable"
        echo.
        echo # Redis (Local Redis)
        echo REDIS_URL="redis://localhost:6379"
        echo.
        echo # Development Secrets & Features
        echo CRON_SECRET="dev-cron-secret"
        echo CONTRACT_SIGNING_SECRET="dev-contract-signing-secret"
        echo SIGNING_SECRET="dev-signing-secret"
        echo TEST_ACCOUNT_PASSWORD="Test@1234"
        echo KYC_PROVIDER="manual"
        echo STORAGE_PROVIDER="local"
        echo OTP_PROVIDER="console"
        echo SMS_PROVIDER="console"
        echo WHATSAPP_PROVIDER="console"
        echo DISABLE_DISPOSABLE_CHECK="true"
    ) > .env
    echo [OK] .env created!
) else (
    echo [OK] .env already exists.
)

:: 3. Check Docker & Start Postgres + Redis
where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] Docker detected. Starting local Postgres and Redis containers...
    docker compose up -d
    echo [*] Waiting for database to be ready...
    timeout /t 5 /nobreak >nul
) else (
    echo [!] Docker not found. Make sure local Postgres (port 5432) and Redis (port 6379) are running!
)

:: 4. Install dependencies
echo [*] Installing NPM dependencies...
call npm install

:: 5. Push Prisma schema
echo [*] Initializing database schema (Prisma db push)...
call npx prisma db push

:: 6. Seed accounts
echo [*] Seeding database with fully verified Test Accounts (Admin, Brand, Influencer)...
call npm run seed

echo.
echo ===================================================
echo   SETUP COMPLETE! SEEDED LOGIN CREDENTIALS:
echo ===================================================
echo   Password for all accounts: Test@1234
echo.
echo   - ADMIN:       admin@test.decisional.in
echo   - BRAND:       brand@test.decisional.in (Wallet: Rs 1,00,000)
echo   - INFLUENCER:  influencer@test.decisional.in
echo   - INFLUENCER 2: influencer2@test.decisional.in
echo ===================================================
echo.
echo Starting development server on http://localhost:3000...
echo.
call npm run dev
