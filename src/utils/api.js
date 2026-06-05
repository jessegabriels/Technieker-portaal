// src/utils/api.js
const BASE = process.env.REACT_APP_API_BASE
  ? `${process.env.REACT_APP_API_BASE}/api`
  : '/.netlify/functions';

async function apiFetch(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  login: (username, password) =>
    apiFetch('/auth-login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getArticles: (token) =>
    apiFetch('/articles-get', {}, token),

  adminGetArticles: (token) =>
    apiFetch('/articles-manage', {}, token),
  createArticle: (token, data) =>
    apiFetch('/articles-manage', { method: 'POST', body: JSON.stringify(data) }, token),
  updateArticle: (token, data) =>
    apiFetch('/articles-manage', { method: 'PUT', body: JSON.stringify(data) }, token),
  deleteArticle: (token, id) =>
    apiFetch('/articles-manage', { method: 'DELETE', body: JSON.stringify({ id }) }, token),

  createOrder: (token, items, note) =>
    apiFetch('/orders-create', { method: 'POST', body: JSON.stringify({ items, note }) }, token),
  getOrders: (token) =>
    apiFetch('/orders-get', {}, token),
  deleteOrder: (token, id) =>
    apiFetch('/orders-manage', { method: 'DELETE', body: JSON.stringify({ id }) }, token),

  getUsers: (token) =>
    apiFetch('/users-manage', {}, token),
  createUser: (token, data) =>
    apiFetch('/users-manage', { method: 'POST', body: JSON.stringify(data) }, token),
  updateUser: (token, data) =>
    apiFetch('/users-manage', { method: 'PUT', body: JSON.stringify(data) }, token),
  deleteUser: (token, id) =>
    apiFetch('/users-manage', { method: 'DELETE', body: JSON.stringify({ id }) }, token),

  importArticles: (token, rows, mode = 'replace') =>
    apiFetch('/articles-import', { method: 'POST', body: JSON.stringify({ rows, mode }) }, token),
};
