@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo     DECISIONAL - FULL AUTOMATED SETUP SCRIPT
echo ===================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Node.js not detected.
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo [*] Installing Node.js 20 LTS via Windows Package Manager...
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        echo [OK] Node.js installed. Please restart this script if needed.
    ) else (
        echo [ERROR] Please install Node.js 20+ from https://nodejs.org/ and re-run.
        pause
        exit /b 1
    )
)

:: 2. Check Docker (Postgres + Redis Provider)
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Docker is not installed on this system.
    echo [*] Docker is required to automatically run PostgreSQL + Redis with zero manual config.
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo [*] Attempting automated Docker Desktop installation via winget...
        winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
        echo.
        echo [!] Docker Desktop has been installed.
        echo [!] Please start Docker Desktop from your Start menu, wait for it to initialize, and run setup.bat again.
        pause
        exit /b 0
    ) else (
        echo [!] Please install Docker Desktop from https://www.docker.com/products/docker-desktop/
        echo     or enter your free Supabase + Upstash URLs in .env.
    )
)

:: 3. Create .env if not present
if not exist ".env" (
    echo [*] Creating .env configuration...
    (
        echo NODE_ENV="development"
        echo PORT=3000
        echo NEXTAUTH_URL="http://localhost:3000"
        echo NEXT_PUBLIC_APP_URL="http://localhost:3000"
        echo APP_BASE_URL="http://localhost:3000"
        echo NEXTAUTH_SECRET="decisional-dev-super-secret-key-32-chars-long!"
        echo.
        echo # Database (Local Postgres inside Docker)
        echo DATABASE_URL="postgresql://postgres:password@localhost:5432/decisional?sslmode=disable"
        echo.
        echo # Redis (Local Redis inside Docker)
        echo REDIS_URL="redis://localhost:6379"
        echo.
        echo # Development Secrets & Feature Mocks
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

:: 4. Start Postgres + Redis via Docker Compose
where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] Starting automated PostgreSQL 16 and Redis 7 containers...
    docker compose up -d
    echo [*] Waiting 6 seconds for Postgres to accept connections...
    timeout /t 6 /nobreak >nul
)

:: 5. Install NPM Dependencies
echo [*] Installing NPM dependencies...
call npm install

:: 6. Push Prisma schema & create tables
echo [*] Syncing database schema with Prisma...
call npx prisma db push

:: 7. Seed accounts and badges
echo [*] Seeding database with fully verified test accounts (Admin, Brand, Influencer)...
call npm run seed

echo.
echo ===================================================
echo   SETUP 100%% COMPLETE! READY-TO-USE TEST ACCOUNTS:
echo ===================================================
echo   Password for all accounts: Test@1234
echo.
echo   1. ADMIN:       admin@test.decisional.in
echo   2. BRAND:       brand@test.decisional.in (Wallet: Rs 1,00,000)
echo   3. INFLUENCER:  influencer@test.decisional.in
echo   4. INFLUENCER 2: influencer2@test.decisional.in
echo ===================================================
echo.
echo Launching development server on http://localhost:3000...
echo.
call npm run dev
