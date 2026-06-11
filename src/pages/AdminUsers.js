// src/pages/AdminUsers.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import Modal from '../components/Modal';
import '../components/UI.css';

const DEPARTMENTS = ['laadpalen', 'zonnepanelen', 'algemeen', 'all'];
const DEPT_LABELS = {
  laadpalen: 'Laadpalen', zonnepanelen: 'Zonnepanelen',
  algemeen: 'Algemeen', all: 'Alle afdelingen',
};
const emptyForm = {
  username: '', password: '', name: '',
  role: 'technician', department: 'laadpalen', active: true,
  odooLocationId: '', odooTechnicianId: '',
};

export default function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [editId, setEditId]     = useState(null);
  const [error, setError]       = useState('');
  const [banner, setBanner]     = useState(null);
  const [saving, setSaving]     = useState(false);

  const showBanner = (type, text) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4000);
  };

  const load = () =>
    api.getUsers(token)
      .then(d => setUsers(d.users || []))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [token]);

  const openCreate = () => { setForm(emptyForm); setEditId(null); setError(''); setShowForm(true); };
  const openEdit   = (u) => {
    setForm({
      username: u.username, password: '', name: u.name,
      role: u.role, department: u.department, active: u.active,
      odooLocationId: u.odooLocationId || '',
      odooTechnicianId: u.odooTechnicianId || '',
    });
    setEditId(u.id); setError(''); setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      if (editId) {
        const payload = {
          id: editId, name: form.name, role: form.role,
          department: form.department, active: form.active,
          odooLocationId:   form.odooLocationId   || null,
          odooTechnicianId: form.odooTechnicianId || null,
        };
        if (form.password) payload.password = form.password;
        await api.updateUser(token, payload);
        showBanner('success', 'Gebruiker bijgewerkt.');
      } else {
        await api.createUser(token, form);
        showBanner('success', 'Gebruiker aangemaakt.');
      }
      await load();
      setShowForm(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Gebruiker "${name}" verwijderen?`)) return;
    try {
      await api.deleteUser(token, id);
      showBanner('success', `"${name}" verwijderd.`);
      await load();
    } catch (e) {
      showBanner('error', e.message);
    }
  };

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
      <span className="spinner" style={{ width:28, height:28 }} />
    </div>
  );

  return (
    <div className="fade-in">
      {banner && (
        <div className={`alert alert-${banner.type === 'success' ? 'success' : 'error'}`}
          style={{ marginBottom:16 }}>
          <span>{banner.type === 'success' ? '✓' : '⚠'}</span> {banner.text}
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <span style={{ color:'var(--text2)', fontSize:14 }}>{users.length} gebruikers</span>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Nieuwe gebruiker</button>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table className="table">
          <thead>
            <tr><th>Naam</th><th>Gebruikersnaam</th><th>Afdeling</th><th>Rol</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ color:'var(--text)', fontWeight:500 }}>{u.name}</td>
                <td style={{ fontFamily:'var(--font-display)', fontSize:13 }}>{u.username}</td>
                <td><span className={`badge badge-dept-${u.department}`}>{DEPT_LABELS[u.department] || u.department}</span></td>
                <td><span className={`badge badge-role-${u.role}`}>{u.role === 'admin' ? 'Beheerder' : 'Technieker'}</span></td>
                <td>
                  <span style={{ fontSize:12, color: u.active ? 'var(--success)' : 'var(--error)' }}>
                    {u.active ? '● Actief' : '● Inactief'}
                  </span>
                </td>
                <td>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Bewerken</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id, u.name)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editId ? 'Gebruiker bewerken' : 'Nieuwe gebruiker'}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom:16 }}>
              <span>⚠</span> {error}
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="form-field">
              <label className="form-label">Volledige naam</label>
              <input className="form-input" value={form.name} autoFocus
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            {!editId && (
              <div className="form-field">
                <label className="form-label">Gebruikersnaam</label>
                <input className="form-input" value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
            )}
            <div className="form-field">
              <label className="form-label">
                {editId ? 'Nieuw wachtwoord (leeg = ongewijzigd)' : 'Wachtwoord'}
              </label>
              <input className="form-input" type="password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="form-field">
              <label className="form-label">Afdeling</label>
              <select className="form-input form-select" value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Rol</label>
              <select className="form-input form-select" value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="technician">Technieker</option>
                <option value="admin">Beheerder</option>
              </select>
            </div>
            {editId && (
              <div className="form-field">
                <label className="form-label">Status</label>
                <select className="form-input form-select"
                  value={form.active ? 'true' : 'false'}
                  onChange={e => setForm(f => ({ ...f, active: e.target.value === 'true' }))}>
                  <option value="true">Actief</option>
                  <option value="false">Inactief</option>
                </select>
              </div>
            )}
            <div className="form-field">
              <label className="form-label">Buslocatie ID (Odoo)</label>
              <input className="form-input" type="number" value={form.odooLocationId}
                placeholder="bijv. 83 (zie Odoo → Locaties)"
                onChange={e => setForm(f => ({ ...f, odooLocationId: e.target.value }))} />
              <span style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                Vereist voor de "Ophalen" functie. Vind het ID in Odoo → Voorraadbeheer → Configuratie → Locaties (debug-modus).
              </span>
            </div>
            <div className="form-field">
              <label className="form-label">Technieker ID (Odoo)</label>
              <input className="form-input" type="number" value={form.odooTechnicianId}
                placeholder="bijv. 5 (zie Odoo → Techniekers model)"
                onChange={e => setForm(f => ({ ...f, odooTechnicianId: e.target.value }))} />
              <span style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                ID uit het "Techniekers" model in Odoo. Wordt ingevuld als x_studio_technieker op elke pickingorder.
              </span>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}
                style={{ flex:1, justifyContent:'center' }}>
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Annuleren
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
