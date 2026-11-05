-- 2027.12: additive indexes for high-frequency reading paths; no duplicated content.
CREATE INDEX IF NOT EXISTS idx_follow_list_order ON social_follows(following_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_following_list_order ON social_follows(follower_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_comments_recent ON social_comments(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_reaction_message ON social_dm_reactions(message_id);
