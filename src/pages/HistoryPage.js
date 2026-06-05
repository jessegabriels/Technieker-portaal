// src/pages/HistoryPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import '../components/UI.css';
import './HistoryPage.css';

const STATUS_LABEL = { confirmed: 'Bevestigd', odoo_error: 'Odoo fout' };

export default function HistoryPage({ adminView = false }) {
  const { token, user } = useAuth();
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch]     = useState('');
  const [deleting, setDeleting] = useState(null); // id van order die wordt verwijderd

  const load = useCallback(() =>
    api.getOrders(token)
      .then(d => setOrders(d.orders || []))
      .catch(console.error)
      .finally(() => setLoading(false)),
    [token]
  );

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o => {
    if (!search) return true;
    return (
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.userName?.toLowerCase().includes(search.toLowerCase()) ||
      o.odooPickingName?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const handleDelete = async (e, orderId) => {
    e.stopPropagation(); // voorkom dat de rij uitklapt
    if (!window.confirm('Bestelling verwijderen uit het portaal? Dit verwijdert de picking niet uit Odoo.')) return;
    setDeleting(orderId);
    try {
      await api.deleteOrder(token, orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (expanded === orderId) setExpanded(null);
    } catch (e) {
      alert('Fout bij verwijderen: ' + e.message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );

  return (
    <div className="fade-in">
      <div className="history-toolbar">
        <input
          type="text" className="form-input" style={{ maxWidth: 320 }}
          placeholder="Zoek op bestelnr, naam, picking..."
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <span className="history-count">{filtered.length} bestellingen</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:'48px', color:'var(--text3)' }}>
          Nog geen bestellingen gevonden.
        </div>
      ) : (
        <div className="order-list">
          {filtered.map(order => (
            <div key={order.id} className={`order-row card ${deleting === order.id ? 'deleting' : ''}`}>
              <div
                className="order-row-header"
                onClick={() => setExpanded(expanded === order.id ? null : order.id)}
              >
                <div className="order-row-left">
                  <div className="order-id">{order.id}</div>
                  <div className="order-meta">
                    {adminView && (
                      <span className="order-user">{order.userName} · {order.userDepartment}</span>
                    )}
                    <span className="order-date">
                      {new Date(order.createdAt).toLocaleString('nl-BE')}
                    </span>
                    {order.odooPickingName && (
                      <span className="order-picking">📋 {order.odooPickingName}</span>
                    )}
                  </div>
                </div>

                <div className="order-row-right">
                  <span className={`badge badge-status-${order.status}`}>
                    {STATUS_LABEL[order.status] || order.status}
                  </span>
                  <span className="order-item-count">
                    {order.items.length} artikel{order.items.length !== 1 ? 'en' : ''}
                  </span>
                  <button
                    className="order-delete-btn"
                    onClick={e => handleDelete(e, order.id)}
                    disabled={deleting === order.id}
                    title="Bestelling verwijderen"
                  >
                    {deleting === order.id
                      ? <span className="spinner" style={{ width:12, height:12 }} />
                      : '🗑'}
                  </button>
                  <span className="expand-icon">{expanded === order.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded === order.id && (
                <div className="order-detail fade-in">
                  <table className="table">
                    <thead>
                      <tr><th>Ref</th><th>Artikel</th><th>Categorie</th><th>Aantal</th><th>Eenheid</th></tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily:'var(--font-display)', fontSize:12, color:'var(--text3)' }}>
                            {item.internalRef}
                          </td>
                          <td>{item.name}</td>
                          <td style={{ fontSize:12, color:'var(--text3)' }}>
                            {item.category || '—'}
                          </td>
                          <td style={{ fontWeight:700, color:'var(--accent)', fontFamily:'var(--font-display)' }}>
                            {item.quantity}
                          </td>
                          <td>{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {order.note && (
                    <div className="order-note">
                      <strong>Opmerking:</strong> {order.note}
                    </div>
                  )}
                  {order.odooError && (
                    <div className="alert alert-error" style={{ marginTop:12, fontSize:13 }}>
                      Odoo fout: {order.odooError}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
