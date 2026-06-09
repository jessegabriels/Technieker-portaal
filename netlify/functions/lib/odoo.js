// netlify/functions/lib/odoo.js
// Odoo JSON-RPC client — vervangt de XML-RPC implementatie.
// JSON-RPC is natively ondersteund door Odoo en heeft geen custom parser nodig.

const ODOO_URL      = (process.env.ODOO_URL || '').replace(/\/+$/, '');
const ODOO_DB       = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY  = process.env.ODOO_API_KEY;

let _uid    = null;
let _callId = 1;

async function jsonrpcCall(service, method, args) {
  const url = `${ODOO_URL}/jsonrpc`;
  const body = {
    jsonrpc: '2.0',
    method:  'call',
    id:      _callId++,
    params:  { service, method, args },
  };

  let res;
  try {
    res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw new Error(`Odoo niet bereikbaar (${ODOO_URL}): ${fetchErr.message}`);
  }

  if (!res.ok) {
    throw new Error(`Odoo HTTP fout: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.error) {
    const msg = data.error?.data?.message
      || data.error?.data?.debug
      || data.error?.message
      || JSON.stringify(data.error);
    throw new Error(msg);
  }

  return data.result;
}

async function authenticate() {
  if (_uid) return _uid;

  const uid = await jsonrpcCall('common', 'authenticate', [
    ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}
  ]);

  if (!uid || uid === false) {
    throw new Error('Odoo authentication failed');
  }

  _uid = uid;
  return uid;
}

async function odooCall(model, method, args, kwargs = {}) {
  const uid = await authenticate();
  return jsonrpcCall('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_API_KEY,
    model, method, args, kwargs,
  ]);
}

module.exports = { odooCall, authenticate };
