-- Households and their members, signed in with Google.
create table household (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table account (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id),
  google_sub text not null unique,
  email text not null,
  name text not null,
  picture_url text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create index account_household_idx on account (household_id);

-- Offline access to the account's calendars; the refresh token is sealed (AES-256-GCM).
create table google_credential (
  account_id uuid primary key references account (id) on delete cascade,
  refresh_token bytea not null,
  scope text not null,
  updated_at timestamptz not null default now()
);

-- Only the SHA-256 of the session token is stored: a database leak does not leak sessions.
create table session (
  token_hash bytea primary key,
  account_id uuid not null references account (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index session_account_idx on session (account_id);
