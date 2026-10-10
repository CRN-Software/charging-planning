-- The household's Tesla: the account that linked it, its sealed refresh token (single use,
-- rotated on every refresh) and the last data read from the car, never waking it.
create table vehicle_link (
  household_id uuid primary key references household (id) on delete cascade,
  linked_by uuid not null references account (id) on delete cascade,
  refresh_token bytea not null,
  vin text,
  display_name text,
  snapshot jsonb,
  checked_at timestamptz,
  asleep boolean not null default false,
  -- The last check failed (token revoked or expired): the household must link again.
  broken boolean not null default false,
  updated_at timestamptz not null default now()
);
