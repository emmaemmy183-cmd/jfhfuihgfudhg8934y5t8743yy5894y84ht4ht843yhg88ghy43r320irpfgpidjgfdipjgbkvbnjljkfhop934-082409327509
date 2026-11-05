CREATE TABLE IF NOT EXISTS email_quotas (key TEXT NOT NULL,bucket TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(key,bucket));
CREATE INDEX IF NOT EXISTS idx_email_quotas_bucket ON email_quotas(bucket);
