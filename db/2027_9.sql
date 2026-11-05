-- Kennely 2027.9, additive, compact metadata (no click tracking, private-message spy logs or IP history).
CREATE TABLE IF NOT EXISTS social_follow_requests (
 follower_id TEXT NOT NULL REFERENCES users(id), following_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(follower_id,following_id)
);
CREATE INDEX IF NOT EXISTS idx_follow_requests_receiver ON social_follow_requests(following_id,created_at DESC);
CREATE TABLE IF NOT EXISTS social_story_likes (
 story_id TEXT NOT NULL REFERENCES social_stories(id), user_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(story_id,user_id)
);
CREATE TABLE IF NOT EXISTS staff_permissions (
 user_id TEXT NOT NULL REFERENCES users(id), capability TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 PRIMARY KEY(user_id,capability)
);
CREATE TABLE IF NOT EXISTS role_permissions (
 role TEXT NOT NULL, capability TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 PRIMARY KEY(role,capability)
);
CREATE TABLE IF NOT EXISTS profile_labels (
 user_id TEXT NOT NULL REFERENCES users(id), label TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'purple',
 granted_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,label)
);
CREATE TABLE IF NOT EXISTS moderation_terms (
 term TEXT PRIMARY KEY, action TEXT NOT NULL CHECK(action IN ('review','allow')),
 language TEXT NOT NULL DEFAULT 'custom', changed_by TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS account_states (
 user_id TEXT PRIMARY KEY REFERENCES users(id), reason TEXT NOT NULL, rule_id TEXT NOT NULL,
 suspended_by TEXT NOT NULL, suspended_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 grace_until TEXT NOT NULL DEFAULT (datetime('now','+30 days')),
 appealed_at TEXT, appeal_reason TEXT, appeal_status TEXT NOT NULL DEFAULT 'none',
 resolved_by TEXT, reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_account_states_grace ON account_states(grace_until);
CREATE INDEX IF NOT EXISTS idx_social_dms_unread ON social_dms(thread_id,read_at,created_at DESC);
