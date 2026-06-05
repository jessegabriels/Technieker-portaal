// netlify/functions/lib/orders.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const DATA_FILE = path.join(os.tmpdir(), 'technician_orders.json');

function loadOrders() {
  if (fs.existsSync(DATA_FILE)) {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
    catch { return []; }
  }
  return [];
}

function saveOrders(orders) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2));
}

module.exports = {
  getAll: () => loadOrders(),
  getForUser: (userId) => loadOrders().filter(o => o.userId === userId),
  findById: (id) => loadOrders().find(o => o.id === id),
  create: (order) => {
    const orders = loadOrders();
    orders.unshift(order); // newest first
    saveOrders(orders);
    return order;
  },
  update: (id, updates) => {
    const orders = loadOrders();
    const idx = orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    orders[idx] = { ...orders[idx], ...updates };
    saveOrders(orders);
    return orders[idx];
  },
};
