CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false, image text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE session (id text PRIMARY KEY, token text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), ip_address text, user_agent text, user_id text NOT NULL REFERENCES "user" ON DELETE CASCADE);
CREATE INDEX session_user_idx ON session(user_id);
CREATE TABLE account (id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL, user_id text NOT NULL REFERENCES "user" ON DELETE CASCADE, access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text, password text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider_id,account_id));
CREATE TABLE verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX verification_identifier ON verification(identifier);
CREATE TABLE portfolios (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, manager_id text NOT NULL REFERENCES "user"(id));
CREATE TABLE homes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid NOT NULL REFERENCES portfolios, label text NOT NULL, checkout_url text, lease_start date, lease_end date, monthly_cents integer CHECK(monthly_cents >= 0), UNIQUE(portfolio_id,label));
CREATE TABLE memberships (home_id uuid NOT NULL REFERENCES homes, user_id text NOT NULL REFERENCES "user", PRIMARY KEY(home_id,user_id));
CREATE INDEX memberships_user ON memberships(user_id);
CREATE TABLE invitations (digest text PRIMARY KEY, home_id uuid NOT NULL REFERENCES homes, email text NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days');
CREATE TABLE integration_keys (digest text PRIMARY KEY, home_id uuid UNIQUE NOT NULL REFERENCES homes);
CREATE TABLE tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), home_id uuid NOT NULL REFERENCES homes, subject text NOT NULL, details text NOT NULL, category text NOT NULL CHECK(category IN ('Plumbing','Heating and cooling','Electrical','Appliance','Access','Payment','Other')), urgency text NOT NULL CHECK(urgency IN ('low','normal','high','urgent')), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','completed','cancelled')), request_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(home_id,request_key), UNIQUE(home_id,id));
CREATE TABLE ticket_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, home_id uuid NOT NULL, ticket_id uuid NOT NULL, status text NOT NULL, urgency text NOT NULL, category text NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(home_id,ticket_id) REFERENCES tickets(home_id,id));
CREATE INDEX events_home_cursor ON ticket_events(home_id,id);
CREATE TABLE ledger (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), home_id uuid NOT NULL REFERENCES homes, kind text NOT NULL CHECK(kind IN ('charge','payment')), amount_cents integer NOT NULL CHECK(amount_cents>0), label text NOT NULL, booked_on date NOT NULL, request_key uuid NOT NULL, UNIQUE(home_id,request_key));
CREATE INDEX ledger_home ON ledger(home_id,booked_on);
CREATE TABLE contact_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL,message text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE request_limits (bucket text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE FUNCTION record_ticket_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ticket_events(home_id,ticket_id,status,urgency,category,note) VALUES(NEW.home_id,NEW.id,NEW.status,NEW.urgency,NEW.category,COALESCE(current_setting('sill.note',true),''));
  RETURN NEW;
END $$;
CREATE TRIGGER record_ticket AFTER INSERT OR UPDATE OF urgency,status ON tickets FOR EACH ROW EXECUTE FUNCTION record_ticket_change();
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['tickets','ticket_events','ledger'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY home_scope ON %I USING(home_id = nullif(current_setting(''sill.home'',true),'''')::uuid) WITH CHECK(home_id = nullif(current_setting(''sill.home'',true),'''')::uuid)',tab);
  END LOOP;
END $$;

