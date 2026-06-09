-- scripts/migration-add-location.sql
-- Voer dit uit in Supabase → SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS odoo_location_id integer;

-- Optioneel: voeg een comment toe voor documentatie
COMMENT ON COLUMN users.odoo_location_id IS 'ID van de bestelbus-locatie in Odoo (stock.location)';
