-- scripts/migration-portal-returns.sql
-- Voer dit uit in Supabase → SQL Editor
-- Slaat retourbonnen aangemaakt via het portaal op, zodat ze
-- verwijderd kunnen worden uit de poraalweergave zonder de Odoo picking te raken.

create table if not exists portal_returns (
  id                text primary key,
  user_id           text not null,
  origin            text unique not null,
  odoo_picking_id   integer,
  odoo_picking_name text,
  note              text default '',
  created_at        timestamptz default now()
);

alter table portal_returns disable row level security;
