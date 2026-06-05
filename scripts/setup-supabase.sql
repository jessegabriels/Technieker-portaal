-- scripts/setup-supabase.sql
-- Voer dit uit in Supabase → SQL Editor

-- Gebruikers
create table if not exists users (
  id            text primary key,
  username      text unique not null,
  password_hash text not null,
  name          text not null,
  role          text not null default 'technician',
  department    text not null default 'laadpalen',
  active        boolean not null default true,
  created_at    timestamptz default now()
);

-- Artikelen
create table if not exists articles (
  id           text primary key,
  odoo_id      integer,
  internal_ref text unique,
  name         text not null,
  unit         text default 'stuk',
  departments  text[] default '{all}',
  category     text default 'algemeen',
  active       boolean not null default true,
  created_at   timestamptz default now()
);

-- Bestellingen
create table if not exists orders (
  id                text primary key,
  user_id           text not null,
  user_name         text,
  user_department   text,
  items             jsonb default '[]',
  note              text default '',
  odoo_picking_id   integer,
  odoo_picking_name text,
  odoo_error        text,
  status            text default 'confirmed',
  created_at        timestamptz default now()
);

-- Row Level Security uitschakelen (we gebruiken service_role key server-side)
alter table users    disable row level security;
alter table articles disable row level security;
alter table orders   disable row level security;
