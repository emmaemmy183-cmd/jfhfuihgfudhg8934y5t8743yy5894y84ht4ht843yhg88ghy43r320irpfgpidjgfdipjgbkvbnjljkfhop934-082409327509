-- Kennely 2027.22: additional profile fields and verified email changes. Additive & repeatable.
CREATE TABLE IF NOT EXISTS profile_extras (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 pronouns TEXT NOT NULL DEFAULT '',
 sexuality TEXT NOT NULL DEFAULT '',
 sexuality_visible INTEGER NOT NULL DEFAULT 0,
 links_json TEXT NOT NULL DEFAULT '[]',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS account_email_changes (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 new_email TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL,
 used_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_changes_user_recent ON account_email_changes(user_id,created_at DESC);
