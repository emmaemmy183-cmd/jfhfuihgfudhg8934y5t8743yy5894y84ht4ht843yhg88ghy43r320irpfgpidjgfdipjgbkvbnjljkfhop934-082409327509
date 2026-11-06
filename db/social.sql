-- Kennely Social 2027, additive schema, legacy dating tables stay intact for migration.
CREATE TABLE IF NOT EXISTS social_media (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), mime TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('post','story')), status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','approved','rejected')), reviewed_by TEXT,
 review_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_media_review ON social_media(status,created_at DESC);
CREATE TABLE IF NOT EXISTS social_posts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), caption TEXT NOT NULL DEFAULT '',
 media_id TEXT REFERENCES social_media(id), visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','followers')),
 status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','removed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_posts_date ON social_posts(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_author ON social_posts(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS social_follows (
 follower_id TEXT NOT NULL REFERENCES users(id), following_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(follower_id,following_id)
);
CREATE INDEX IF NOT EXISTS idx_social_followers ON social_follows(following_id);
CREATE TABLE IF NOT EXISTS social_post_likes (
 user_id TEXT NOT NULL REFERENCES users(id), post_id TEXT NOT NULL REFERENCES social_posts(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,post_id)
);
CREATE INDEX IF NOT EXISTS idx_social_likes_post ON social_post_likes(post_id);
CREATE TABLE IF NOT EXISTS social_post_saves (
 user_id TEXT NOT NULL REFERENCES users(id), post_id TEXT NOT NULL REFERENCES social_posts(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,post_id)
);
CREATE TABLE IF NOT EXISTS social_comments (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES social_posts(id), user_id TEXT NOT NULL REFERENCES users(id),
 body TEXT NOT NULL, parent_id TEXT, status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','removed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id,created_at);
CREATE TABLE IF NOT EXISTS social_stories (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),media_id TEXT REFERENCES social_media(id),
 body TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '#6436d8',story_style TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT NOT NULL DEFAULT (datetime('now','+24 hours'))
);
CREATE INDEX IF NOT EXISTS idx_social_stories_expiry ON social_stories(expires_at,created_at DESC);
CREATE TABLE IF NOT EXISTS social_threads (
 id TEXT PRIMARY KEY,user_a TEXT NOT NULL REFERENCES users(id),user_b TEXT NOT NULL REFERENCES users(id),
 initiator_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_a,user_b)
);
CREATE INDEX IF NOT EXISTS idx_social_threads_a ON social_threads(user_a,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_threads_b ON social_threads(user_b,created_at DESC);
CREATE TABLE IF NOT EXISTS social_dms (
 id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES social_threads(id),sender_id TEXT NOT NULL REFERENCES users(id),
 body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_dms_thread ON social_dms(thread_id,created_at DESC);
CREATE TABLE IF NOT EXISTS social_reports (
 id TEXT PRIMARY KEY,reporter_id TEXT NOT NULL REFERENCES users(id),target_user_id TEXT,
 post_id TEXT,comment_id TEXT,story_id TEXT, reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
 action_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_reports_open ON social_reports(status,created_at DESC);
CREATE TABLE IF NOT EXISTS social_appeals (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id), report_id TEXT, reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
