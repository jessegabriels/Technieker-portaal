#!/usr/bin/env node
// scripts/setup-odoo-apikey.js
//
// Dit script:
//  1. Vraagt je Odoo URL, database, gebruikersnaam en wachtwoord
//  2. Authenticeert via XML-RPC met het wachtwoord
//  3. Maakt een API-sleutel aan via de Odoo backend
//  4. Schrijft alle waarden naar .env.local
//
// Gebruik: npm run setup-odoo

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.resolve(__dirname, '../.env.local');

// ─── XML-RPC helpers (standalone, geen import van lib/odoo.js) ──────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function serializeValue(val) {
  if (val === null || val === undefined) return '<nil/>';
  if (typeof val === 'boolean') return `<boolean>${val ? 1 : 0}</boolean>`;
  if (typeof val === 'number' && Number.isInteger(val)) return `<int>${val}</int>`;
  if (typeof val === 'number') return `<double>${val}</double>`;
  if (typeof val === 'string') return `<string>${escapeXml(val)}</string>`;
  if (Array.isArray(val)) return `<array><data>${val.map(v => `<value>${serializeValue(v)}</value>`).join('')}</data></array>`;
  if (typeof val === 'object') {
    const members = Object.entries(val).map(([k, v]) =>
      `<member><name>${escapeXml(k)}</name><value>${serializeValue(v)}</value></member>`).join('');
    return `<struct>${members}</struct>`;
  }
  return `<string>${escapeXml(String(val))}</string>`;
}

function parseXmlValue(xml) {
  xml = xml.trim();
  if (xml.startsWith('<int>') || xml.startsWith('<i4>')) return parseInt(xml.replace(/<[^>]+>/g, ''), 10);
  if (xml.startsWith('<double>')) return parseFloat(xml.replace(/<[^>]+>/g, ''));
  if (xml.startsWith('<boolean>')) return xml.includes('<boolean>1</boolean>');
  if (xml.startsWith('<string>')) return xml.replace(/<\/?string>/g, '').trim();
  if (xml.startsWith('<nil/>')) return null;
  if (xml.startsWith('<array>')) {
    const dataMatch = xml.match(/<data>([\s\S]*?)<\/data>/);
    if (!dataMatch) return [];
    return [...dataMatch[1].matchAll(/<value>([\s\S]*?)<\/value>/g)].map(m => parseXmlValue(m[1]));
  }
  if (xml.startsWith('<struct>')) {
    const obj = {};
    for (const m of xml.matchAll(/<member>\s*<name>(.*?)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g)) {
      obj[m[1]] = parseXmlValue(m[2]);
    }
    return obj;
  }
  return xml.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}

async function xmlrpcCall(baseUrl, endpoint, method, params) {
  const xmlBody = `<?xml version="1.0"?>\n<methodCall>\n  <methodName>${method}</methodName>\n  <params>\n    ${params.map(p => `<param><value>${serializeValue(p)}</value></param>`).join('\n    ')}\n  </params>\n</methodCall>`;
  const res = await fetch(`${baseUrl}/xmlrpc/2/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xmlBody,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  if (text.includes('<fault>')) {
    const msg = text.match(/<string>([\s\S]*?)<\/string>/)?.[1] || 'onbekende fout';
    throw new Error(`Odoo fout: ${msg}`);
  }
  const m = text.match(/<params>\s*<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>\s*<\/params>/);
  if (!m) throw new Error('Kon Odoo-antwoord niet verwerken');
  return parseXmlValue(m[1].trim());
}

// ─── Readline helpers ────────────────────────────────────────────────────────

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function askSecret(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let val = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(wasRaw);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(val);
      } else if (ch === '\u0003') {
        process.exit();
      } else if (ch === '\u007f') {
        if (val.length > 0) { val = val.slice(0, -1); process.stdout.write('\b \b'); }
      } else {
        val += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

// ─── .env.local lezen/schrijven ──────────────────────────────────────────────

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  const obj = {};
  for (const line of lines) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
    if (m) obj[m[1]] = m[2].trim();
  }
  return obj;
}

function writeEnv(obj) {
  const lines = Object.entries(obj).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', 'utf8');
}

// ─── Hoofdprogramma ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Odoo API-sleutel setup — Bestelportaal     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const existing = readEnv();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const url = (await ask(rl, `Odoo URL [${existing.ODOO_URL || 'https://jouw-odoo.com'}]: `)).trim() || existing.ODOO_URL;
  const db  = (await ask(rl, `Database [${existing.ODOO_DB || ''}]: `)).trim() || existing.ODOO_DB;
  const user = (await ask(rl, `Gebruikersnaam / e-mail [${existing.ODOO_USERNAME || ''}]: `)).trim() || existing.ODOO_USERNAME;
  rl.close();

  const password = await askSecret('Wachtwoord (wordt NIET opgeslagen): ');

  console.log('\n⏳ Verbinding maken met Odoo...');

  // Stap 1: authenticeren met wachtwoord → uid
  let uid;
  try {
    uid = await xmlrpcCall(url, 'common', 'authenticate', [db, user, password, {}]);
  } catch (e) {
    console.error(`\n❌ Authenticatie mislukt: ${e.message}`);
    process.exit(1);
  }

  if (!uid) {
    console.error('\n❌ Verkeerde gebruikersnaam of wachtwoord.');
    process.exit(1);
  }
  console.log(`✓ Ingelogd als gebruiker ID ${uid}`);

  // Stap 2: API-sleutel aanmaken via res.users.apikeys
  // Odoo 16+ gebruikt res.users.apikeys model
  const keyName = `bestelportaal-${new Date().toISOString().slice(0,10)}`;
  let apiKey;

  try {
    // Methode A: res.users.apikeys (Odoo 16+)
    const keyId = await xmlrpcCall(url, 'object', 'execute_kw', [
      db, uid, password,
      'res.users.apikeys', 'create', [{ name: keyName, user_id: uid }], {}
    ]);
    // Na aanmaak de sleutel ophalen — Odoo geeft de raw key enkel direct terug via _generate
    // We proberen de gegenereerde sleutel op te halen
    console.log(`✓ API-sleutel aangemaakt (ID: ${keyId})`);
    console.log('\n⚠️  Odoo geeft de ruwe API-sleutel NIET terug via XML-RPC om veiligheidsredenen.');
    console.log('   Je moet de sleutel kopiëren uit de Odoo interface:\n');
    console.log(`   1. Ga naar: ${url}/web#action=base_setup.action_general_configuration`);
    console.log('   2. Of: Instellingen → Gebruikers → jouw gebruiker → tabblad "API-sleutels"');
    console.log(`   3. De sleutel heet: "${keyName}"`);
    console.log('   4. Klik op de sleutel → kopieer de waarde\n');
    apiKey = null;
  } catch (e) {
    // Methode B: via res.users _api_key_generate (sommige Odoo versies)
    try {
      const result = await xmlrpcCall(url, 'object', 'execute_kw', [
        db, uid, password,
        'res.users', '_api_key_generate', [[uid], keyName], {}
      ]);
      if (typeof result === 'string' && result.length > 10) {
        apiKey = result;
        console.log('✓ API-sleutel gegenereerd via res.users._api_key_generate');
      }
    } catch (e2) {
      // ignore, handle below
    }
  }

  // Sla reeds bekende waarden op
  const env = {
    ...existing,
    ODOO_URL: url,
    ODOO_DB: db,
    ODOO_USERNAME: user,
    ODOO_API_KEY: apiKey || (existing.ODOO_API_KEY || 'HIER_JOUW_API_SLEUTEL_PLAKKEN'),
  };

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    // Genereer een veilige JWT secret
    const { randomBytes } = require('crypto');
    env.JWT_SECRET = randomBytes(48).toString('base64');
    console.log('✓ JWT_SECRET automatisch gegenereerd');
  }

  if (!env.ODOO_PICKING_TYPE_ID) env.ODOO_PICKING_TYPE_ID = '2';
  if (!env.ODOO_SOURCE_LOCATION_ID) env.ODOO_SOURCE_LOCATION_ID = '8';
  if (!env.ODOO_DEST_LOCATION_ID) env.ODOO_DEST_LOCATION_ID = '5';

  writeEnv(env);

  console.log(`\n✓ .env.local opgeslagen: ${ENV_FILE}`);

  if (!apiKey) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('VOLGENDE STAP: API-sleutel manueel invullen');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. Open Odoo → Instellingen → Gebruikers & Bedrijven → Gebruikers');
    console.log(`2. Open gebruiker: ${user}`);
    console.log('3. Tabblad "API-sleutels" → "Sleutel aanmaken"');
    console.log(`4. Geef als naam: "${keyName}"`);
    console.log('5. Kopieer de gegenereerde sleutel');
    console.log(`6. Open .env.local en vervang "HIER_JOUW_API_SLEUTEL_PLAKKEN" door de sleutel\n`);
  } else {
    console.log('\n✅ Alles klaar! Start de app met: npm run dev\n');
  }

  // Toon ook de Odoo locatie-ID tip
  console.log('💡 TIP: Odoo locatie-ID\'s vinden?');
  console.log(`   ${url}/web#model=stock.location&view_type=list (debug-modus aan: voeg ?debug=1 toe aan URL)`);
  console.log('   Open een locatie → de ID staat in de URL als ?id=X\n');
}

main().catch(err => {
  console.error('\n❌ Fout:', err.message);
  process.exit(1);
});
