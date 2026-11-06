-- Kennely 2027.19: short-lived review grants, no private message access.
CREATE TABLE IF NOT EXISTS staff_private_review_access (
 actor_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL, expires_at TEXT NOT NULL,
 PRIMARY KEY(actor_id,target_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_private_review_expiry ON staff_private_review_access(expires_at);
