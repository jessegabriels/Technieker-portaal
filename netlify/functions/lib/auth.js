// netlify/functions/lib/auth.js
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_use_env_var';

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

function sign(payload, expiresInHours = 8) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + expiresInHours * 3600;
  const body = base64url(JSON.stringify({ ...payload, exp }));
  const sig = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verify(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`).digest('base64url');
  if (sig !== expected) return null;
  const payload = JSON.parse(base64urlDecode(body));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function getTokenFromEvent(event) {
  const auth = event.headers['authorization'] || event.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function requireAuth(event) {
  const token = getTokenFromEvent(event);
  const payload = verify(token);
  if (!payload) throw new Error('Unauthorized');
  return payload;
}

function cors(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

module.exports = { sign, verify, requireAuth, cors, getTokenFromEvent };
