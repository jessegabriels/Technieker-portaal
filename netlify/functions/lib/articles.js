// netlify/functions/lib/articles.js
//
// Article shape:
// {
//   id: string,
//   odooId: number,        // Odoo product.product id
//   internalRef: string,   // Odoo internal reference
//   name: string,
//   unit: string,          // UoM (stuk, rol, doos, ...)
//   departments: string[], // ['laadpalen', 'zonnepanelen', 'all']
//   category: string,      // e.g. 'bevestiging', 'bekabeling', ...
//   active: boolean
// }

const fs = require('fs');
const path = require('path');
const os = require('os');
const DATA_FILE = path.join(os.tmpdir(), 'technician_articles.json');

function loadArticles() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      return getSampleArticles();
    }
  }
  const defaults = getSampleArticles();
  saveArticles(defaults);
  return defaults;
}

function saveArticles(articles) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(articles, null, 2));
}

function getSampleArticles() {
  return [
    { id: 'art-001', odooId: 101, internalRef: 'BEV-001', name: 'Schroef M6x20', unit: 'stuk', departments: ['all'], category: 'bevestiging', active: true },
    { id: 'art-002', odooId: 102, internalRef: 'BEV-002', name: 'Bout M8x30', unit: 'stuk', departments: ['all'], category: 'bevestiging', active: true },
    { id: 'art-003', odooId: 103, internalRef: 'BEV-003', name: 'Moer M6', unit: 'stuk', departments: ['all'], category: 'bevestiging', active: true },
    { id: 'art-004', odooId: 104, internalRef: 'BEV-004', name: 'Sluitring M8', unit: 'stuk', departments: ['all'], category: 'bevestiging', active: true },
    { id: 'art-005', odooId: 201, internalRef: 'LP-001', name: 'Laadkabel Type 2 - 5m', unit: 'stuk', departments: ['laadpalen'], category: 'bekabeling', active: true },
    { id: 'art-006', odooId: 202, internalRef: 'LP-002', name: 'Laadpaal behuizing 22kW', unit: 'stuk', departments: ['laadpalen'], category: 'hardware', active: true },
    { id: 'art-007', odooId: 203, internalRef: 'LP-003', name: 'Aardingskabel 16mm²', unit: 'meter', departments: ['laadpalen'], category: 'bekabeling', active: true },
    { id: 'art-008', odooId: 204, internalRef: 'LP-004', name: 'Zekeringautomaat 32A', unit: 'stuk', departments: ['laadpalen'], category: 'elektra', active: true },
    { id: 'art-009', odooId: 301, internalRef: 'ZP-001', name: 'Zonnepaneel 400W Mono', unit: 'stuk', departments: ['zonnepanelen'], category: 'panelen', active: true },
    { id: 'art-010', odooId: 302, internalRef: 'ZP-002', name: 'Omvormer 5kW', unit: 'stuk', departments: ['zonnepanelen'], category: 'hardware', active: true },
    { id: 'art-011', odooId: 303, internalRef: 'ZP-003', name: 'Dakhaak aluminium', unit: 'stuk', departments: ['zonnepanelen'], category: 'bevestiging', active: true },
    { id: 'art-012', odooId: 304, internalRef: 'ZP-004', name: 'Rail 3.4m', unit: 'stuk', departments: ['zonnepanelen'], category: 'bevestiging', active: true },
    { id: 'art-013', odooId: 305, internalRef: 'ZP-005', name: 'DC-kabel 4mm² (zwart)', unit: 'meter', departments: ['zonnepanelen'], category: 'bekabeling', active: true },
    { id: 'art-014', odooId: 401, internalRef: 'ALG-001', name: 'Kabelbinder 200mm', unit: 'zak', departments: ['all'], category: 'bevestiging', active: true },
    { id: 'art-015', odooId: 402, internalRef: 'ALG-002', name: 'Isolatietape zwart', unit: 'rol', departments: ['all'], category: 'bevestiging', active: true },
  ];
}

module.exports = {
  loadArticles,
  saveArticles,
  getAll: () => loadArticles(),
  getForDepartment: (dept) => {
    const all = loadArticles();
    if (dept === 'all') return all.filter(a => a.active);
    return all.filter(a => a.active && (a.departments.includes(dept) || a.departments.includes('all')));
  },
  findById: (id) => loadArticles().find(a => a.id === id),
  importBatch: (articles) => {
    saveArticles(articles);
    return articles;
  },
  update: (id, updates) => {
    const articles = loadArticles();
    const idx = articles.findIndex(a => a.id === id);
    if (idx === -1) return null;
    articles[idx] = { ...articles[idx], ...updates };
    saveArticles(articles);
    return articles[idx];
  },
  remove: (id) => {
    const articles = loadArticles();
    saveArticles(articles.filter(a => a.id !== id));
  },
};
