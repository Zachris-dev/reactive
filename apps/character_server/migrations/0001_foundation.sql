-- First local alpha: accounts, campaigns, permissions, invitations, and audit.
-- Run only against the development database with server.cmd init.
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, display_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0,1)),
 last_active_at TEXT NOT NULL, is_test_data INTEGER NOT NULL DEFAULT 0 CHECK (is_test_data IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaigns (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
 is_test_data INTEGER NOT NULL DEFAULT 0 CHECK (is_test_data IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS memberships (
 campaign_id TEXT NOT NULL REFERENCES campaigns(id), user_id TEXT NOT NULL REFERENCES users(id),
 is_gm INTEGER NOT NULL DEFAULT 0 CHECK (is_gm IN (0,1)),
 joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(campaign_id, user_id)
);
CREATE TABLE IF NOT EXISTS invitations (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id),
 kind TEXT NOT NULL CHECK (kind IN ('player','group','gm')), token_hash TEXT NOT NULL UNIQUE,
 issued_by TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL,
 max_uses INTEGER NOT NULL CHECK(max_uses >= 1), uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0),
 revoked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_events (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), action TEXT NOT NULL,
 target_id TEXT, details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_invites_campaign ON invitations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
