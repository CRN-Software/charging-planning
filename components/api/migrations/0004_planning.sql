-- The household's week as corrected by its members (battery, drivers, stays, trips and charges added by hand).
alter table household add column planning jsonb not null default '{}'::jsonb;
