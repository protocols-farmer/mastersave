-- migrations/1_creating_tables.sql

-- ==========================================
-- 1. NUCLEAR CLEANUP
-- ==========================================
-- Safe only while there is no real data. Remove this section before the first real deployment.
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS withdrawal_requests CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS savings_goals CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS allocation_rules CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS transaction_type CASCADE;
DROP TYPE IF EXISTS transaction_bucket CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS auth_provider_type CASCADE;

DROP FUNCTION IF EXISTS initialize_user_finance CASCADE;
DROP FUNCTION IF EXISTS set_updated_at CASCADE;

-- ==========================================
-- 2. CORE SETUP & TYPES
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TYPE user_role AS ENUM ('user', 'admin', 'super_admin');
CREATE TYPE auth_provider_type AS ENUM ('local', 'google');
CREATE TYPE transaction_type AS ENUM ('deposit', 'withdraw', 'transfer');
CREATE TYPE transaction_bucket AS ENUM ('spend', 'save', 'undecided', 'split');

-- ==========================================
-- 3. UTILITY FUNCTIONS
-- ==========================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION initialize_user_finance() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO allocation_rules (user_id) VALUES (NEW.id);
    INSERT INTO wallets (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 4. TABLES
-- ==========================================

-- 4.1. USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) CHECK (email IS NULL OR email = lower(email)),
    phone_number VARCHAR(16) CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
    username VARCHAR(20) NOT NULL CHECK (char_length(username) >= 3 AND username = lower(username)),
    name VARCHAR(100),
    profile_title VARCHAR(100),
    avatar_url VARCHAR(2048) DEFAULT 'https://res.cloudinary.com/dhr9zmb3i/image/upload/v1782114895/avatar-fallback_jnzqae.jpg',
    password_hash VARCHAR(255) CHECK (password_hash IS NULL OR char_length(password_hash) >= 60),
    auth_provider auth_provider_type NOT NULL DEFAULT 'local',
    provider_id VARCHAR(255),
    role user_role NOT NULL DEFAULT 'user',
    last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

-- 4.2. AUTH TOKENS
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    parent_token_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_reason VARCHAR(50),
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent VARCHAR(1024),
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4.3. SYSTEM & AUDIT
CREATE TABLE system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    is_maintenance BOOLEAN NOT NULL DEFAULT false,
    maintenance_message VARCHAR(500) NOT NULL
        CHECK (char_length(maintenance_message) BETWEEN 10 AND 500)
        DEFAULT 'System is under maintenance. Protocols are being updated.',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO system_settings (id, is_maintenance) VALUES (1, false);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_username VARCHAR(20) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(action, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(admin_username, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(details, '')), 'C')
    ) STORED
);

-- 4.4. FINANCE TABLES
CREATE TABLE allocation_rules (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    spend_percentage INTEGER NOT NULL DEFAULT 60 CHECK (spend_percentage >= 0 AND spend_percentage <= 100),
    save_percentage INTEGER NOT NULL DEFAULT 40 CHECK (save_percentage >= 0 AND save_percentage <= 100),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CHECK (spend_percentage + save_percentage = 100)
);

-- Money in goals lives on the goals themselves. The wallet only holds spend and undecided money.
CREATE TABLE wallets (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    spend_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    undecided_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT wallets_spend_balance_nonnegative CHECK (spend_balance >= 0),
    CONSTRAINT wallets_undecided_balance_nonnegative CHECK (undecided_balance >= 0)
);

CREATE TABLE savings_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name VARCHAR(60) NOT NULL CHECK (char_length(btrim(name)) >= 1),
    target_amount NUMERIC(15, 2) NOT NULL CHECK (target_amount > 0),
    saved_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    -- money promised to pending cooldown withdrawals, so it cannot be withdrawn twice
    reserved_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    unlock_date TIMESTAMPTZ NOT NULL,
    -- set once, the first time the target is reached. A goal that reached its target stays unlocked.
    reached_target_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT savings_goals_status_check CHECK (status IN ('active', 'closed')),
    CONSTRAINT savings_goals_saved_within_target CHECK (saved_amount >= 0 AND saved_amount <= target_amount),
    CONSTRAINT savings_goals_reserved_within_saved CHECK (reserved_amount >= 0 AND reserved_amount <= saved_amount)
);

CREATE TABLE withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE RESTRICT,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ready_at TIMESTAMPTZ NOT NULL,
    idempotency_key VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    claimed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    CONSTRAINT withdrawal_requests_status_check CHECK (status IN ('pending', 'claimed', 'cancelled'))
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- RESTRICT: a hard delete of a user can never erase the money ledger
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    type transaction_type NOT NULL,
    bucket transaction_bucket NOT NULL,
    -- withdraw from a goal: the goal. transfer out of undecided: the destination goal (NULL = moved to spend).
    goal_id UUID REFERENCES savings_goals(id) ON DELETE RESTRICT,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    -- the early-withdrawal fee, recorded so wallet and ledger reconcile
    penalty_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    -- our own payment reference (text), sent to Flutterwave and returned in the webhook
    tx_ref VARCHAR(100),
    -- detects the same request arriving twice
    idempotency_key VARCHAR(100),
    -- how a completed deposit was split: spend, placed into goals, overflow to undecided
    spend_amount NUMERIC(15, 2),
    save_amount NUMERIC(15, 2),
    undecided_amount NUMERIC(15, 2),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT transactions_status_check
        CHECK (status IN ('pending', 'completed', 'failed')),

    CONSTRAINT transactions_penalty_nonnegative
        CHECK (penalty_amount >= 0),

    CONSTRAINT transactions_split_amounts_nonnegative
        CHECK (
            (spend_amount IS NULL OR spend_amount >= 0)
            AND (save_amount IS NULL OR save_amount >= 0)
            AND (undecided_amount IS NULL OR undecided_amount >= 0)
        ),

    CONSTRAINT transactions_deposit_requires_tx_ref
        CHECK (type <> 'deposit' OR tx_ref IS NOT NULL),

    -- A completed deposit must record a split that adds up to the exact deposit amount
    CONSTRAINT transactions_completed_deposit_split_adds_up
        CHECK (
            NOT (type = 'deposit' AND status = 'completed')
            OR (
                spend_amount IS NOT NULL
                AND save_amount IS NOT NULL
                AND undecided_amount IS NOT NULL
                AND spend_amount + save_amount + undecided_amount = amount
            )
        ),

    -- Money moving in or out of a goal always names the goal
    CONSTRAINT transactions_save_bucket_requires_goal
        CHECK (bucket <> 'save' OR goal_id IS NOT NULL),

    -- Internal transfers only ever leave the undecided bucket
    CONSTRAINT transactions_transfer_from_undecided
        CHECK (type <> 'transfer' OR bucket = 'undecided')
);

-- ==========================================
-- 5. PERFORMANCE + UNIQUENESS INDEXES
-- ==========================================
CREATE UNIQUE INDEX users_email_active_key ON users (email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_username_active_key ON users (username) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_phone_number_active_key ON users (phone_number) WHERE deleted_at IS NULL AND phone_number IS NOT NULL;
CREATE UNIQUE INDEX users_provider_active_key ON users (auth_provider, provider_id) WHERE deleted_at IS NULL AND provider_id IS NOT NULL;

CREATE INDEX idx_refresh_tokens_user_active ON refresh_tokens(user_id) WHERE is_revoked = false;
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_parent ON refresh_tokens(parent_token_id) WHERE parent_token_id IS NOT NULL;

CREATE INDEX idx_audit_logs_search ON audit_logs USING GIN(search_vector);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- One payment reference can only ever exist once
CREATE UNIQUE INDEX transactions_tx_ref_key
    ON transactions (tx_ref) WHERE tx_ref IS NOT NULL;

-- The same withdrawal request key can only be used once per user
CREATE UNIQUE INDEX transactions_idempotency_key
    ON transactions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Transaction history, newest first
CREATE INDEX idx_transactions_user_created
    ON transactions (user_id, created_at DESC);

CREATE INDEX idx_transactions_goal
    ON transactions (goal_id) WHERE goal_id IS NOT NULL;

CREATE INDEX idx_savings_goals_user_active
    ON savings_goals (user_id) WHERE status = 'active';

CREATE UNIQUE INDEX withdrawal_requests_idempotency_key
    ON withdrawal_requests (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_withdrawal_requests_user_pending
    ON withdrawal_requests (user_id) WHERE status = 'pending';

-- ==========================================
-- 6. AUTOMATION TRIGGERS
-- ==========================================

-- Auto-provision wallets/rules when a new user signs up
CREATE TRIGGER trigger_initialize_finance
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION initialize_user_finance();

-- Auto-update timestamps for all tables that have an updated_at column
CREATE TRIGGER trigger_update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_update_settings_timestamp
    BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_update_allocation_rules_timestamp
    BEFORE UPDATE ON allocation_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_update_wallets_timestamp
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_update_savings_goals_timestamp
    BEFORE UPDATE ON savings_goals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
