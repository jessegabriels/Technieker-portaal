// src/pages/BusStockPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import '../components/UI.css';
import './BusStockPage.css';

const DEPT_LABELS = { laadpalen: 'Laadpalen', zonnepanelen: 'Zonnepanelen', all: 'Alle afdelingen', algemeen: 'Algemeen' };

function StockTable({ items, emptyMsg }) {
  if (!items || items.length === 0)
    return <p className="bus-empty">{emptyMsg}</p>;
  return (
    <table className="table bus-table">
      <thead>
        <tr>
          <th>Artikel</th>
          <th>In bus</th>
          <th>Gereserveerd voor job</th>
          <th>Eenheid</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <React.Fragment key={i}>
            <tr>
              <td style={{ color: 'var(--text)', fontWeight: 500 }}>{item.productName}</td>
              <td>
                <span style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  color: item.qty > 0 ? 'var(--success)' : 'var(--text3)',
                }}>
                  {item.qty}
                </span>
              </td>
              <td>
                {item.reserved > 0 ? (
                  <span style={{ color: 'var(--warning)', fontSize: 13 }}>
                    {item.reserved} ingepland
                  </span>
                ) : (
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>—</span>
                )}
              </td>
              <td style={{ color: 'var(--text3)' }}>{item.unit}</td>
            </tr>
            {/* Serienummers als ingesprongen rijen */}
            {item.lots && item.lots.length > 0 && item.lots.map((lot, j) => (
              <tr key={`${i}-lot-${j}`} className="serial-row">
                <td colSpan={4}>
                  <span className="serial-indent">↳</span>
                  <span className="serial-badge-table">{lot}</span>
                </td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

function IncomingTable({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="incoming-section">
      <div className="incoming-title">
        <span className="incoming-badge">⏳ Onderweg naar jou</span>
        <span className="incoming-sub">Nog te bevestigen MAOP-pickings</span>
      </div>
      <table className="table bus-table">
        <thead>
          <tr><th>Artikel</th><th>Verwacht</th><th>Eenheid</th><th>Picking</th></tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--text)', fontWeight: 500 }}>{item.productName}</td>
              <td style={{ color: 'var(--warning)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {item.qty}
              </td>
              <td style={{ color: 'var(--text3)' }}>{item.unit}</td>
              <td style={{ color: 'var(--text3)', fontSize: 12 }}>{item.pickingName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BusCard({ bus, defaultOpen }) {
  const [open, setOpen]     = useState(defaultOpen);
  const [search, setSearch] = useState('');

  const filteredStock = bus.stock.filter(i =>
    !search || i.productName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bus-card card">
      <div className="bus-card-header" onClick={() => setOpen(!open)}>
        <div className="bus-card-left">
          <div className="bus-avatar">{bus.userName?.[0]?.toUpperCase()}</div>
          <div>
            <div className="bus-card-name">{bus.userName}</div>
            <div className="bus-card-meta">
              <span className={`badge badge-dept-${bus.department}`}>
                {DEPT_LABELS[bus.department] || bus.department}
              </span>
              <span className="bus-stat">
                <strong style={{ color: 'var(--text)' }}>{bus.totalItems}</strong> artikelen in stock
              </span>
              {bus.totalIncoming > 0 && (
                <span className="bus-stat" style={{ color: 'var(--warning)' }}>
                  <strong>{bus.totalIncoming}</strong> onderweg
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="expand-icon">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="bus-card-body fade-in">
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
            <input type="text" className="form-input"
              placeholder="Zoek artikel..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 300 }} />
          </div>

          <div style={{ padding: '0 20px 16px' }}>
            <StockTable items={filteredStock} emptyMsg="Geen stock in deze bus." />
            <IncomingTable items={bus.incoming} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function BusStockPage() {
  const { token, user } = useAuth();
  const [buses, setBuses]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [warning, setWarning]   = useState('');
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.getBusStockAll(token)
      .then(d => {
        setBuses(d.buses || []);
        setWarning(d.warning || '');
        setLastUpdated(new Date());
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filteredBuses = buses.filter(b =>
    !search || b.userName.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 16, minHeight: 300 }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
      <p style={{ color: 'var(--text2)' }}>Stock ophalen uit Odoo...</p>
    </div>
  );

  return (
    <div className="fade-in">
      {/* Vaste verantwoordelijkheidsmelding */}
      <div className="responsibility-notice">
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <strong>Jij bent zelf verantwoordelijk voor jouw stock.</strong>
          <span style={{ marginLeft: 6, color: 'var(--text2)', fontSize: 13 }}>
            Controleer regelmatig je bestelbus en meld afwijkingen aan de magazijnier.
          </span>
        </div>
      </div>

      {warning && <div className="alert alert-warning" style={{ marginBottom: 16 }}><span>⚠</span> {warning}</div>}
      {error   && <div className="alert alert-error"   style={{ marginBottom: 16 }}><span>⚠</span> {error}</div>}

      <div className="bus-stock-header">
        <div>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>
            {user?.role === 'admin'
              ? 'Overzicht van de huidige voorraad in alle bestelbussen.'
              : 'Huidige voorraad in jouw bestelbus en verwachte items.'}
          </p>
          {lastUpdated && (
            <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>
              Laatste update: {lastUpdated.toLocaleTimeString('nl-BE')}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {user?.role === 'admin' && (
            <input type="text" className="form-input"
              placeholder="Zoek op naam..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 200 }} />
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => load(true)}>
            ↻ Vernieuwen
          </button>
        </div>
      </div>

      {/* Samenvatting voor admin */}
      {user?.role === 'admin' && buses.length > 0 && (
        <div className="bus-summary-row">
          {buses.map(b => (
            <div key={b.userId} className="bus-summary-chip">
              <span className="bus-summary-name">{b.userName.split(' ')[0]}</span>
              <span className="bus-summary-count">{b.totalItems}</span>
              {b.totalIncoming > 0 && (
                <span className="bus-summary-incoming">+{b.totalIncoming}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {buses.length === 0 && !warning && !error && (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <p>Geen busstock gevonden. Controleer of de buslocatie-ID's correct zijn ingesteld.</p>
        </div>
      )}

      <div className="bus-list">
        {filteredBuses.map((bus, i) => (
          <BusCard
            key={bus.userId}
            bus={bus}
            defaultOpen={user?.role !== 'admin' || buses.length === 1}
          />
        ))}
      </div>
    </div>
  );
}
