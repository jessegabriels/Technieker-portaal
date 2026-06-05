// netlify/functions/lib/users.js
// 
// USER STORE — backed by a JSON file in /tmp for demo.
// For production, replace with a real database (PlanetScale, Supabase, etc.)
// 
// User object shape:
// {
//   id: string,
//   username: string,
//   passwordHash: string,  // SHA-256 hex
//   name: string,
//   role: 'admin' | 'technician',
//   department: string,    // e.g. 'laadpalen' | 'zonnepanelen' | 'algemeen'
//   active: boolean
// }

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// os.tmpdir() werkt op zowel Windows als Linux/Mac
const DATA_FILE = path.join(os.tmpdir(), 'technician_users.json');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'salt_tech_portal').digest('hex');
}

function loadUsers() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      return getDefaultUsers();
    }
  }
  const defaults = getDefaultUsers();
  saveUsers(defaults);
  return defaults;
}

function saveUsers(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

function getDefaultUsers() {
  // Default admin + example technicians — CHANGE PASSWORDS in production
  return [
    {
      id: 'admin-001',
      username: 'admin',
      passwordHash: hashPassword('Admin@2024!'),
      name: 'Beheerder',
      role: 'admin',
      department: 'all',
      active: true,
    },
    {
      id: 'tech-001',
      username: 'jan.de.smedt',
      passwordHash: hashPassword('Tech@2024!'),
      name: 'Jan De Smedt',
      role: 'technician',
      department: 'laadpalen',
      active: true,
    },
    {
      id: 'tech-002',
      username: 'peter.wouters',
      passwordHash: hashPassword('Tech@2024!'),
      name: 'Peter Wouters',
      role: 'technician',
      department: 'zonnepanelen',
      active: true,
    },
  ];
}

module.exports = {
  hashPassword,
  loadUsers,
  saveUsers,
  findByUsername: (username) => loadUsers().find(u => u.username === username),
  findById: (id) => loadUsers().find(u => u.id === id),
  getAll: () => loadUsers(),
  create: (user) => {
    const users = loadUsers();
    users.push(user);
    saveUsers(users);
    return user;
  },
  update: (id, updates) => {
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    saveUsers(users);
    return users[idx];
  },
  remove: (id) => {
    const users = loadUsers();
    const filtered = users.filter(u => u.id !== id);
    saveUsers(filtered);
  },
};
