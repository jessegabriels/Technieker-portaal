// src/pages/OrderPage.js
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import SuccessModal from '../components/SuccessModal';
import '../components/UI.css';
import './OrderPage.css';

const DEPT_LABELS = {
  laadpalen: 'Laadpalen', zonnepanelen: 'Zonnepanelen',
  all: 'Algemeen', algemeen: 'Algemeen',
};

export default function OrderPage() {
  const { token } = useAuth();
  const [articles, setArticles]       = useState([]);
  const [stockByOdooId, setStockByOdooId] = useState(null); // null = nog niet geladen
  const [cart, setCart]               = useState({});
  const [note, setNote]               = useState('');
  const [search, setSearch]           = useState('');
  const [filterCat, setFilterCat]     = useState('all');
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [successResult, setSuccessResult] = useState(null);
  const [error, setError]             = useState('');
  // Deadline banner: toon 1x per sessie
  const [showDeadline, setShowDeadline] = useState(
    () => sessionStorage.getItem('deadline_dismissed') !== 'true'
  );

  useEffect(() => {
    // Artikelen en stockinfo parallel ophalen
    const articlesP = api.getArticles(token);
    const stockP    = api.getArticleStock(token);

    articlesP
      .then(d => setArticles(d.articles || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    // Stockinfo mag falen zonder de pagina te breken
    stockP
      .then(d => setStockByOdooId(d.stock || {}))
      .catch(() => setStockByOdooId({})); // bij fout: geen indicators tonen
  }, [token]);

  // Bepaal stockstatus voor een artikel
  // 'unknown'      → geen odooId, kunnen niet controleren
  // 'loading'      → stock nog niet geladen
  // 'in-stock'     → beschikbaar
  // 'out-of-stock' → 0 of negatief beschikbaar
  const getStockStatus = (article) => {
    if (!article.odooId) return 'unknown';
    if (stockByOdooId === null) return 'loading';
    const qty = stockByOdooId[article.odooId] ?? 0;
    return qty > 0 ? 'in-stock' : 'out-of-stock';
  };

  const categories = useMemo(() =>
    [...new Set(articles.map(a => a.category).filter(Boolean))].sort(),
    [articles]
  );

  const filtered = useMemo(() =>
    articles.filter(a => {
      const matchCat    = filterCat === 'all' || a.category === filterCat;
      const matchSearch = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.internalRef || '').toLowerCase().includes(search.toLowerCase()) ||
        (a.category || '').toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    }),
    [articles, search, filterCat]
  );

  const cartItems = useMemo(() =>
    Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ article: articles.find(a => a.id === id), qty }))
      .filter(i => i.article),
    [cart, articles]
  );

  const setQty = (id, qty) =>
    setCart(prev => ({ ...prev, [id]: Math.max(0, qty) }));

  const handleSubmit = async () => {
    if (!cartItems.length) return;
    setSubmitting(true); setError('');
    try {
      const items = cartItems.map(i => ({ articleId: i.article.id, quantity: i.qty }));
      const data  = await api.createOrder(token, items, note);
      setSuccessResult(data);
      setCart({}); setNote('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="loading-center">
      <span className="spinner" style={{ width: 32, height: 32 }} />
      <p>Artikelen laden...</p>
    </div>
  );

  return (
    <>
      {successResult && (
        <SuccessModal result={successResult} onClose={() => setSuccessResult(null)} />
      )}

      {showDeadline && (
        <div className="deadline-banner">
          <div className="deadline-banner-inner">
            <span className="deadline-icon">📅</span>
            <div>
              <strong>Bestellingen voor de week erna</strong>
              <p>Dien je bestelling ten laatste <strong>woensdagavond</strong> in.
              De magazijnier neemt alles donderdag klaar zodat je het <strong>vrijdagochtend</strong> kunt ophalen.</p>
            </div>
          </div>
          <button className="deadline-close"
            onClick={() => { setShowDeadline(false); sessionStorage.setItem('deadline_dismissed','true'); }}>
            ×
          </button>
        </div>
      )}

      <div className="order-layout fade-in">
        {/* ── Artikelenbrowser ─────────────────────────── */}
        <div className="article-browser">
          <div className="browser-filters">
            <input
              type="text" className="form-input"
              placeholder="Zoek artikel, ref of categorie..."
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <select className="form-input form-select" value={filterCat}
              onChange={e => setFilterCat(e.target.value)}>
              <option value="all">Alle categorieën</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">Geen artikelen gevonden.</div>
          ) : (
            <div className="article-list">
              {filtered.map(article => {
                const qty        = cart[article.id] || 0;
                const deptKey    = article.departments?.[0] === 'all'
                  ? 'all' : (article.departments?.[0] || 'all');
                const stockStatus = getStockStatus(article);
                const outOfStock  = stockStatus === 'out-of-stock';

                return (
                  <div key={article.id}
                    className={[
                      'article-card',
                      qty > 0 ? 'selected' : '',
                      outOfStock ? 'out-of-stock' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="article-info">
                      <div className="article-top-row">
                        <span className="article-ref">{article.internalRef}</span>
                        {article.category && (
                          <span className="article-category-tag">
                            {article.category}
                          </span>
                        )}
                      </div>
                      <div className="article-name">{article.name}</div>
                      <div className="article-meta">
                        <span className={`badge badge-dept-${deptKey}`}>
                          {DEPT_LABELS[deptKey] || deptKey}
                        </span>
                        <span className="article-unit">/{article.unit}</span>
                        {outOfStock && (
                          <span className="stock-badge-oos" title="Momenteel niet op voorraad in het magazijn. Je kunt dit artikel toch bestellen.">
                            Niet op voorraad
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="qty-control">
                      <button className="qty-btn"
                        onClick={() => setQty(article.id, qty - 1)}
                        disabled={qty === 0}>−</button>
                      <input
                        type="number" className="qty-input"
                        value={qty || ''} placeholder="0" min="0"
                        onChange={e => setQty(article.id, parseInt(e.target.value) || 0)}
                      />
                      <button className="qty-btn"
                        onClick={() => setQty(article.id, qty + 1)}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Winkelwagen ──────────────────────────────── */}
        <div className="cart-panel">
          <div className="cart-header">
            <span className="cart-title">Winkelwagen</span>
            {cartItems.length > 0 && (
              <span className="cart-count">
                {cartItems.length} {cartItems.length === 1 ? 'artikel' : 'artikelen'}
              </span>
            )}
          </div>

          {cartItems.length === 0 ? (
            <div className="cart-empty">
              <span style={{ fontSize: 32 }}>📦</span>
              <p>Selecteer artikelen om te bestellen</p>
            </div>
          ) : (
            <>
              <div className="cart-items">
                {cartItems.map(({ article, qty }) => {
                  const oos = getStockStatus(article) === 'out-of-stock';
                  return (
                    <div key={article.id} className="cart-item">
                      <div className="cart-item-info">
                        <div className="cart-item-name">{article.name}</div>
                        <div className="cart-item-ref">
                          {article.internalRef}
                          {article.category && (
                            <span className="cart-item-cat"> · {article.category}</span>
                          )}
                        </div>
                        {oos && (
                          <div className="cart-item-oos">⚠ Niet op voorraad</div>
                        )}
                      </div>
                      <div className="cart-item-qty">
                        <span className="qty-badge">{qty}</span>
                        <span className="cart-item-unit">{article.unit}</span>
                        <button className="remove-btn"
                          onClick={() => setQty(article.id, 0)}
                          title="Verwijderen">×</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="cart-footer">
                <div className="form-field">
                  <label className="form-label">Opmerking (optioneel)</label>
                  <textarea
                    className="form-input" rows={3} value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Bijv. dringend, voor project XYZ..."
                    style={{ resize: 'vertical' }}
                  />
                </div>
                {error && (
                  <div className="alert alert-error">
                    <span>⚠</span> {error}
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '13px' }}
                  onClick={handleSubmit} disabled={submitting}
                >
                  {submitting
                    ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Verwerken...</>
                    : `Bestelling plaatsen (${cartItems.length})`}
                </button>
                <div className="cart-disclaimer">
                  Bestelling wordt automatisch als picking aangemaakt in Odoo.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
