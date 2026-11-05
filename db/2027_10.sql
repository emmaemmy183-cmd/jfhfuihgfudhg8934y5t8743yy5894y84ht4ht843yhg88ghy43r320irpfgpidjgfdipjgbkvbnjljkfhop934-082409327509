-- Kennely 2027.10 additive privacy and interaction features. No image duplication or activity clickstream.
CREATE TABLE IF NOT EXISTS social_comment_likes (
  comment_id TEXT NOT NULL REFERENCES social_comments(id), user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY(comment_id,user_id)
);
CREATE TABLE IF NOT EXISTS social_dm_reactions (
  message_id TEXT NOT NULL REFERENCES social_dms(id), user_id TEXT NOT NULL REFERENCES users(id),
  emoji TEXT NOT NULL, PRIMARY KEY(message_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_comments_replies ON social_comments(parent_id,created_at);
