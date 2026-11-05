CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  display_name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'divers',
  looking_for TEXT NOT NULL DEFAULT 'alle',
  intent TEXT NOT NULL DEFAULT 'offen',
  bio TEXT NOT NULL DEFAULT '',
  interests TEXT NOT NULL DEFAULT '[]',
  visible INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  mime TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_at TEXT,
  reviewed_by TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id);
CREATE TABLE IF NOT EXISTS likes (
  from_user TEXT NOT NULL REFERENCES users(id),
  to_user TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (from_user, to_user)
);
CREATE INDEX IF NOT EXISTS idx_likes_received ON likes(to_user);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id),
  user_b TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_a, user_b)
);
CREATE INDEX IF NOT EXISTS idx_matches_a ON matches(user_a);
CREATE INDEX IF NOT EXISTS idx_matches_b ON matches(user_b);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at DESC);
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reported_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE TABLE IF NOT EXISTS abuse_events (
  event_key TEXT NOT NULL,
  bucket TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_key, bucket)
);

-- Kennely 2027 extensions. Additive, safe to re-run against existing installations.
CREATE TABLE IF NOT EXISTS team_members (
 user_id TEXT PRIMARY KEY REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('owner','admin','manager','moderator','support')),
 added_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS official_accounts (user_id TEXT PRIMARY KEY REFERENCES users(id), label TEXT NOT NULL DEFAULT 'Official');
CREATE TABLE IF NOT EXISTS user_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id), locale TEXT NOT NULL DEFAULT 'en', theme TEXT NOT NULL DEFAULT 'system',
 chat_locale TEXT NOT NULL DEFAULT 'en', notify_messages INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS age_checks (
 user_id TEXT PRIMARY KEY REFERENCES users(id), provider TEXT NOT NULL DEFAULT 'didit', provider_ref TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','declined','review')),
 verified_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
 actor_id TEXT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', read_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS support_tickets (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL, subject TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','waiting','resolved','closed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status,created_at DESC);
CREATE TABLE IF NOT EXISTS support_replies (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES support_tickets(id), author_id TEXT NOT NULL REFERENCES users(id),
 body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_replies_ticket ON support_replies(ticket_id,created_at ASC);
CREATE TABLE IF NOT EXISTS moderation_warnings (
 id TEXT PRIMARY KEY, target_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_restrictions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), feature TEXT NOT NULL CHECK(feature IN ('chat','likes','matching')),
 reason TEXT NOT NULL, until_at TEXT NOT NULL, imposed_by TEXT NOT NULL REFERENCES users(id), revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_restrictions_live ON user_restrictions(user_id,feature,until_at);
CREATE TABLE IF NOT EXISTS admin_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, details TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at DESC);
CREATE TABLE IF NOT EXISTS hidden_chats (
 user_id TEXT NOT NULL REFERENCES users(id), match_id TEXT NOT NULL REFERENCES matches(id), hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,match_id)
);
CREATE TABLE IF NOT EXISTS onboarding (
 user_id TEXT PRIMARY KEY REFERENCES users(id), step INTEGER NOT NULL DEFAULT 0, finished_at TEXT
);
CREATE TABLE IF NOT EXISTS skips (
 from_user TEXT NOT NULL REFERENCES users(id), to_user TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(from_user,to_user)
);
CREATE TABLE IF NOT EXISTS report_evidence (
 report_id TEXT NOT NULL REFERENCES reports(id), message_id TEXT NOT NULL REFERENCES messages(id),
 PRIMARY KEY(report_id,message_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_photos_status_created ON photos(status,created_at DESC);
CREATE TABLE IF NOT EXISTS email_tokens (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('verify','reset')),
 expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id,kind);
CREATE TABLE IF NOT EXISTS photo_review_notes (
 id TEXT PRIMARY KEY, photo_id TEXT NOT NULL REFERENCES photos(id), from_staff_id TEXT NOT NULL REFERENCES users(id),
 to_staff_id TEXT NOT NULL REFERENCES users(id), note TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_photo_review_assigned ON photo_review_notes(to_staff_id,created_at DESC);
CREATE TABLE IF NOT EXISTS photo_review_actions (
 id TEXT PRIMARY KEY, photo_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
