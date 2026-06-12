// src/pages/PlacePage.js
// Materiaal plaatsen bij de klant — WH/OUT pickings bevestigen
// + extra materiaal uit busstock toevoegen

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { createPortal } from 'react-dom';
import '../components/UI.css';
import './PlacePage.css';

const POLL_INTERVAL = 20000;

const STATE_CONFIG = {
  assigned:            { label: 'Klaar',             color: 'var(--success)',  bg: 'rgba(34,197,94,0.1)',  icon: '✓' },
  partially_available: { label: 'Gedeeltelijk',      color: 'var(--warning)',  bg: 'rgba(245,158,11,0.1)', icon: '◑' },
  confirmed:           { label: 'In behandeling',    color: 'var(--info)',     bg: 'rgba(59,130,246,0.1)', icon: '⏳' },
  waiting:             { label: 'Wachtend',           color: 'var(--text3)',    bg: 'var(--surface2)',      icon: '⏸' },
};

// ── Artikel met serienummers — normaal of bewerkbaar ─────────────────────────
function ItemWithSerials({ item, editMode, onRemoveLine, onRemoveMove, onUpdateQty, removingId, updatingId }) {
  return (
    <div className="place-item">
      <div className="place-item-row">
        <span className="place-item-name">{item.productName}</span>

        {/* Niet-serialized in edit mode: toon +/- knoppen */}
        {editMode && !item.isSerialTracked ? (
          <div className="qty-edit-control">
            <button className="qty-btn qty-btn-sm"
              onClick={() => onUpdateQty(item, item.qtyDemand - 1)}
              disabled={!!updatingId || item.qtyDemand <= 0}
              title={item.qtyDemand <= 1 ? 'Verwijdert de regel' : 'Verminder met 1'}>
              {item.qtyDemand <= 1 ? '🗑' : '−'}
            </button>
            <span className="qty-edit-display">
              {updatingId === `qty-${item.id}`
                ? <span className="spinner" style={{ width: 12, height: 12 }} />
                : <strong style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
                    {item.qtyDemand}
                  </strong>}
              {item.unit && <span style={{ color: 'var(--text3)', fontSize: 12, marginLeft: 3 }}>{item.unit}</span>}
            </span>
            <button className="qty-btn qty-btn-sm"
              onClick={() => onUpdateQty(item, item.qtyDemand + 1)}
              disabled={!!updatingId}
              title="Vermeerder met 1">
              +
            </button>
          </div>
        ) : (
          <span className="place-item-qty">
            <strong style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
              {item.qtyDemand}
            </strong>
            {item.unit && <span style={{ color: 'var(--text3)', marginLeft: 4 }}>{item.unit}</span>}
          </span>
        )}

        {/* In bewerkingsmodus: hele move verwijderen (niet-serialized, via 🗑 knop apart) */}
        {editMode && !item.isSerialTracked && item.qtyDemand > 1 && onRemoveMove && (
          <button className="remove-line-btn"
            onClick={() => onRemoveMove(item)}
            disabled={removingId === `move-${item.id}`}
            title="Verwijder volledig van bon">
            {removingId === `move-${item.id}`
              ? <span className="spinner" style={{ width: 12, height: 12 }} />
              : '🗑'}
          </button>
        )}
      </div>

      {/* Serienummers: in bewerkingsmodus met ✕ per serienummer */}
      {item.moveLines && item.moveLines.length > 0 && (
        <div className="place-serial-list">
          {item.moveLines.filter(ml => ml.lotName).map((ml, i) => (
            <div key={i} className="place-serial-item">
              <span className="serial-arrow">↳</span>
              <span className="serial-badge">{ml.lotName}</span>
              {editMode && onRemoveLine && (
                <button className="remove-line-btn"
                  style={{ marginLeft: 4 }}
                  onClick={() => onRemoveLine(ml, item)}
                  disabled={removingId === `line-${ml.id}`}
                  title="Verwijder dit serienummer">
                  {removingId === `line-${ml.id}`
                    ? <span className="spinner" style={{ width: 10, height: 10 }} />
                    : '✕'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Fallback: toon serials array als moveLines leeg is */}
      {(!item.moveLines || item.moveLines.length === 0) && item.serials && item.serials.length > 0 && (
        <div className="place-serial-list">
          {item.serials.map((s, i) => (
            <div key={i} className="place-serial-item">
              <span className="serial-arrow">↳</span>
              <span className="serial-badge">{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Extra materiaal panel ─────────────────────────────────────────────────────
function ExtraPanel({ picking, token, onClose, onAdded }) {
  const [stock, setStock]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart]       = useState({});   // { productId: quantity }
  const [search, setSearch]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.getBusStock(token)
      .then(d => setStock(d.stock || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const setQty = (productId, qty) =>
    setCart(prev => ({ ...prev, [String(productId)]: Math.max(0, qty) }));

  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([pid, qty]) => ({ productId: parseInt(pid), quantity: qty,
      name: stock.find(s => s.productId === parseInt(pid))?.productName || '?' }));

  const filtered = stock.filter(s =>
    !search || s.productName.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!cartItems.length) return;
    setSaving(true); setError('');
    try {
      await api.addPickingLines(token, picking.id, cartItems);
      onAdded();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="extra-panel">
        {/* Header */}
        <div className="extra-panel-header">
          <div>
            <div className="extra-panel-title">Extra materiaal toevoegen</div>
            <div className="extra-panel-sub">
              Bon: <strong style={{ color: 'var(--accent)' }}>{picking.name}</strong>
              &nbsp;— Kies uit jouw huidige busvoorraad
            </div>
          </div>
          <button className="pickup-success-close" onClick={onClose} style={{ fontSize: 24 }}>×</button>
        </div>

        {/* Zoek */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <input type="text" className="form-input"
            placeholder="Zoek artikel in jouw bus..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Busstock lijst */}
        <div className="extra-panel-list">
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <span className="spinner" style={{ width: 24, height: 24 }} />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
              {search ? 'Geen artikelen gevonden.' : 'Je bus is momenteel leeg.'}
            </div>
          )}
          {!loading && filtered.map(item => {
            const qty = cart[String(item.productId)] || 0;
            return (
              <div key={item.productId} className={`extra-stock-card ${qty > 0 ? 'selected' : ''}`}>
                <div className="extra-stock-info">
                  <div className="extra-stock-name">{item.productName}</div>
                  <div className="extra-stock-avail">
                    <span style={{ color: 'var(--success)', fontSize: 12 }}>
                      ● {item.available} {item.unit} beschikbaar
                    </span>
                  </div>
                </div>
                <div className="qty-control">
                  <button className="qty-btn"
                    onClick={() => setQty(item.productId, qty - 1)}
                    disabled={qty === 0}>−</button>
                  <input type="number" className="qty-input"
                    value={qty || ''} placeholder="0" min="0"
                    max={item.available}
                    onChange={e => setQty(item.productId, Math.min(item.available, parseInt(e.target.value) || 0))} />
                  <button className="qty-btn"
                    onClick={() => setQty(item.productId, Math.min(item.available, qty + 1))}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer met geselecteerde items + toevoegen */}
        <div className="extra-panel-footer">
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 10, fontSize: 13 }}>
              <span>⚠</span> {error}
            </div>
          )}
          {cartItems.length > 0 && (
            <div className="extra-cart-summary">
              {cartItems.map((item, i) => (
                <div key={i} className="extra-cart-row">
                  <span>{item.name}</span>
                  <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    +{item.quantity}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleSave}
              disabled={saving || cartItems.length === 0}
            >
              {saving
                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Bezig...</>
                : `Toevoegen aan bon (${cartItems.length})`}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Itemlijst met bewerkingsmodus ─────────────────────────────────────────────
function EditableItemList({ picking, token, onRefresh, editMode }) {
  const [removingId, setRemovingId] = React.useState(null);
  const [updatingId, setUpdatingId] = React.useState(null);
  const [error, setError]           = React.useState('');

  const handleRemoveLine = async (moveLine, item) => {
    if (!window.confirm(`Serienummer "${moveLine.lotName}" verwijderen?`)) return;
    const key = `line-${moveLine.id}`;
    setRemovingId(key); setError('');
    try {
      await api.editPickingLine(token, picking.id, 'remove_line', {
        moveLineId: moveLine.id, moveId: item.id,
      });
      onRefresh();
    } catch (e) { setError(e.message); }
    finally { setRemovingId(null); }
  };

  const handleRemoveMove = async (item) => {
    if (!window.confirm(`"${item.productName}" volledig verwijderen van deze bon?`)) return;
    const key = `move-${item.id}`;
    setRemovingId(key); setError('');
    try {
      await api.removePickingLine(token, picking.id, item.id);
      onRefresh();
    } catch (e) { setError(e.message); }
    finally { setRemovingId(null); }
  };

  const handleUpdateQty = async (item, newQty) => {
    const qty = Math.max(0, newQty);
    if (qty === 0 && !window.confirm(`"${item.productName}" verwijderen van deze bon?`)) return;
    const key = `qty-${item.id}`;
    setUpdatingId(key); setError('');
    try {
      await api.editPickingLine(token, picking.id, 'update_qty', {
        moveId: item.id,
        newQty: qty,
      });
      onRefresh();
    } catch (e) { setError(e.message); }
    finally { setUpdatingId(null); }
  };

  const originalItems = picking.items.filter(i => !i.isExtra);
  const extraItems    = picking.items.filter(i => i.isExtra);

  return (
    <div>
      {error && (
        <div className="alert alert-error" style={{ margin: '8px 0', fontSize: 13 }}>
          <span>⚠</span> {error}
        </div>
      )}
      {originalItems.length > 0 && (
        <div className="items-section">
          <div className="items-section-label">📋 Gepland materiaal</div>
          {originalItems.map((item, i) => (
            <ItemWithSerials key={i} item={item}
              editMode={editMode}
              onRemoveLine={handleRemoveLine}
              onRemoveMove={handleRemoveMove}
              onUpdateQty={handleUpdateQty}
              removingId={removingId}
              updatingId={updatingId} />
          ))}
        </div>
      )}
      {extraItems.length > 0 && (
        <div className="items-section items-section-extra">
          <div className="items-section-label">➕ Toegevoegd door technieker</div>
          {extraItems.map((item, i) => (
            <ItemWithSerials key={i} item={item}
              editMode={editMode}
              onRemoveLine={handleRemoveLine}
              onRemoveMove={handleRemoveMove}
              onUpdateQty={handleUpdateQty}
              removingId={removingId}
              updatingId={updatingId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bevestigingsmodal ─────────────────────────────────────────────────────────
function ConfirmModal({ picking, onConfirm, onCancel, loading }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCancel]);

  return createPortal(
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
        <div className="modal-title" style={{ textAlign: 'center' }}>Plaatsing bevestigen</div>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 8 }}>
          Picking: <strong style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
            {picking.name}
          </strong>
        </p>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 16 }}>
          Bevestig dat je alle onderstaande materialen hebt geplaatst bij de klant.
          Odoo wordt automatisch bijgewerkt.
        </p>
        <div className="confirm-items">
          {picking.items.map((item, i) => (
            <div key={i} className="confirm-item-block">
              <div className="confirm-item-row">
                <span className="confirm-item-name">{item.productName}</span>
                <span className="confirm-item-qty">
                  <strong>{item.qtyAvailable || item.qtyDemand}</strong> {item.unit}
                </span>
              </div>
              {item.serials && item.serials.length > 0 && (
                <div className="confirm-serial-list">
                  {item.serials.map((s, j) => (
                    <span key={j} className="confirm-serial-badge">{s}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
            onClick={onConfirm} disabled={loading} autoFocus
          >
            {loading
              ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Bezig...</>
              : '✓ Ja, materiaal geplaatst'}
          </button>
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            Annuleren
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Succesbanner ──────────────────────────────────────────────────────────────
function SuccessBanner({ picking, onClose }) {
  return (
    <div className="pickup-success fade-in">
      <div className="pickup-success-icon">✓</div>
      <div>
        <div className="pickup-success-title">Plaatsing bevestigd!</div>
        <div className="pickup-success-sub">
          Picking <strong>{picking.name}</strong> is verwerkt in Odoo.
        </div>
      </div>
      <button className="pickup-success-close" onClick={onClose}>×</button>
    </div>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────
export default function PlacePage() {
  const { token } = useAuth();
  const [pickings, setPickings]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [warning, setWarning]               = useState('');
  const [error, setError]                   = useState('');
  const [expandedIds, setExpandedIds]       = useState(new Set());
  const [editMode, setEditMode]             = useState(new Set());
  const [confirmPicking, setConfirmPicking] = useState(null);
  const [extraPicking, setExtraPicking]     = useState(null);
  const [validating, setValidating]         = useState(false);
  const [successPicking, setSuccessPicking] = useState(null);
  const [lastUpdated, setLastUpdated]       = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const data = await api.getOutboundPickings(token);
      setPickings(data.pickings || []);
      setWarning(data.warning || '');
      setError('');
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [load]);

  const toggleEdit = useCallback((id) => {
    const key = String(id);
    setEditMode(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id) => {
    const key = String(id);
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleConfirm = async () => {
    if (!confirmPicking) return;
    setValidating(true);
    try {
      await api.validatePicking(token, confirmPicking.id);
      setSuccessPicking(confirmPicking);
      setConfirmPicking(null);
      setPickings(prev => prev.filter(p => String(p.id) !== String(confirmPicking.id)));
      setTimeout(() => load(true), 1500);
    } catch (e) {
      setError(e.message); setConfirmPicking(null);
    } finally {
      setValidating(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 16, minHeight: 300 }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
      <p style={{ color: 'var(--text2)' }}>Pickings ophalen uit Odoo...</p>
    </div>
  );

  return (
    <div className="fade-in">
      {successPicking && (
        <SuccessBanner picking={successPicking} onClose={() => setSuccessPicking(null)} />
      )}
      {warning && <div className="alert alert-warning" style={{ marginBottom: 16 }}><span>⚠</span> {warning}</div>}
      {error   && <div className="alert alert-error"   style={{ marginBottom: 16 }}><span>⚠</span> {error}</div>}

      <div className="pickups-header">
        <div>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>
            Bevestig welk materiaal je bij de klant hebt geplaatst. Voeg eventueel extra artikelen toe uit je bus.
          </p>
          {lastUpdated && (
            <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>
              Automatisch verversen elke 20s — {lastUpdated.toLocaleTimeString('nl-BE')}
            </p>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => load(true)}
          disabled={refreshing} style={{ alignSelf: 'flex-start' }}>
          {refreshing
            ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Bezig...</>
            : '↻ Vernieuwen'}
        </button>
      </div>

      {/* Lege staat */}
      {pickings.length === 0 && !warning && !error && (
        <div className="pickups-empty card">
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔧</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
            color: 'var(--text)', marginBottom: 8 }}>
            Geen openstaande plaatsingen
          </div>
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>
            Pickings om te bevestigen verschijnen hier automatisch.
          </p>
        </div>
      )}

      {/* Pickings lijst */}
      <div className="pickups-list">
        {pickings.map(picking => {
          const cfg        = STATE_CONFIG[picking.state] || STATE_CONFIG.waiting;
          const key        = String(picking.id);
          const isExpanded = expandedIds.has(key);
          const canConfirm = picking.state === 'assigned' || picking.state === 'partially_available';

          return (
            <div key={key} className="picking-card card">
              <div className="picking-card-header" onClick={() => toggleExpand(picking.id)}
                role="button" tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && toggleExpand(picking.id)}>

                <div className="picking-state-indicator"
                  style={{ background: cfg.bg, borderColor: cfg.color }}>
                  <span style={{ color: cfg.color, fontSize: 16 }}>{cfg.icon}</span>
                  <span style={{ color: cfg.color, fontSize: 12, fontWeight: 700,
                    fontFamily: 'var(--font-display)' }}>{cfg.label}</span>
                </div>

                <div className="picking-card-info">
                  <div className="picking-name">
                    {picking.name}
                    {picking.partner && (
                      <span className="picking-partner">
                        📍 {picking.partner}
                      </span>
                    )}
                  </div>
                  <div className="picking-meta">
                    {picking.origin && <span>📋 {picking.origin}</span>}
                    {picking.scheduledDate && (
                      <span>📅 {new Date(picking.scheduledDate).toLocaleDateString('nl-BE')}</span>
                    )}
                    <span>{picking.items.length} artikel{picking.items.length !== 1 ? 'en' : ''}</span>
                  </div>
                </div>

                <div className="picking-card-actions">
                  {picking.maopBlocked ? (
                    /* ── MAOP nog niet klaar: bon vergrendeld ── */
                    <div
                      className="maop-lock-badge"
                      title={`Bevestig eerst ophaling: ${(picking.pendingMaopNames || []).join(', ')}`}
                    >
                      🔒 Wacht op ophaling
                    </div>
                  ) : canConfirm && (
                    <>
                      <button
                        className={`btn btn-sm ${editMode.has(String(picking.id)) ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={e => { e.stopPropagation(); toggleEdit(picking.id); if (!expandedIds.has(String(picking.id))) toggleExpand(picking.id); }}
                        title="Artikelen toevoegen of verwijderen"
                      >
                        ✏ Bewerken
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={e => { e.stopPropagation(); setExtraPicking(picking); }}
                        title="Extra materiaal toevoegen"
                      >
                        + Extra
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={e => { e.stopPropagation(); setConfirmPicking(picking); }}
                      >
                        ✓ Bevestigen
                      </button>
                    </>
                  )}
                  <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="picking-detail fade-in">
                  <div className="picking-items-list">
                    <EditableItemList picking={picking} token={token} onRefresh={() => load(true)} editMode={editMode.has(String(picking.id))} />
                  </div>

                  <div className="picking-locations">
                    <span>Van: <strong>{picking.fromLocation}</strong></span>
                    <span style={{ color: 'var(--accent)' }}>→</span>
                    <span>Naar: <strong>{picking.toLocation}</strong></span>
                  </div>

                  {/* MAOP-blokkering: toon duidelijke uitleg in de detail-sectie */}
                  {picking.maopBlocked && (
                    <div className="maop-lock-banner">
                      <span className="maop-lock-icon">🔒</span>
                      <div>
                        <div className="maop-lock-title">Ophaling nog niet bevestigd</div>
                        <div className="maop-lock-sub">
                          Bevestig eerst de ophaalbon
                          {picking.pendingMaopNames && picking.pendingMaopNames.length > 0 && (
                            <> <strong>{picking.pendingMaopNames.join(', ')}</strong></>
                          )}{' '}
                          zodat het materiaal in jouw bus zit, voor je het hier kan bevestigen.
                        </div>
                      </div>
                    </div>
                  )}

                  {!picking.maopBlocked && canConfirm && (
                    <div className="place-action-row">
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => setExtraPicking(picking)}>
                        + Extra materiaal toevoegen uit busstock
                      </button>
                      <button className="btn btn-primary btn-sm"
                        onClick={() => setConfirmPicking(picking)}>
                        ✓ Materiaal geplaatst — bevestigen
                      </button>
                    </div>
                  )}

                  {!canConfirm && !picking.maopBlocked && (
                    <div className="alert" style={{ marginTop: 12, fontSize: 13,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      color: 'var(--text2)' }}>
                      Deze picking is nog niet klaar. De planner is ermee bezig.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {extraPicking && (
        <ExtraPanel
          picking={extraPicking}
          token={token}
          onClose={() => setExtraPicking(null)}
          onAdded={() => { load(true); }}
        />
      )}

      {confirmPicking && (
        <ConfirmModal
          picking={confirmPicking}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmPicking(null)}
          loading={validating}
        />
      )}
    </div>
  );
}
