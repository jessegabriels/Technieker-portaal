// src/pages/ReturnPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { createPortal } from 'react-dom';
import '../components/UI.css';
import './ReturnPage.css';

const STATE_CONFIG = {
  draft:               { label: 'Concept',              color: 'var(--text3)',   bg: 'var(--surface2)' },
  confirmed:           { label: 'Wacht op magazijnier', color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
  waiting:             { label: 'Wachtend',             color: 'var(--text3)',   bg: 'var(--surface2)' },
  assigned:            { label: 'Klaar voor controle',  color: 'var(--info)',    bg: 'rgba(59,130,246,0.1)' },
  partially_available: { label: 'Gedeeltelijk klaar',   color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
  done:                { label: 'Verwerkt ✓',           color: 'var(--success)', bg: 'rgba(34,197,94,0.1)' },
  cancel:              { label: 'Geannuleerd',          color: 'var(--error)',   bg: 'rgba(239,68,68,0.1)' },
  unknown:             { label: 'Niet gevonden in Odoo', color: 'var(--text3)',  bg: 'var(--surface2)' },
};

// ── Swipe-to-confirm slider ───────────────────────────────────────────────────
function SwipeToConfirm({ onConfirm, disabled }) {
  const [value, setValue]         = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  const handleChange = (e) => {
    if (disabled || confirmed) return;
    const v = parseInt(e.target.value);
    setValue(v);
    if (v >= 95) {
      setConfirmed(true);
      setTimeout(onConfirm, 300);
    }
  };

  const handleRelease = () => {
    if (!confirmed) setValue(0);
  };

  return (
    <div className={`swipe-track ${confirmed ? 'confirmed' : ''}`}>
      <div className="swipe-fill" style={{ width: `${value}%` }} />
      <span className="swipe-label">
        {confirmed
          ? '✓ Retourbon wordt aangemaakt...'
          : '← Sleep volledig naar rechts om te bevestigen'}
      </span>
      <input
        type="range" min="0" max="100"
        value={value}
        onChange={handleChange}
        onMouseUp={handleRelease}
        onTouchEnd={handleRelease}
        className="swipe-input"
        disabled={disabled || confirmed}
      />
    </div>
  );
}

// ── Stap 1: Artikelen selecteren ──────────────────────────────────────────────
function StepSelect({ stock, loadingStock, cart, setCart, search, setSearch, onNext, onClose }) {
  const setQty = (productId, qty) => {
    const key = String(productId);
    const max = stock.find(s => s.productId === productId)?.qty || 0;
    setCart(prev => ({ ...prev, [key]: { ...prev[key], qty: Math.max(0, Math.min(max, qty)), lots: prev[key]?.lots || [] } }));
  };

  const addLot = (productId, lotName) => {
    const key  = String(productId);
    const prev = cart[key] || { qty: 0, lots: [] };
    if (prev.lots.includes(lotName)) return;
    setCart(c => ({ ...c, [key]: { qty: prev.lots.length + 1, lots: [...prev.lots, lotName] } }));
  };

  const removeLot = (productId, lotName) => {
    const key     = String(productId);
    const newLots = (cart[key]?.lots || []).filter(l => l !== lotName);
    setCart(c => ({ ...c, [key]: { qty: newLots.length, lots: newLots } }));
  };

  const filtered = stock.filter(s =>
    !search || s.productName.toLowerCase().includes(search.toLowerCase())
  );

  const totalSelected = Object.values(cart).reduce((sum, v) => sum + (v.qty || 0), 0);

  return (
    <>
      <div className="return-modal-header">
        <div>
          <div className="return-modal-title">↩️ Retourbon aanmaken</div>
          <div className="return-modal-sub">Kies welke artikelen je teruggeeft aan het magazijn</div>
        </div>
        <button className="pickup-success-close" onClick={onClose} style={{ fontSize: 24 }}>×</button>
      </div>

      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <input type="text" className="form-input"
          placeholder="Zoek artikel in jouw bus..."
          value={search} onChange={e => setSearch(e.target.value)} autoFocus />
      </div>

      <div className="return-modal-list">
        {loadingStock && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <span className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        )}
        {!loadingStock && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
            Geen stock in jouw bus.
          </div>
        )}
        {!loadingStock && filtered.map(item => {
          const key      = String(item.productId);
          const cartItem = cart[key] || { qty: 0, lots: [] };
          const hasLots  = item.lots && item.lots.length > 0;
          return (
            <div key={item.productId}
              className={`return-stock-card ${cartItem.qty > 0 ? 'selected' : ''}`}>
              <div className="return-stock-info">
                <div className="return-stock-name">{item.productName}</div>
                <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 2 }}>
                  ● {item.qty} {item.unit} beschikbaar
                </div>
              </div>
              {hasLots ? (
                <div className="return-lot-section">
                  {cartItem.lots.map(lot => (
                    <div key={lot} className="return-lot-selected">
                      <span className="serial-badge">{lot}</span>
                      <button className="remove-line-btn" onClick={() => removeLot(item.productId, lot)}>✕</button>
                    </div>
                  ))}
                  <div className="return-lot-picker">
                    {item.lots.filter(l => !cartItem.lots.includes(l)).map(lot => (
                      <button key={lot} className="lot-option-btn"
                        onClick={() => addLot(item.productId, lot)}>+ {lot}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="qty-control">
                  <button className="qty-btn"
                    onClick={() => setQty(item.productId, cartItem.qty - 1)}
                    disabled={cartItem.qty === 0}>−</button>
                  <input type="number" className="qty-input"
                    value={cartItem.qty || ''} placeholder="0"
                    min="0" max={item.qty}
                    onChange={e => setQty(item.productId, parseInt(e.target.value) || 0)} />
                  <button className="qty-btn"
                    onClick={() => setQty(item.productId, Math.min(item.qty, cartItem.qty + 1))}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="return-modal-footer">
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={onNext}
            disabled={totalSelected === 0}
          >
            Volgende → Bevestigen ({totalSelected} artikel{totalSelected !== 1 ? 'en' : ''})
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
        </div>
      </div>
    </>
  );
}

// ── Stap 2: Bevestiging met optionele opmerking + swipe slider ────────────────
function StepConfirm({ cart, stock, note, setNote, onBack, onConfirm, saving, error }) {
  const cartItems = Object.entries(cart)
    .filter(([, v]) => v.qty > 0)
    .map(([pid, v]) => ({
      productId: parseInt(pid),
      quantity:  v.qty,
      lots:      v.lots || [],
      name:      stock.find(s => s.productId === parseInt(pid))?.productName || '?',
      unit:      stock.find(s => s.productId === parseInt(pid))?.unit || 'stuk',
    }));

  return (
    <>
      <div className="return-modal-header">
        <div>
          <div className="return-modal-title">Ben je zeker?</div>
          <div className="return-modal-sub">Controleer je selectie en bevestig de retour</div>
        </div>
      </div>

      {/* Overzicht geselecteerde artikelen */}
      <div className="return-confirm-list">
        <div className="return-confirm-label">Te retourneren artikelen</div>
        {cartItems.map((item, i) => (
          <div key={i} className="return-confirm-row">
            <div className="return-confirm-name">{item.name}</div>
            <div className="return-confirm-qty">
              {item.lots.length > 0 ? (
                <div className="return-confirm-lots">
                  {item.lots.map(lot => (
                    <span key={lot} className="serial-badge">{lot}</span>
                  ))}
                </div>
              ) : (
                <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  {item.quantity} {item.unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Opmerking (optioneel) */}
      <div className="return-note-field">
        <label>Opmerking (optioneel)</label>
        <textarea
          placeholder="Extra info voor de magazijnier..."
          value={note}
          onChange={e => setNote(e.target.value)}
          disabled={saving}
          maxLength={500}
        />
      </div>

      {/* Waarschuwing */}
      <div className="return-warning-box">
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>
            Let op
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            Na het aanmaken kan de bon niet meer gewijzigd worden via het portaal.
            De magazijnier controleert en bevestigt de retour in Odoo.
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ margin: '12px 20px 0', fontSize: 13 }}>
          <span>⚠</span> {error}
        </div>
      )}

      <div className="return-modal-footer">
        <div style={{ marginBottom: 14 }}>
          <SwipeToConfirm onConfirm={onConfirm} disabled={saving} />
        </div>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={onBack}
          disabled={saving}
        >
          ← Nee, terug naar selectie
        </button>
      </div>
    </>
  );
}

// ── Gecombineerde modal ───────────────────────────────────────────────────────
function CreateReturnModal({ token, onClose, onCreated }) {
  const [step, setStep]             = useState(1);
  const [stock, setStock]           = useState([]);
  const [loadingStock, setLoading]  = useState(true);
  const [cart, setCart]             = useState({});
  const [search, setSearch]         = useState('');
  const [note, setNote]             = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    api.getBusStockAll(token)
      .then(d => { setStock(d.buses?.[0]?.stock || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCreate = async () => {
    setSaving(true); setError('');
    try {
      const items = Object.entries(cart)
        .filter(([, v]) => v.qty > 0)
        .map(([pid, v]) => ({ productId: parseInt(pid), quantity: v.qty, lotNames: v.lots || [] }));
      const result = await api.createReturn(token, items, note.trim() || undefined);
      onCreated(result.pickingName);
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="return-modal">
        {/* Stap indicator */}
        <div className="return-steps">
          <div className={`return-step ${step >= 1 ? 'active' : ''}`}>
            <span className="step-num">1</span> Selectie
          </div>
          <div className="step-connector" />
          <div className={`return-step ${step >= 2 ? 'active' : ''}`}>
            <span className="step-num">2</span> Bevestigen
          </div>
        </div>

        {step === 1 && (
          <StepSelect
            stock={stock} loadingStock={loadingStock}
            cart={cart} setCart={setCart}
            search={search} setSearch={setSearch}
            onNext={() => { setError(''); setStep(2); }}
            onClose={onClose}
          />
        )}
        {step === 2 && (
          <StepConfirm
            cart={cart} stock={stock}
            note={note} setNote={setNote}
            onBack={() => setStep(1)}
            onConfirm={handleCreate}
            saving={saving}
            error={error}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Overzichtspagina ──────────────────────────────────────────────────────────
export default function ReturnPage() {
  const { token } = useAuth();
  const [returns, setReturns]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [expandedIds, setExpandedIds]   = useState(new Set());
  const [showCreate, setShowCreate]     = useState(false);
  const [success, setSuccess]           = useState('');
  const [error, setError]               = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingIds, setDeletingIds]   = useState(new Set());

  const toggleExpand = (id) => {
    const key = String(id);
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getReturns(token)
      .then(d => { setReturns(d.returns || []); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (name) => {
    setSuccess(`Retourbon ${name} aangemaakt. De magazijnier wordt op de hoogte gebracht.`);
    load();
    setTimeout(() => setSuccess(''), 7000);
  };

  const handleDelete = async (id) => {
    setDeletingIds(prev => new Set(prev).add(id));
    setConfirmDeleteId(null);
    try {
      await api.deleteReturn(token, id);
      setReturns(prev => prev.filter(r => r.id !== id));
      setSuccess('Retourbon verwijderd uit het portaal.');
      setTimeout(() => setSuccess(''), 5000);
    } catch (e) {
      setError('Kon retour niet verwijderen: ' + e.message);
    } finally {
      setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 300 }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );

  return (
    <div className="fade-in">
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <span>✓</span> {success}
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span>⚠</span> {error}
        </div>
      )}

      <div className="pickups-header">
        <div>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>
            Materialen die je niet hebt gebruikt terugsturen naar het magazijn.
            De magazijnier controleert en bevestigt.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            + Retourbon aanmaken
          </button>
        </div>
      </div>

      {returns.length === 0 ? (
        <div className="pickups-empty card">
          <div style={{ fontSize: 40, marginBottom: 12 }}>↩️</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
            color: 'var(--text)', marginBottom: 8 }}>
            Geen openstaande retourbonnen
          </div>
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>
            Klik op "+ Retourbon aanmaken" om niet-gebruikte materialen terug te sturen.
          </p>
        </div>
      ) : (
        <div className="pickups-list">
          {returns.map(ret => {
            const cfg        = STATE_CONFIG[ret.state] || STATE_CONFIG.confirmed;
            const key        = String(ret.id);
            const isExpanded = expandedIds.has(key);
            const isDeleting = deletingIds.has(ret.id);
            const isConfirmingDelete = confirmDeleteId === ret.id;

            return (
              <div key={ret.id} className="picking-card card">
                {/* Klikbare header */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 18px', flexWrap: 'wrap', cursor: 'pointer' }}
                  onClick={() => { if (!isConfirmingDelete) toggleExpand(ret.id); }}
                >
                  <div className="picking-state-indicator"
                    style={{ background: cfg.bg, borderColor: cfg.color, border: '1px solid' }}>
                    <span style={{ color: cfg.color, fontSize: 13, fontWeight: 700,
                      fontFamily: 'var(--font-display)' }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="picking-name">{ret.name}</div>
                    <div className="picking-meta">
                      <span>📋 {ret.origin}</span>
                      {ret.scheduledDate && (
                        <span>📅 {new Date(ret.scheduledDate).toLocaleDateString('nl-BE')}</span>
                      )}
                      {ret.items && <span>{ret.items.length} artikel{ret.items.length !== 1 ? 'en' : ''}</span>}
                    </div>
                  </div>

                  {/* Verwijderknop */}
                  <button
                    className="return-delete-btn"
                    onClick={e => {
                      e.stopPropagation();
                      setConfirmDeleteId(isConfirmingDelete ? null : ret.id);
                    }}
                    disabled={isDeleting}
                    title="Verwijder uit portaal"
                  >
                    {isDeleting
                      ? <span className="spinner" style={{ width: 14, height: 14 }} />
                      : '🗑'}
                  </button>

                  <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Inline verwijderbevestiging */}
                {isConfirmingDelete && (
                  <div className="return-delete-confirm">
                    <div className="return-delete-confirm-text">
                      Verwijder uit portaal? De bon in Odoo blijft bestaan.
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        className="btn btn-sm"
                        style={{ background: 'var(--error)', color: '#fff', border: 'none' }}
                        onClick={() => handleDelete(ret.id)}
                      >
                        Verwijderen
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}

                {/* Detail: opmerking + artikelen */}
                {isExpanded && (
                  <div className="picking-detail fade-in">
                    {ret.note && (
                      <div className="return-detail-note">
                        <span className="return-detail-note-label">Opmerking</span>
                        <span className="return-detail-note-text">{ret.note}</span>
                      </div>
                    )}
                    {ret.items && ret.items.length > 0 && (
                      <table className="table">
                        <thead>
                          <tr><th>Artikel</th><th>Hoeveelheid</th><th>Eenheid</th></tr>
                        </thead>
                        <tbody>
                          {ret.items.map((item, i) => (
                            <tr key={i}>
                              <td style={{ color: 'var(--text)', fontWeight: 500 }}>{item.productName}</td>
                              <td style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--accent)' }}>
                                {item.qty}
                              </td>
                              <td style={{ color: 'var(--text3)' }}>{item.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {(!ret.items || ret.items.length === 0) && !ret.note && (
                      <div style={{ padding: '12px 16px', color: 'var(--text3)', fontSize: 13 }}>
                        Geen details beschikbaar.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateReturnModal
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
