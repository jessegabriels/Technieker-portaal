// src/pages/Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import '../components/UI.css';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.login(username, password);
      login(data.token, data.user);
      navigate('/order');
    } catch (err) {
      setError(err.message || 'Inloggen mislukt.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-card fade-in">
        <div className="login-logo">
          <div className="login-logo-mark">TP</div>
          <div>
            <div className="login-logo-title">Bestelportaal</div>
            <div className="login-logo-sub">Technieker — Inloggen</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="alert alert-error">
              <span>⚠</span> {error}
            </div>
          )}
          <div className="form-field">
            <label className="form-label" htmlFor="username">Gebruikersnaam</label>
            <input
              id="username" type="text" className="form-input"
              value={username} onChange={e => setUsername(e.target.value)}
              placeholder="gebruikersnaam" autoComplete="username" required
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="password">Wachtwoord</label>
            <input
              id="password" type="password" className="form-input"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Bezig...</> : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  );
}
