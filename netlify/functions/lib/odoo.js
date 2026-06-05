// netlify/functions/lib/odoo.js
// Odoo XML-RPC client helper

const ODOO_URL = (process.env.ODOO_URL || '').replace(/\/+$/, ''); // trailing slash verwijderen
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY = process.env.ODOO_API_KEY;

async function xmlrpcCall(endpoint, method, params) {
  const xmlBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>${method}</methodName>
  <params>
    ${params.map(p => `<param><value>${serializeValue(p)}</value></param>`).join('\n    ')}
  </params>
</methodCall>`;

  const response = await fetch(`${ODOO_URL}/xmlrpc/2/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml', 'charset': 'utf-8' },
    body: xmlBody,
  });

  if (!response.ok) {
    throw new Error(`Odoo HTTP error: ${response.status}`);
  }

  const text = await response.text();
  return parseXmlRpcResponse(text);
}

function serializeValue(val) {
  if (val === null || val === undefined) return '<nil/>';
  if (typeof val === 'boolean') return `<boolean>${val ? 1 : 0}</boolean>`;
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return `<int>${val}</int>`;
    return `<double>${val}</double>`;
  }
  if (typeof val === 'string') return `<string>${escapeXml(val)}</string>`;
  if (Array.isArray(val)) {
    return `<array><data>${val.map(v => `<value>${serializeValue(v)}</value>`).join('')}</data></array>`;
  }
  if (typeof val === 'object') {
    const members = Object.entries(val).map(([k, v]) =>
      `<member><name>${escapeXml(k)}</name><value>${serializeValue(v)}</value></member>`
    ).join('');
    return `<struct>${members}</struct>`;
  }
  return `<string>${escapeXml(String(val))}</string>`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseXmlRpcResponse(xml) {
  // Extract fault
  if (xml.includes('<fault>')) {
    const faultMatch = xml.match(/<fault>[\s\S]*?<\/fault>/);
    throw new Error(`Odoo fault: ${faultMatch ? faultMatch[0] : 'Unknown fault'}`);
  }

  // Simple value extraction — handles common Odoo response types
  const paramMatch = xml.match(/<params>\s*<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>\s*<\/params>/);
  if (!paramMatch) throw new Error('Could not parse Odoo response');
  return parseXmlValue(paramMatch[1].trim());
}

function parseXmlValue(xml) {
  xml = xml.trim();

  if (xml.startsWith('<int>') || xml.startsWith('<i4>')) {
    return parseInt(xml.replace(/<\/?i?n?t?>|<\/?i4>/g, ''), 10);
  }
  if (xml.startsWith('<double>')) {
    return parseFloat(xml.replace(/<\/?double>/g, ''));
  }
  if (xml.startsWith('<boolean>')) {
    return xml.includes('<boolean>1</boolean>');
  }
  if (xml.startsWith('<string>') || xml.startsWith('<value>')) {
    return xml.replace(/<\/?string>|<\/?value>/g, '').trim();
  }
  if (xml.startsWith('<nil/>') || xml === '<nil/>') {
    return null;
  }
  if (xml.startsWith('<array>')) {
    const dataMatch = xml.match(/<data>([\s\S]*?)<\/data>/);
    if (!dataMatch) return [];
    const values = [];
    const valueMatches = dataMatch[1].matchAll(/<value>([\s\S]*?)<\/value>/g);
    for (const m of valueMatches) {
      values.push(parseXmlValue(m[1].trim()));
    }
    return values;
  }
  if (xml.startsWith('<struct>')) {
    const obj = {};
    const memberMatches = xml.matchAll(/<member>\s*<name>(.*?)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g);
    for (const m of memberMatches) {
      obj[m[1]] = parseXmlValue(m[2].trim());
    }
    return obj;
  }
  // Fallback: plain string
  return xml.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

let _uid = null;

async function authenticate() {
  if (_uid) return _uid;
  const uid = await xmlrpcCall('common', 'authenticate', [
    ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}
  ]);
  if (!uid || uid === false) throw new Error('Odoo authentication failed');
  _uid = uid;
  return uid;
}

async function odooCall(model, method, args, kwargs = {}) {
  const uid = await authenticate();
  return xmlrpcCall('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_API_KEY,
    model, method, args, kwargs
  ]);
}

module.exports = { odooCall, authenticate };
