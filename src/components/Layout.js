// src/components/Layout.js
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth }  from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import './Layout.css';

const NAV = [
  { path: '/order',         label: 'Bestellen',         icon: '📦', roles: ['technician', 'admin'] },
  { path: '/history',       label: 'Mijn bestellingen', icon: '📋', roles: ['technician', 'admin'] },
  { path: '/pickups',       label: 'Ophalen',           icon: '🚐', roles: ['technician', 'admin'] },
  { path: '/place',         label: 'Plaatsen',          icon: '🔧', roles: ['technician', 'admin'] },
  { path: '/busstock',      label: 'Mijn bus',          icon: '🚌', roles: ['technician', 'admin'] },
  { path: '/return',        label: 'Retour',            icon: '↩️', roles: ['technician', 'admin'] },
  { path: '/admin/orders',  label: 'Alle bestellingen', icon: '🗂️', roles: ['admin'] },
  { path: '/admin/users',   label: 'Gebruikers',        icon: '👥', roles: ['admin'] },
  { path: '/admin/articles',      label: 'Artikelen',       icon: '🔧', roles: ['admin'] },
  { path: '/admin/warehouse-stock', label: 'Magazijn stock',  icon: '🏭', roles: ['admin'] },
];

const DEPT_LABELS = {
  all: 'Alle afdelingen', laadpalen: 'Laadpalen',
  zonnepanelen: 'Zonnepanelen', algemeen: 'Algemeen', admin: 'Beheer',
};

const COMPANY_NAME     = process.env.REACT_APP_COMPANY_NAME     || 'Bestelportaal';
const COMPANY_SUBTITLE = process.env.REACT_APP_COMPANY_SUBTITLE || 'Technieker';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle } = useTheme();

  const handleLogout = () => { logout(); navigate('/login'); };
  const visibleNav  = NAV.filter(n => n.roles.includes(user?.role));

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="layout">

      {/* Donker overlay — sluit sidebar op mobiel bij klik buiten */}
      {menuOpen && (
        <div className="sidebar-overlay" onClick={closeMenu} />
      )}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="sidebar-brand-logo">
              <img src="/logo-icon.png" alt="Telcom" className="sidebar-icon-img" />
            </div>
            <div>
              <div className="logo-title">{COMPANY_NAME}</div>
              <div className="logo-sub">{COMPANY_SUBTITLE}</div>
            </div>
          </div>
          {/* × sluitknop — enkel zichtbaar op mobiel */}
          <button className="sidebar-close-btn" onClick={closeMenu} aria-label="Sluiten">
            ×
          </button>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
          <div>
            <div className="user-name">{user?.name}</div>
            <div className="user-dept">{DEPT_LABELS[user?.department] || user?.department}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleNav.map(item => (
            <button
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => { navigate(item.path); closeMenu(); }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item theme-toggle-btn" onClick={toggle} title="Thema wisselen">
            <span className="nav-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
            <span className="theme-toggle-label">
              <span className="theme-current">{theme === 'dark' ? 'Donker' : 'Licht'}</span>
              <span className="theme-switch-track">
                <span className={`theme-switch-thumb ${theme === 'light' ? 'right' : ''}`} />
              </span>
            </span>
          </button>
          <button className="nav-item logout-btn" onClick={handleLogout}>
            <span className="nav-icon">→</span>
            <span>Afmelden</span>
          </button>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMenuOpen(o => !o)}>
            <span /><span /><span />
          </button>
          <div className="topbar-title">
            {visibleNav.find(n => n.path === location.pathname)?.label || COMPANY_NAME}
          </div>
          <div className="topbar-user">{user?.name}</div>
          <div className="topbar-company-logo">
            <img src="/logo-full.png" alt="Telcom" className="topbar-logo-img" />
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>

    </div>
  );
}