#!/usr/bin/env node
// scripts/import-odoo-products.js
//
// Haalt alle verkoopbare/stockeerbare producten op uit Odoo en slaat ze op
// als artikelen in de lokale JSON-store (data/articles.json).
//
// Gebruik: npm run import-products
//
// Na het importeren kun je via het beheerpaneel (Artikelen) de afdelingen instellen,
// of je past data/articles.json rechtstreeks aan.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const readline = require('readline');

const ODOO_URL      = (process.env.ODOO_URL || '').replace(/\/+$/, '');
const ODOO_DB       = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY  = process.env.ODOO_API_KEY;

// Sla artikelen op in dezelfde locatie als de server gebruikt
const DATA_FILE = path.join(os.tmpdir(), 'technician_articles.json');

// ─── XML-RPC helpers ─────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function serializeValue(val) {
  if (val === null || val === undefined) return '<nil/>';
  if (typeof val === 'boolean') return `<boolean>${val ? 1 : 0}</boolean>`;
  if (typeof val === 'number' && Number.isInteger(val)) return `<int>${val}</int>`;
  if (typeof val === 'string') return `<string>${escapeXml(val)}</string>`;
  if (Array.isArray(val)) return `<array><data>${val.map(v=>`<value>${serializeValue(v)}</value>`).join('')}</data></array>`;
  if (typeof val === 'object') {
    const m = Object.entries(val).map(([k,v])=>`<member><name>${escapeXml(k)}</name><value>${serializeValue(v)}</value></member>`).join('');
    return `<struct>${m}</struct>`;
  }
  return `<string>${escapeXml(String(val))}</string>`;
}
function parseXmlValue(xml) {
  xml = xml.trim();
  if (xml.startsWith('<int>') || xml.startsWith('<i4>')) return parseInt(xml.replace(/<[^>]+>/g,''),10);
  if (xml.startsWith('<double>')) return parseFloat(xml.replace(/<[^>]+>/g,''));
  if (xml.startsWith('<boolean>')) return xml.includes('<boolean>1</boolean>');
  if (xml.startsWith('<string>')) return xml.replace(/<\/?string>/g,'').trim();
  if (xml.startsWith('<nil/>')) return null;
  if (xml.startsWith('<array>')) {
    const d = xml.match(/<data>([\s\S]*?)<\/data>/);
    if (!d) return [];
    return [...d[1].matchAll(/<value>([\s\S]*?)<\/value>/g)].map(m=>parseXmlValue(m[1]));
  }
  if (xml.startsWith('<struct>')) {
    const obj = {};
    for (const m of xml.matchAll(/<member>\s*<name>(.*?)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g))
      obj[m[1]] = parseXmlValue(m[2]);
    return obj;
  }
  return xml.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
async function xmlrpc(endpoint, method, params) {
  const body = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params.map(p=>`<param><value>${serializeValue(p)}</value></param>`).join('')}</params></methodCall>`;
  const res = await fetch(`${ODOO_URL}/xmlrpc/2/${endpoint}`, {
    method:'POST', headers:{'Content-Type':'text/xml'}, body
  });
  const text = await res.text();
  if (text.includes('<fault>')) {
    const msg = text.match(/<string>([\s\S]*?)<\/string>/)?.[1] || 'onbekend';
    throw new Error(msg);
  }
  const m = text.match(/<params>\s*<param>\s*<value>([\s\S]*?)<\/value>/);
  return m ? parseXmlValue(m[1]) : null;
}
async function odoo(model, method, args, kwargs={}) {
  return xmlrpc('object','execute_kw',[ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs]);
}

// ─── Readline helpers ─────────────────────────────────────────────────────────
function ask(rl, q) { return new Promise(r => rl.question(q, r)); }

// ─── Main ─────────────────────────────────────────────────────────────────────
let uid;

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Producten importeren vanuit Odoo               ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_API_KEY) {
    console.error('❌ .env.local is onvolledig. Voer eerst npm run setup-odoo uit.\n');
    process.exit(1);
  }

  // Authenticeren
  process.stdout.write('Verbinden met Odoo... ');
  uid = await xmlrpc('common','authenticate',[ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}]);
  if (!uid) { console.log('❌ Authenticatie mislukt.\n'); process.exit(1); }
  console.log(`✓ (gebruiker ID ${uid})\n`);

  // Producten ophalen — enkel stockeerbare en verbruiksartikelen
  process.stdout.write('Producten ophalen... ');
  const products = await odoo('product.product', 'search_read',
    [[['type', 'in', ['consu', 'product']], ['active', '=', true]]],
    { fields: ['id','name','default_code','uom_id','categ_id','type'], limit: 1000 }
  );
  console.log(`✓ ${products.length} producten gevonden\n`);

  if (products.length === 0) {
    console.log('⚠ Geen producten gevonden. Controleer of er producten zijn in Odoo.\n');
    process.exit(0);
  }

  // Toon eerste 10 als voorbeeld
  console.log('Voorbeeld van gevonden producten:');
  console.log('─'.repeat(70));
  console.log('ID'.padEnd(8) + 'Interne Ref'.padEnd(16) + 'Naam'.padEnd(40) + 'Eenheid');
  console.log('─'.repeat(70));
  products.slice(0, 10).forEach(p => {
    const id   = String(p.id).padEnd(8);
    const ref  = String(p.default_code || '—').padEnd(16);
    const name = String(p.name || '').slice(0,38).padEnd(40);
    const uom  = p.uom_id ? p.uom_id[1] : '?';
    console.log(`${id}${ref}${name}${uom}`);
  });
  if (products.length > 10) console.log(`... en nog ${products.length - 10} andere\n`);
  else console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Vraag of bestaande artikelen vervangen of samengevoegd worden
  console.log('Importmodus:');
  console.log('  1. Alles vervangen (alle huidige artikelen verwijderen en opnieuw importeren)');
  console.log('  2. Samenvoegen (enkel nieuwe producten toevoegen, bestaande bewaren)\n');
  const modeInput = (await ask(rl, 'Keuze [1/2, standaard=2]: ')).trim() || '2';
  const replace = modeInput === '1';

  // Standaard afdeling instellen
  console.log('\nStandaard afdeling voor alle geïmporteerde producten:');
  console.log('  all           = Alle afdelingen');
  console.log('  laadpalen     = Enkel laadpalen');
  console.log('  zonnepanelen  = Enkel zonnepanelen\n');
  const defaultDept = (await ask(rl, 'Afdeling [all]: ')).trim() || 'all';

  rl.close();

  // Bestaande artikelen laden
  let existing = [];
  if (!replace && fs.existsSync(DATA_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); } catch {}
  }
  const existingByOdooId = Object.fromEntries(existing.map(a => [a.odooId, a]));

  // Producten omzetten naar artikel-formaat
  const crypto = require('crypto');
  let added = 0, skipped = 0;

  for (const p of products) {
    if (existingByOdooId[p.id]) {
      skipped++;
      continue;
    }
    existingByOdooId[p.id] = {
      id:          `art-${crypto.randomBytes(4).toString('hex')}`,
      odooId:      p.id,
      internalRef: p.default_code || `ODOO-${p.id}`,
      name:        p.name,
      unit:        p.uom_id ? p.uom_id[1] : 'stuk',
      departments: [defaultDept],
      category:    p.categ_id ? p.categ_id[1].split(' / ').pop() : 'algemeen',
      active:      true,
    };
    added++;
  }

  const final = Object.values(existingByOdooId);
  fs.writeFileSync(DATA_FILE, JSON.stringify(final, null, 2));

  console.log(`\n✅ Import voltooid!`);
  console.log(`   Toegevoegd:  ${added}`);
  console.log(`   Overgeslagen (bestonden al): ${skipped}`);
  console.log(`   Totaal in store: ${final.length}`);
  console.log(`\n💡 Stel nu de afdelingen in via het beheerpaneel → Artikelen,`);
  console.log(`   of bewerk ${DATA_FILE} rechtstreeks.\n`);
  console.log(`   Herstart daarna de server: npm run dev\n`);
}

main().catch(e => { console.error('\n❌ Fout:', e.message); process.exit(1); });
