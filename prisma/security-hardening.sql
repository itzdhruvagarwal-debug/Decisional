-- Enterprise Database Hardening Script
-- Target: PostgreSQL
-- Purpose: Move security controls into the database engine (Defense-in-Depth)

-- 1. IMMUTABILITY: Prevent UPDATE/DELETE on Transaction Ledger
-- This ensures the financial history cannot be tampered with even by a compromised app, requiring a true double-entry system (Chargebacks/Reversals)
CREATE OR REPLACE FUNCTION protect_ledger() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'TAMPER_DETECTION: Transaction ledger is immutable. Updates and Deletes are forbidden. Use offsetting transactions instead.';
END;
$$ LANGUAGE plpgsql;

-- Apply to Transaction table
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Transaction') THEN
        CREATE TRIGGER trg_immutable_transactions
        BEFORE UPDATE OR DELETE ON "Transaction"
        FOR EACH ROW EXECUTE FUNCTION protect_ledger();
    END IF;
END $$;


-- 2. ROW LEVEL SECURITY (RLS): Multi-Tenancy Protection & Enforcement
-- Prevents a user from accidentally (or maliciously) seeing another user's private data.
ALTER TABLE "Wallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wallet" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankAccount" FORCE ROW LEVEL SECURITY;
ALTER TABLE "VerificationDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationDocument" FORCE ROW LEVEL SECURITY;

-- Policy: Users can only see their own wallet
CREATE POLICY wallet_access_policy ON "Wallet"
    FOR ALL
    TO PUBLIC
    USING ( "userId" = current_setting('app.current_user_id', true) );

-- 3. AUTOMATIC AUDIT: Capture Schema Changes
-- Logs all DDL changes to a dedicated history table for compliance (SOC2 requirement).
CREATE TABLE IF NOT EXISTS "SchemaAudit" (
    id SERIAL PRIMARY KEY,
    event_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tag TEXT,
    object_type TEXT,
    schema_name TEXT,
    object_identity TEXT,
    query TEXT
);

CREATE OR REPLACE FUNCTION log_ddl_changes() RETURNS event_trigger AS $$
BEGIN
    INSERT INTO "SchemaAudit" (tag, object_type, schema_name, object_identity, query)
    VALUES (tg_tag, tg_type, tg_schema, tg_identity, current_query());
END;
$$ LANGUAGE plpgsql;

-- Apply Event Trigger (Superuser may be required)
-- CREATE EVENT TRIGGER trg_audit_ddl ON ddl_command_end EXECUTE FUNCTION log_ddl_changes();


-- 4. CONNECTION HARDENING
-- Restrict standard users to only the 'public' schema
REVOKE ALL ON DATABASE postgres FROM public;
GRANT CONNECT ON DATABASE postgres TO public;
REVOKE ALL ON SCHEMA public FROM public;
GRANT USAGE ON SCHEMA public TO public;

-- Note: In Production, create a 'decisional_app' user with limited permissions
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO decisional_app;
-- REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM decisional_app;

-- 5. DB-LEVEL CHECK CONSTRAINTS (Money Rules)
-- Ensure balances and amounts never dip below zero at the DB level, averting race conditions
ALTER TABLE "Wallet" ADD CONSTRAINT check_wallet_balance_positive CHECK (balance >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT check_wallet_pending_balance_positive CHECK ("pendingBalance" >= 0);

ALTER TABLE "Transaction" ADD CONSTRAINT check_transaction_amount_positive CHECK (amount > 0);
ALTER TABLE "PaymentHold" ADD CONSTRAINT check_hold_amount_positive CHECK (amount > 0);
ALTER TABLE "Withdrawal" ADD CONSTRAINT check_withdrawal_amount_positive CHECK (amount >= 0);
ALTER TABLE "Deal" ADD CONSTRAINT check_deal_amounts_positive CHECK (amount >= 0 AND "platformFee" >= 0 AND "gatewayFee" >= 0 AND "totalAmount" >= 0);

-- 6. STRICT ISOLATION POLICIES (RLS)
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY transaction_isolation ON "Transaction"
    FOR ALL
    TO PUBLIC
    USING (
      "walletId" IN (SELECT id FROM "Wallet" WHERE "userId" = current_setting('app.current_user_id', true))
    );

-- 7. IDEMPOTENCY LOCKS
-- Prevent duplicate processing of webhooks concurrently
CREATE UNIQUE INDEX IF NOT EXISTS "idx_processed_webhook_id" ON "ProcessedWebhookEvent"("eventId");

-- 8. AUDIT TRIGGERS for high-risk tables (Wallets)
CREATE TABLE IF NOT EXISTS "WalletAuditLog" (
    id SERIAL PRIMARY KEY,
    wallet_id TEXT NOT NULL,
    old_balance DECIMAL(18, 4),
    new_balance DECIMAL(18, 4),
    updated_by TEXT DEFAULT current_setting('app.current_user_id', true),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION audit_wallet_changes() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.balance IS DISTINCT FROM NEW.balance THEN
        INSERT INTO "WalletAuditLog" (wallet_id, old_balance, new_balance)
        VALUES (OLD.id, OLD.balance, NEW.balance);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_wallet_audit') THEN
        CREATE TRIGGER trg_wallet_audit
        AFTER UPDATE ON "Wallet"
        FOR EACH ROW EXECUTE FUNCTION audit_wallet_changes();
    END IF;
END $$;

-- 9. IMMUTABLE SYSTEM LOGS
-- Prevent anyone (even admins) from deleting audit logs
CREATE OR REPLACE FUNCTION protect_audit_log() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AUDIT SECURITY: Audit logs cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_immutable_audit') THEN
        CREATE TRIGGER trg_immutable_audit
        BEFORE UPDATE OR DELETE ON "WalletAuditLog"
        FOR EACH ROW EXECUTE FUNCTION protect_audit_log();
    END IF;
END $$;

-- 10. DIRECT BALANCE UPDATE PROTECTION
-- Prevents blind manual updates. Forces Wallet changes to rely on our double-entry flow or explicit secure context
CREATE OR REPLACE FUNCTION block_direct_wallet_updates() RETURNS TRIGGER AS $$
BEGIN
    -- Check if it's the balance changing
    IF OLD.balance IS DISTINCT FROM NEW.balance THEN
        -- Verify that a secure application context variable was set (so generic raw SQL fails)
        IF current_setting('app.secure_finance_context', true) IS NULL OR current_setting('app.secure_finance_context', true) != 'true' THEN
            RAISE EXCEPTION 'FINTECH SECURITY BREACH: Direct updates to Wallet balances are strictly forbidden without secure application context. Set app.secure_finance_context before transacting.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_block_direct_wallet_updates') THEN
        CREATE TRIGGER trg_block_direct_wallet_updates
        BEFORE UPDATE ON "Wallet"
        FOR EACH ROW EXECUTE FUNCTION block_direct_wallet_updates();
    END IF;
END $$;


