CREATE TABLE IF NOT EXISTS contact_requests (
  public_request_id uuid PRIMARY KEY,
  content_hash bytea NOT NULL CHECK (octet_length(content_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_request_id uuid NOT NULL REFERENCES contact_requests(public_request_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('notification', 'confirmation')),
  payload_ciphertext bytea CHECK (payload_ciphertext IS NULL OR octet_length(payload_ciphertext) > 0),
  payload_iv bytea CHECK (payload_iv IS NULL OR octet_length(payload_iv) = 12),
  payload_auth_tag bytea CHECK (payload_auth_tag IS NULL OR octet_length(payload_auth_tag) = 16),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  delivery_attempt_count integer NOT NULL DEFAULT 0 CHECK (
    delivery_attempt_count BETWEEN 0 AND 5
  ),
  delivery_attempt_generation integer NOT NULL DEFAULT 0 CHECK (
    delivery_attempt_generation >= 0
  ),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_owner text,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  provider_message_id text CHECK (
    provider_message_id IS NULL OR (
      length(provider_message_id) BETWEEN 1 AND 512
      AND provider_message_id !~ '[[:cntrl:]]'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (public_request_id, kind),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
  CHECK (lease_owner IS NULL OR length(lease_owner) BETWEEN 1 AND 128),
  CHECK (NOT (delivered_at IS NOT NULL AND failed_at IS NOT NULL)),
  CHECK (
    (payload_ciphertext IS NULL AND payload_iv IS NULL AND payload_auth_tag IS NULL)
    OR
    (payload_ciphertext IS NOT NULL AND payload_iv IS NOT NULL AND payload_auth_tag IS NOT NULL)
  ),
  CHECK (
    delivered_at IS NOT NULL OR failed_at IS NOT NULL OR payload_ciphertext IS NOT NULL
  ),
  CHECK (provider_message_id IS NULL OR delivered_at IS NOT NULL),
  CHECK (delivery_attempt_count <= delivery_attempt_generation),
  CHECK (delivery_attempt_generation <= attempt_count)
);

CREATE INDEX IF NOT EXISTS email_outbox_due_idx
  ON email_outbox (next_attempt_at, created_at, id)
  WHERE delivered_at IS NULL AND failed_at IS NULL;

CREATE INDEX IF NOT EXISTS email_outbox_lease_expiry_idx
  ON email_outbox (lease_expires_at)
  WHERE lease_expires_at IS NOT NULL AND delivered_at IS NULL AND failed_at IS NULL;

CREATE TABLE IF NOT EXISTS contact_rate_limits (
  network_source_hmac bytea NOT NULL CHECK (octet_length(network_source_hmac) = 32),
  window_start timestamptz NOT NULL,
  window_expires_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 1),
  PRIMARY KEY (network_source_hmac, window_start),
  CHECK (window_expires_at > window_start)
);

CREATE INDEX IF NOT EXISTS contact_rate_limits_expiry_idx
  ON contact_rate_limits (window_expires_at);
