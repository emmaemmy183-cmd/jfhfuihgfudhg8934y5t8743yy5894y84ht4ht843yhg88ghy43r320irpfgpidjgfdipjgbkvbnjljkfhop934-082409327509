-- Kennely 2027.21: sparse support metadata, no media duplicates.
CREATE INDEX IF NOT EXISTS idx_support_replies_author ON support_replies(author_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_likes_owner ON social_story_likes(user_id,story_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_owner ON social_post_likes(user_id,post_id);
CREATE INDEX IF NOT EXISTS idx_email_resend_per_user ON email_tokens(user_id,kind,created_at DESC);

CREATE TABLE IF NOT EXISTS staff_support_identity (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 display_name TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
