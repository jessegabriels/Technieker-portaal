// src/components/SuccessModal.js
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './SuccessModal.css';

const COLORS = ['#f0a500','#22c55e','#3b82f6','#ec4899','#a855f7','#e06b00','#06b6d4','#f59e0b'];
const COUNT  = 72;

function Confetti() {
  const pieces = useRef(
    Array.from({ length: COUNT }, (_, i) => ({
      id: i,
      color:    COLORS[i % COLORS.length],
      left:     Math.random() * 100,
      delay:    Math.random() * 2.5,
      duration: 2.2 + Math.random() * 2.8,
      width:    5 + Math.random() * 8,
      height:   8 + Math.random() * 14,
      rotate:   Math.random() * 360,
      shape:    Math.random() > 0.5 ? 'rect' : 'circle',
    }))
  ).current;

  return (
    <div className="confetti-wrap" aria-hidden>
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left:              `${p.left}%`,
            backgroundColor:   p.color,
            width:             p.width,
            height:            p.shape === 'circle' ? p.width : p.height,
            borderRadius:      p.shape === 'circle' ? '50%' : '2px',
            animationDelay:    `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform:         `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function SuccessModal({ result, onClose }) {
  const { order, odooPickingName, odooError } = result || {};

  // Sluit bij Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div className="success-overlay">
      <Confetti />

      <div className="success-card">
        {/* Animated checkmark */}
        <div className="check-wrapper">
          <svg className="check-svg" viewBox="0 0 52 52" aria-hidden>
            <circle className="check-circle" cx="26" cy="26" r="24" fill="none" />
            <path  className="check-mark"   fill="none" d="M14 27l8 8 16-18" />
          </svg>
        </div>

        <h2 className="success-title">Bestelling geplaatst!</h2>
        <p  className="success-sub">De magazijnier wordt automatisch op de hoogte gebracht.</p>

        {odooPickingName && !odooError && (
          <div className="picking-pill">
            <span className="picking-label">📋 Odoo picking</span>
            <span className="picking-number">{odooPickingName}</span>
          </div>
        )}

        {odooError && (
          <div className="success-warning">
            ⚠ Odoo: {odooError}
          </div>
        )}

        {order?.items?.length > 0 && (
          <div className="success-items">
            <div className="success-items-title">Bestelde artikelen</div>
            {order.items.map((item, i) => (
              <div key={i} className="success-item">
                <span className="success-item-name">{item.name}</span>
                <span className="success-item-qty">
                  <strong>{item.quantity}</strong> {item.unit}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="success-actions">
          <button
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center', padding: '13px' }}
            onClick={onClose}
            autoFocus
          >
            Nieuwe bestelling
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
