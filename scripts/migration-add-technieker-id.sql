-- scripts/migration-add-technieker-id.sql
-- Voer dit uit in Supabase → SQL Editor
-- Voegt het Odoo Technieker ID toe aan de gebruikerstabel.
-- Dit ID verwijst naar het many2one veld "x_studio_technieker" op stock.picking in Odoo.

alter table users add column if not exists odoo_technieker_id integer default null;
