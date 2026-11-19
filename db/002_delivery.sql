CREATE TABLE webhook_delivery (home_id uuid PRIMARY KEY REFERENCES homes, last_id bigint NOT NULL DEFAULT 0, lease_until timestamptz, claim uuid);

