// src/components/Modal.js
// Gebruikt React Portal zodat de modal altijd gecentreerd staat
// ongeacht de positie van de parent component in de DOM.
import { createPortal } from 'react-dom';
import '../components/UI.css';

export default function Modal({ onClose, title, children, maxWidth = 480 }) {
  return createPortal(
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ maxWidth }}>
        {title && <div className="modal-title">{title}</div>}
        {children}
      </div>
    </div>,
    document.body
  );
}
