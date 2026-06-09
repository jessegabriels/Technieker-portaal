// src/utils/api.js
const BASE = process.env.REACT_APP_API_BASE
  ? `${process.env.REACT_APP_API_BASE}/api`
  : '/.netlify/functions';

async function apiFetch(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  login: (u, p) => apiFetch('/auth-login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) }),

  // Artikelen
  getArticles:      (t)       => apiFetch('/articles-get', {}, t),
  adminGetArticles: (t)       => apiFetch('/articles-manage', {}, t),
  createArticle:    (t, d)    => apiFetch('/articles-manage', { method: 'POST',   body: JSON.stringify(d) }, t),
  updateArticle:    (t, d)    => apiFetch('/articles-manage', { method: 'PUT',    body: JSON.stringify(d) }, t),
  deleteArticle:    (t, id)   => apiFetch('/articles-manage', { method: 'DELETE', body: JSON.stringify({ id }) }, t),

  // Portaalbestellingen
  createOrder:  (t, items, note) => apiFetch('/orders-create', { method: 'POST', body: JSON.stringify({ items, note }) }, t),
  getOrders:    (t)               => apiFetch('/orders-get', {}, t),
  deleteOrder:  (t, id)           => apiFetch('/orders-manage', { method: 'DELETE', body: JSON.stringify({ id }) }, t),

  // Ophalen (MAOP naar bus)
  getPickings:     (t)   => apiFetch('/pickings-get?direction=in', {}, t),
  validatePicking: (t, id) => apiFetch('/pickings-validate', { method: 'POST', body: JSON.stringify({ pickingId: id }) }, t),

  // Plaatsen (WH/OUT van bus naar klant)
  getOutboundPickings: (t)              => apiFetch('/pickings-get?direction=out', {}, t),
  getBusStock:         (t)              => apiFetch('/bus-stock-get', {}, t),
  addPickingLines:     (t, pickingId, items) => apiFetch('/picking-add-line',    { method: 'POST', body: JSON.stringify({ pickingId, items }) }, t),
  removePickingLine:   (t, pickingId, moveId) => apiFetch('/picking-remove-line', { method: 'POST', body: JSON.stringify({ pickingId, moveId }) }, t),

  // Busstock overzicht
  getBusStockAll: (t) => apiFetch('/bus-stock-all', {}, t),

  // Gebruikers
  getUsers:   (t)    => apiFetch('/users-manage', {}, t),
  createUser: (t, d) => apiFetch('/users-manage', { method: 'POST',   body: JSON.stringify(d) }, t),
  updateUser: (t, d) => apiFetch('/users-manage', { method: 'PUT',    body: JSON.stringify(d) }, t),
  deleteUser: (t, id) => apiFetch('/users-manage', { method: 'DELETE', body: JSON.stringify({ id }) }, t),

  importArticles: (t, rows, mode = 'replace') =>
    apiFetch('/articles-import', { method: 'POST', body: JSON.stringify({ rows, mode }) }, t),
};
