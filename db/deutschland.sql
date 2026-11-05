-- Zusatzmigration: bestehende Nutzer und Beiträge bleiben erhalten.
-- Einträge werden erst nach einer Teamentscheidung öffentlich sichtbar.
CREATE TABLE IF NOT EXISTS content_reviews (
  id TEXT PRIMARY KEY, content_type TEXT NOT NULL CHECK(content_type IN ('post','story','comment')),
  content_id TEXT NOT NULL, user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewer_id TEXT, reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TEXT,
  UNIQUE(content_type, content_id)
);
CREATE INDEX IF NOT EXISTS idx_content_reviews_queue ON content_reviews(status, created_at);
CREATE TABLE IF NOT EXISTS dm_report_evidence (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES social_reports(id),
  thread_id TEXT NOT NULL REFERENCES social_threads(id),
  message_id TEXT NOT NULL REFERENCES social_dms(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(report_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_dm_report_evidence ON dm_report_evidence(report_id);
CREATE TABLE IF NOT EXISTS disclosure_requests (
  id TEXT PRIMARY KEY, reference TEXT NOT NULL, authority TEXT NOT NULL,
  legal_basis TEXT NOT NULL, requested_scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', opened_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
-- Bisherige Veröffentlichungen müssen nach der Umstellung ebenfalls geprüft werden.
INSERT OR IGNORE INTO content_reviews (id,content_type,content_id,user_id)
SELECT lower(hex(randomblob(16))),'post',id,user_id FROM social_posts WHERE status='published';
INSERT OR IGNORE INTO content_reviews (id,content_type,content_id,user_id)
SELECT lower(hex(randomblob(16))),'story',id,user_id FROM social_stories;
INSERT OR IGNORE INTO content_reviews (id,content_type,content_id,user_id)
SELECT lower(hex(randomblob(16))),'comment',id,user_id FROM social_comments WHERE status='published';
CREATE TABLE IF NOT EXISTS social_hidden_threads (
  user_id TEXT NOT NULL, thread_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,thread_id)
);
CREATE TABLE IF NOT EXISTS social_media_forwards (
  id TEXT PRIMARY KEY, media_id TEXT NOT NULL, from_staff_id TEXT NOT NULL,
  to_staff_id TEXT NOT NULL, note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_forwards_recipient ON social_media_forwards(to_staff_id,created_at DESC);
