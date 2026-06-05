#!/usr/bin/env node
// scripts/seed-supabase.js
// Maakt de standaard admin-gebruiker aan in Supabase.
// Gebruik: node scripts/seed-supabase.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const crypto = require('crypto');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n❌ SUPABASE_URL of SUPABASE_SERVICE_KEY ontbreekt in .env.local\n');
  process.exit(1);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'salt_tech_portal').digest('hex');
}

async function supabase(table, method, body, filters = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${filters}`, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer':        'return=representation,resolution=merge-duplicates',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Supabase seed — Bestelportaal          ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`URL: ${SUPABASE_URL}\n`);

  // Admin gebruiker aanmaken (upsert op username)
  process.stdout.write('Admin gebruiker aanmaken... ');
  await supabase('users', 'POST', {
    id:            'admin-001',
    username:      'admin',
    password_hash: hashPassword('Admin@2024!'),
    name:          'Beheerder',
    role:          'admin',
    department:    'all',
    active:        true,
  });
  console.log('✓');

  console.log('\n✅ Seed voltooid!\n');
  console.log('Inloggegevens:');
  console.log('  Gebruikersnaam: admin');
  console.log('  Wachtwoord:     Admin@2024!');
  console.log('\n⚠  Wijzig het wachtwoord via het beheerpaneel na de eerste login.\n');
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
