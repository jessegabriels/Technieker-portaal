#!/usr/bin/env node
// scripts/test-odoo.js
// Snel testscript om de Odoo-verbinding te controleren.
// Gebruik: node scripts/test-odoo.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const ODOO_URL = (process.env.ODOO_URL || '').replace(/\/+$/, '');
const ODOO_DB  = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY  = process.env.ODOO_API_KEY;

console.log('\n╔══════════════════════════════════════╗');
console.log('║   Odoo verbindingstest               ║');
console.log('╚══════════════════════════════════════╝\n');
console.log('Instellingen:');
console.log(`  URL:      ${ODOO_URL}`);
console.log(`  Database: ${ODOO_DB}`);
console.log(`  Gebruiker: ${ODOO_USERNAME}`);
console.log(`  API-sleutel: ${ODOO_API_KEY ? ODOO_API_KEY.slice(0,8) + '...' : '⚠ NIET INGESTELD'}\n`);

if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_API_KEY) {
  console.error('❌ Een of meer omgevingsvariabelen ontbreken in .env.local\n');
  process.exit(1);
}

function escapeXml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function serializeValue(val) {
  if (typeof val === 'number' && Number.isInteger(val)) return `<int>${val}</int>`;
  if (typeof val === 'string') return `<string>${escapeXml(val)}</string>`;
  if (typeof val === 'object' && !Array.isArray(val)) {
    const m = Object.entries(val).map(([k,v]) => `<member><name>${k}</name><value>${serializeValue(v)}</value></member>`).join('');
    return `<struct>${m}</struct>`;
  }
  return `<string>${escapeXml(String(val))}</string>`;
}
function parseXmlValue(xml) {
  xml = xml.trim();
  if (xml.startsWith('<int>') || xml.startsWith('<i4>')) return parseInt(xml.replace(/<[^>]+>/g,''),10);
  if (xml.startsWith('<boolean>')) return xml.includes('<boolean>1</boolean>');
  if (xml.startsWith('<string>')) return xml.replace(/<\/?string>/g,'').trim();
  if (xml.startsWith('<nil/>')) return null;
  return xml.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
async function xmlrpc(endpoint, method, params) {
  const body = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params.map(p=>`<param><value>${serializeValue(p)}</value></param>`).join('')}</params></methodCall>`;
  const res = await fetch(`${ODOO_URL}/xmlrpc/2/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body
  });
  const text = await res.text();
  if (text.includes('<fault>')) {
    const msg = text.match(/<string>([\s\S]*?)<\/string>/)?.[1] || 'onbekend';
    throw new Error(`Odoo fout: ${msg}`);
  }
  const m = text.match(/<params>\s*<param>\s*<value>([\s\S]*?)<\/value>/);
  return m ? parseXmlValue(m[1]) : null;
}

async function main() {
  // Test 1: Server bereikbaar?
  process.stdout.write('1. Server bereikbaar?  ');
  try {
    const version = await xmlrpc('common', 'version', []);
    console.log(`✓ Odoo ${typeof version === 'object' ? version.server_version || '?' : '?'}`);
  } catch(e) {
    console.log(`❌ ${e.message}`);
    console.log('   → Controleer ODOO_URL in .env.local\n');
    process.exit(1);
  }

  // Test 2: Database bestaat?
  process.stdout.write('2. Database gevonden?  ');
  try {
    const dbs = await xmlrpc('db', 'list', []);
    if (Array.isArray(dbs)) {
      if (dbs.includes(ODOO_DB)) {
        console.log(`✓ "${ODOO_DB}" gevonden`);
      } else {
        console.log(`❌ "${ODOO_DB}" niet gevonden`);
        console.log(`   Beschikbare databases: ${dbs.join(', ')}`);
        console.log('   → Pas ODOO_DB aan in .env.local\n');
        process.exit(1);
      }
    } else {
      console.log('⚠ Kan databases niet ophalen (normaal bij Odoo SaaS)');
    }
  } catch(e) {
    console.log(`⚠ ${e.message} (normaal bij Odoo SaaS — doorgaan)`);
  }

  // Test 3: Inloggen met API-sleutel
  process.stdout.write('3. Inloggen (API-key)?  ');
  let uid;
  try {
    uid = await xmlrpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}]);
    if (!uid || uid === false) throw new Error('authenticate gaf false terug');
    console.log(`✓ Ingelogd als gebruiker ID ${uid}`);
  } catch(e) {
    console.log(`❌ ${e.message}`);
    console.log('\n   Mogelijke oorzaken:');
    console.log('   • API-sleutel is niet correct gekopieerd (controleer .env.local)');
    console.log('   • API-sleutel is aangemaakt voor een andere gebruiker');
    console.log('   • Gebruiker heeft geen API-toegang (Instellingen → Gebruiker → API-sleutels)');
    console.log('   • Odoo SaaS vereist een specifiek IP-adres voor API-toegang\n');
    process.exit(1);
  }

  // Test 4: Rechten op stock.picking
  process.stdout.write('4. Rechten stock.picking?  ');
  try {
    const result = await xmlrpc('object', 'execute_kw', [
      ODOO_DB, uid, ODOO_API_KEY,
      'stock.picking', 'search_count', [[]], {}
    ]);
    console.log(`✓ Toegang OK (${result} transfers zichtbaar)`);
  } catch(e) {
    console.log(`❌ ${e.message}`);
    console.log('   → Gebruiker heeft geen rechten op Voorraadbeheer\n');
    process.exit(1);
  }

  console.log('\n✅ Alle tests geslaagd — Odoo-verbinding werkt correct!\n');
}

main().catch(e => { console.error('\n❌ Onverwachte fout:', e.message); process.exit(1); });
