-- Household setup (home, people and their calendars), validated by @charging/contracts.
alter table household add column settings jsonb not null default '{}'::jsonb;

-- Nominatim answers, shared by every household: an address never needs to be looked up twice.
-- lat/lon null = not found.
create table geocode_cache (
  query text primary key,
  lat double precision,
  lon double precision,
  label text,
  created_at timestamptz not null default now()
);

-- OSRM driving routes between rounded coordinates (5 decimals ≈ 1 m).
create table route_cache (
  from_lat numeric(8, 5) not null,
  from_lon numeric(8, 5) not null,
  to_lat numeric(8, 5) not null,
  to_lon numeric(8, 5) not null,
  km real not null,
  min real not null,
  created_at timestamptz not null default now(),
  primary key (from_lat, from_lon, to_lat, to_lon)
);
