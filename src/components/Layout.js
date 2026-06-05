// src/components/Layout.js
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

const NAV = [
  { path: '/order', label: 'Bestellen', icon: '📦', roles: ['technician', 'admin'] },
  { path: '/history', label: 'Mijn bestellingen', icon: '📋', roles: ['technician', 'admin'] },
  { path: '/admin/orders', label: 'Alle bestellingen', icon: '🗂️', roles: ['admin'] },
  { path: '/admin/users', label: 'Gebruikers', icon: '👥', roles: ['admin'] },
  { path: '/admin/articles', label: 'Artikelen', icon: '🔧', roles: ['admin'] },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const visibleNav = NAV.filter(n => n.roles.includes(user?.role));
  const deptLabel = {
    all: 'Alle afdelingen', laadpalen: 'Laadpalen', zonnepanelen: 'Zonnepanelen', admin: 'Beheer'
  };

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-mark">TP</span>
            <div>
              <div className="logo-title">Bestelportaal</div>
              <div className="logo-sub">Technieker</div>
            </div>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
          <div>
            <div className="user-name">{user?.name}</div>
            <div className="user-dept">{deptLabel[user?.department] || user?.department}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleNav.map(item => (
            <button
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => { navigate(item.path); setMenuOpen(false); }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item logout-btn" onClick={handleLogout}>
            <span className="nav-icon">→</span>
            <span>Afmelden</span>
          </button>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
            <span /><span /><span />
          </button>
          <div className="topbar-title">
            {visibleNav.find(n => n.path === location.pathname)?.label || 'Portaal'}
          </div>
          <div className="topbar-user">{user?.name}</div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
