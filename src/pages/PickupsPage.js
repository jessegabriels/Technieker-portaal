// src/pages/PickupsPage.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { createPortal } from 'react-dom';
import '../components/UI.css';
import './PickupsPage.css';

const POLL_INTERVAL = 20000;

const STATE_CONFIG = {
  assigned:            { label: 'Klaar voor ophalen', color: 'var(--success)',  bg: 'rgba(34,197,94,0.1)',  icon: '✓' },
  partially_available: { label: 'Gedeeltelijk klaar', color: 'var(--warning)',  bg: 'rgba(245,158,11,0.1)', icon: '◑' },
  confirmed:           { label: 'In behandeling',     color: 'var(--info)',     bg: 'rgba(59,130,246,0.1)', icon: '⏳' },
  waiting:             { label: 'Wachtend',            color: 'var(--text3)',    bg: 'var(--surface2)',      icon: '⏸' },
};

// ── Serienummers weergave ─────────────────────────────────────────────────────
function ItemWithSerials({ item }) {
  return (
    <div className="item-with-serials">
      <div className="item-main-row">
        <span className="item-name">{item.productName}</span>
        <span className="item-qty-wrap">
          <span className="item-qty-demand">{item.qtyDemand}</span>
          {item.qtyAvailable !== item.qtyDemand && (
            <span className="item-qty-available"
              style={{ color: item.qtyAvailable >= item.qtyDemand ? 'var(--success)' : 'var(--warning)' }}>
              /{item.qtyAvailable} beschikbaar
            </span>
          )}
          {item.unit && <span className="item-unit">{item.unit}</span>}
        </span>
      </div>

      {item.serials && item.serials.length > 0 && (
        <div className="serial-list">
          {item.serials.map((serial, j) => (
            <div key={j} className="serial-item">
              <span className="serial-arrow">↳</span>
              <span className="serial-badge">{serial}</span>
            </div>
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
      <div className="modal" style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
        <div className="modal-title" style={{ textAlign: 'center' }}>
          Ophalen bevestigen
        </div>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 8 }}>
          Picking:{' '}
          <strong style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
            {picking.name}
          </strong>
        </p>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 16 }}>
          Bevestig dat je de onderstaande artikelen hebt opgehaald.
        </p>

        <div className="confirm-items">
          {picking.items.map((item, i) => (
            <div key={i} className="confirm-item-block">
              <div className="confirm-item-row">
                <span className="confirm-item-name">{item.productName}</span>
                <span className="confirm-item-qty">
                  <strong>{item.qtyAvailable}</strong> {item.unit}
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
              : '✓ Ja, ik heb dit opgehaald'}
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
        <div className="pickup-success-title">Ophalen bevestigd!</div>
        <div className="pickup-success-sub">
          Picking <strong>{picking.name}</strong> is succesvol verwerkt in Odoo.
        </div>
      </div>
      <button className="pickup-success-close" onClick={onClose}>×</button>
    </div>
  );
}

// ── Pickings lijst ────────────────────────────────────────────────────────────
function PickingsList({ pickings, expandedIds, onToggle, onConfirm }) {
  if (pickings.length === 0) return (
    <div className="pickups-empty card" style={{ marginTop: 0 }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
      <p style={{ color: 'var(--text3)', fontSize: 14 }}>
        Geen openstaande pickings in deze categorie.
      </p>
    </div>
  );

  return (
    <div className="pickups-list">
      {pickings.map(picking => {
        const cfg        = STATE_CONFIG[picking.state] || STATE_CONFIG.waiting;
        const key        = String(picking.id);
        const isExpanded = expandedIds.has(key);
        const canConfirm = picking.state === 'assigned' || picking.state === 'partially_available';

        return (
          <div key={key} className="picking-card card">
            <div
              className="picking-card-header"
              onClick={() => onToggle(picking.id)}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onToggle(picking.id)}
            >
              <div className="picking-state-indicator"
                style={{ background: cfg.bg, borderColor: cfg.color }}>
                <span style={{ color: cfg.color, fontSize: 16 }}>{cfg.icon}</span>
                <span style={{ color: cfg.color, fontSize: 12, fontWeight: 700,
                  fontFamily: 'var(--font-display)' }}>
                  {cfg.label}
                </span>
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
                  {picking.origin && <span>{picking.isOrder ? '🛒' : '📋'} {picking.origin}</span>}
                  {picking.scheduledDate && (
                    <span>📅 {new Date(picking.scheduledDate).toLocaleDateString('nl-BE')}</span>
                  )}
                  <span>{picking.items.length} artikel{picking.items.length !== 1 ? 'en' : ''}</span>
                </div>
              </div>

              <div className="picking-card-actions">
                {canConfirm && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={e => { e.stopPropagation(); onConfirm(picking); }}
                  >
                    ✓ Ophalen bevestigen
                  </button>
                )}
                <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {isExpanded && (
              <div className="picking-detail fade-in">
                {/* Artikelen met serienummers */}
                <div className="picking-items-list">
                  {picking.items.map((item, i) => (
                    <ItemWithSerials key={i} item={item} />
                  ))}
                </div>

                <div className="picking-locations">
                  <span>Van: <strong>{picking.fromLocation}</strong></span>
                  <span style={{ color: 'var(--accent)' }}>→</span>
                  <span>Naar: <strong>{picking.toLocation}</strong></span>
                </div>

                {picking.state === 'partially_available' && (
                  <div className="alert alert-warning" style={{ marginTop: 12, fontSize: 13 }}>
                    ⚠ Niet alle artikelen zijn beschikbaar. Je kan toch bevestigen — enkel de beschikbare hoeveelheden worden verwerkt.
                  </div>
                )}
                {!canConfirm && (
                  <div className="alert" style={{ marginTop: 12, fontSize: 13,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    color: 'var(--text2)' }}>
                    Deze picking is nog niet klaar voor ophalen. De magazijnier is ermee bezig.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────
export default function PickupsPage() {
  const { token } = useAuth();
  const [pickings, setPickings]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [warning, setWarning]               = useState('');
  const [error, setError]                   = useState('');
  const [confirmPicking, setConfirmPicking] = useState(null);
  const [validating, setValidating]         = useState(false);
  const [successPicking, setSuccessPicking] = useState(null);
  const [expandedIds, setExpandedIds]       = useState(new Set());
  const [activeTab, setActiveTab]           = useState('bestellingen');
  const [lastUpdated, setLastUpdated]       = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await api.getPickings(token);
      setPickings(data.pickings || []);
      setWarning(data.warning || '');
      setError('');
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [load]);

  const toggleExpand = useCallback((pickingId) => {
    const key = String(pickingId);
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
      setError(e.message);
      setConfirmPicking(null);
    } finally {
      setValidating(false);
    }
  };

  // Splits in bestellingen (portaal) en projecten (planner)
  const orderPickings   = pickings.filter(p => p.isOrder);
  const projectPickings = pickings.filter(p => !p.isOrder);

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
      {warning && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <span>⚠</span> {warning}
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          <span>⚠</span> {error}
        </div>
      )}

      {/* Header */}
      <div className="pickups-header">
        <div>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>
            Bestellingen en projectmateriaal dat klaarstaat voor ophalen.
          </p>
          {lastUpdated && (
            <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>
              Automatisch verversen elke 20s — laatste update: {lastUpdated.toLocaleTimeString('nl-BE')}
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

      {/* Tabs */}
      <div className="pickup-tabs">
        <button
          className={`pickup-tab ${activeTab === 'bestellingen' ? 'active' : ''}`}
          onClick={() => setActiveTab('bestellingen')}
        >
          🛒 Bestellingen
          {orderPickings.length > 0 && (
            <span className="tab-badge">{orderPickings.length}</span>
          )}
        </button>
        <button
          className={`pickup-tab ${activeTab === 'projecten' ? 'active' : ''}`}
          onClick={() => setActiveTab('projecten')}
        >
          📋 Projecten
          {projectPickings.length > 0 && (
            <span className="tab-badge">{projectPickings.length}</span>
          )}
        </button>
      </div>

      {/* Tab inhoud */}
      <div className="pickup-tab-content">
        {activeTab === 'bestellingen' && (
          <PickingsList
            pickings={orderPickings}
            expandedIds={expandedIds}
            onToggle={toggleExpand}
            onConfirm={setConfirmPicking}
          />
        )}
        {activeTab === 'projecten' && (
          <PickingsList
            pickings={projectPickings}
            expandedIds={expandedIds}
            onToggle={toggleExpand}
            onConfirm={setConfirmPicking}
          />
        )}
      </div>

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
