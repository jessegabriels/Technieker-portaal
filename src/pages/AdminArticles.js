// src/pages/AdminArticles.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import '../components/UI.css';
import Modal from '../components/Modal';
import './AdminArticles.css';

let XLSX;

const DEPARTMENTS = [
  { value: 'all',          label: 'Alle afdelingen' },
  { value: 'laadpalen',    label: 'Laadpalen' },
  { value: 'zonnepanelen', label: 'Zonnepanelen' },
  { value: 'algemeen',     label: 'Algemeen' },
];

const DEPT_LABELS = Object.fromEntries(DEPARTMENTS.map(d => [d.value, d.label]));

const EMPTY_FORM = {
  odooId: '',
  internalRef: '',
  name: '',
  unit: 'stuk',
  departments: ['all'],
  category: '',
  active: true,
};

export default function AdminArticles() {
  const { token } = useAuth();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterDept, setFilterDept] = useState('all');

  // Modal
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');

  // Import
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState('merge');
  const [importMsg, setImportMsg]   = useState(null); // { type: 'success'|'error', text }
  const fileRef = useRef();

  // Feedback banner
  const [banner, setBanner] = useState(null);
  const showBanner = (type, text) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4000);
  };

  const load = useCallback(() =>
    api.adminGetArticles(token)
      .then(d => setArticles(d.articles || []))
      .catch(e => showBanner('error', e.message))
      .finally(() => setLoading(false)),
  [token]);

  useEffect(() => { load(); }, [load]);

  // ── Filteren ──────────────────────────────────────────────────────────
  const filtered = articles.filter(a => {
    const matchSearch = !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.internalRef || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.category || '').toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === 'all' ||
      (a.departments || []).includes(filterDept) ||
      (a.departments || []).includes('all');
    return matchSearch && matchDept;
  });

  // ── CRUD handlers ─────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (a) => {
    setForm({
      odooId:      a.odooId,
      internalRef: a.internalRef,
      name:        a.name,
      unit:        a.unit,
      departments: [...(a.departments || ['all'])],
      category:    a.category || '',
      active:      a.active !== false,
    });
    setEditId(a.id);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true); setFormError('');
    try {
      if (editId) {
        await api.updateArticle(token, { id: editId, ...form, odooId: parseInt(form.odooId) });
        showBanner('success', 'Artikel bijgewerkt.');
      } else {
        await api.createArticle(token, { ...form, odooId: parseInt(form.odooId) });
        showBanner('success', 'Artikel aangemaakt.');
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Artikel "${name}" verwijderen?`)) return;
    try {
      await api.deleteArticle(token, id);
      showBanner('success', `"${name}" verwijderd.`);
      await load();
    } catch (e) {
      showBanner('error', e.message);
    }
  };

  const toggleActive = async (a) => {
    try {
      await api.updateArticle(token, { ...a, active: !a.active });
      await load();
    } catch (e) {
      showBanner('error', e.message);
    }
  };

  // ── Afdeling toggles in formulier ────────────────────────────────────
  const toggleDept = (val) => {
    setForm(f => {
      const depts = f.departments.includes(val)
        ? f.departments.filter(d => d !== val)
        : [...f.departments, val];
      return { ...f, departments: depts.length ? depts : [val] };
    });
  };

  // ── Excel import ──────────────────────────────────────────────────────
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true); setImportMsg(null);
    try {
      if (!XLSX) XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      if (!rows.length) throw new Error('Geen rijen gevonden.');
      const result = await api.importArticles(token, rows, importMode);
      setImportMsg({ type: 'success', text: `${result.count} artikelen geïmporteerd.` });
      await load();
    } catch (err) {
      setImportMsg({ type: 'error', text: err.message });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const downloadTemplate = async () => {
    if (!XLSX) XLSX = await import('xlsx');
    const rows = [
      { odooId: 101, internalRef: 'BEV-001', name: 'Schroef M6x20', unit: 'stuk', departments: 'all', category: 'bevestiging' },
      { odooId: 201, internalRef: 'LP-001',  name: 'Laadkabel Type 2', unit: 'stuk', departments: 'laadpalen', category: 'bekabeling' },
      { odooId: 301, internalRef: 'ZP-001',  name: 'Zonnepaneel 400W', unit: 'stuk', departments: 'zonnepanelen', category: 'panelen' },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Artikelen');
    XLSX.writeFile(wb, 'artikelen_template.xlsx');
  };

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding: 60 }}>
      <span className="spinner" style={{ width:28, height:28 }} />
    </div>
  );

  return (
    <div className="fade-in">

      {/* Feedback banner */}
      {banner && (
        <div className={`alert alert-${banner.type === 'success' ? 'success' : 'error'}`}
          style={{ marginBottom: 16 }}>
          <span>{banner.type === 'success' ? '✓' : '⚠'}</span> {banner.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="articles-toolbar">
        <div className="toolbar-left">
          <input
            type="text" className="form-input" placeholder="Zoek naam, ref, categorie..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 240 }}
          />
          <select className="form-input form-select" value={filterDept}
            onChange={e => setFilterDept(e.target.value)} style={{ width: 180 }}>
            <option value="all">Alle afdelingen</option>
            {DEPARTMENTS.filter(d => d.value !== 'all').map(d =>
              <option key={d.value} value={d.value}>{d.label}</option>
            )}
          </select>
          <span className="articles-count">
            {filtered.length} / {articles.length} artikelen
          </span>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            + Nieuw artikel
          </button>
        </div>
      </div>

      {/* Artikelentabel */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
            Geen artikelen gevonden.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Naam</th>
                <th>Eenheid</th>
                <th>Categorie</th>
                <th>Afdeling(en)</th>
                <th>Odoo ID</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} style={{ opacity: a.active ? 1 : 0.45 }}>
                  <td style={{ fontFamily:'var(--font-display)', fontSize:12, color:'var(--text3)' }}>
                    {a.internalRef}
                  </td>
                  <td style={{ color:'var(--text)', fontWeight: 500 }}>{a.name}</td>
                  <td>{a.unit}</td>
                  <td style={{ fontSize:12 }}>{a.category}</td>
                  <td>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {(a.departments || []).map(d => (
                        <span key={d} className={`badge badge-dept-${d}`} style={{ fontSize:10 }}>
                          {DEPT_LABELS[d] || d}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontFamily:'var(--font-display)', fontSize:12, color:'var(--text3)' }}>
                    {a.odooId}
                  </td>
                  <td>
                    <button
                      className="status-toggle"
                      onClick={() => toggleActive(a)}
                      title={a.active ? 'Klik om te deactiveren' : 'Klik om te activeren'}
                    >
                      <span style={{ color: a.active ? 'var(--success)' : 'var(--error)', fontSize:12 }}>
                        {a.active ? '● Actief' : '● Inactief'}
                      </span>
                    </button>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>
                        Bewerken
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id, a.name)}>
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Excel import sectie */}
      <div className="card import-card">
        <div className="import-header">
          <div>
            <div className="import-title">Excel importeren</div>
            <div className="import-sub">
              Kolommen: <code>odooId</code>, <code>internalRef</code>, <code>name</code>,{' '}
              <code>unit</code>, <code>departments</code>, <code>category</code>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
            ⬇ Sjabloon
          </button>
        </div>
        {importMsg && (
          <div className={`alert alert-${importMsg.type === 'success' ? 'success' : 'error'}`}
            style={{ marginTop:12 }}>
            <span>{importMsg.type === 'success' ? '✓' : '⚠'}</span> {importMsg.text}
          </div>
        )}
        <div className="import-controls">
          <select className="form-input form-select" style={{ width:240 }}
            value={importMode} onChange={e => setImportMode(e.target.value)}>
            <option value="merge">Samenvoegen (toevoegen/bijwerken)</option>
            <option value="replace">Alles vervangen</option>
          </select>
          <input type="file" accept=".xlsx,.xls" ref={fileRef} onChange={handleImport}
            style={{ display:'none' }} />
          <button className="btn btn-primary btn-sm"
            onClick={() => fileRef.current.click()} disabled={importing}>
            {importing
              ? <><span className="spinner" style={{ width:14, height:14 }} /> Importeren...</>
              : '📂 Bestand kiezen'}
          </button>
        </div>
        <div className="import-hint">
          <strong>departments</strong>: kommagescheiden —{' '}
          <code>all</code>, <code>laadpalen</code>, <code>zonnepanelen</code>
        </div>
      </div>

      {/* Artikel formulier modal */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editId ? 'Artikel bewerken' : 'Nieuw artikel'} maxWidth={540}>

            {formError && (
              <div className="alert alert-error" style={{ marginBottom:16 }}>
                <span>⚠</span> {formError}
              </div>
            )}

            <div className="article-form">
              {/* Rij 1: Naam */}
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Naam *</label>
                <input className="form-input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="bijv. Schroef M6x20" autoFocus />
              </div>

              {/* Rij 2: Ref + Odoo ID */}
              <div className="form-field">
                <label className="form-label">Interne referentie *</label>
                <input className="form-input" value={form.internalRef}
                  onChange={e => setForm(f => ({ ...f, internalRef: e.target.value }))}
                  placeholder="bijv. BEV-001" />
              </div>
              <div className="form-field">
                <label className="form-label">Odoo Product ID *</label>
                <input className="form-input" type="number" value={form.odooId}
                  onChange={e => setForm(f => ({ ...f, odooId: e.target.value }))}
                  placeholder="bijv. 1142" />
              </div>

              {/* Rij 3: Eenheid + Categorie */}
              <div className="form-field">
                <label className="form-label">Eenheid</label>
                <input className="form-input" value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="stuk / meter / rol / doos..." />
              </div>
              <div className="form-field">
                <label className="form-label">Categorie</label>
                <input className="form-input" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="bijv. bevestiging, bekabeling..." />
              </div>

              {/* Afdelingen */}
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Afdeling(en) * — meerdere mogelijk</label>
                <div className="dept-checkboxes">
                  {DEPARTMENTS.map(d => (
                    <label key={d.value} className={`dept-checkbox ${form.departments.includes(d.value) ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.departments.includes(d.value)}
                        onChange={() => toggleDept(d.value)}
                      />
                      <span className={`badge badge-dept-${d.value}`}>{d.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Status</label>
                <div style={{ display:'flex', gap:12 }}>
                  {[true, false].map(val => (
                    <label key={String(val)} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                      <input type="radio" checked={form.active === val}
                        onChange={() => setForm(f => ({ ...f, active: val }))} />
                      <span style={{ fontSize:13, color: val ? 'var(--success)' : 'var(--error)' }}>
                        {val ? '● Actief' : '● Inactief'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display:'flex', gap:10, marginTop:24 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}
                style={{ flex:1, justifyContent:'center' }}>
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Annuleren
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
