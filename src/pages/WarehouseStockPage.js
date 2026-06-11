// src/pages/WarehouseStockPage.js
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import './WarehouseStockPage.css';

// ─── Formatter helpers ────────────────────────────────────────────────────────

function fmtCurrency(val) {
  if (val === null || val === undefined) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  // Belgian notation: thousands = '.', decimal = ','
  const [int, dec] = n.toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `€ ${intFmt},${dec}`;
}

function fmtQty(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  if (n % 1 === 0) return n.toFixed(0);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

// ─── Sort definitions ─────────────────────────────────────────────────────────

const SORT = {
  internalRef:  (a, b) => (a.internalRef || '').localeCompare(b.internalRef || ''),
  name:         (a, b) => a.name.localeCompare(b.name),
  category:     (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  availableQty: (a, b) => a.availableQty - b.availableQty,
  reservedQty:  (a, b) => a.reservedQty  - b.reservedQty,
  qty:          (a, b) => a.qty          - b.qty,
  costPrice:    (a, b) => a.costPrice    - b.costPrice,
  totalValue:   (a, b) => a.totalValue   - b.totalValue,
};

const COLUMNS = [
  { key: 'internalRef',  label: 'Ref',           align: 'left'  },
  { key: 'name',         label: 'Naam',           align: 'left'  },
  { key: 'category',     label: 'Categorie',      align: 'left'  },
  { key: 'availableQty', label: 'Beschikbaar',    align: 'right' },
  { key: 'reservedQty',  label: 'Gereserveerd',   align: 'right' },
  { key: 'qty',          label: 'Op voorraad',    align: 'right' },
  { key: 'unit',         label: 'Eenheid',        align: 'left'  },
  { key: 'costPrice',    label: 'Kostprijs',      align: 'right' },
  { key: 'totalValue',   label: 'Waarde',         align: 'right' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function WarehouseStockPage() {
  const { token } = useAuth();

  const [products,    setProducts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [search,      setSearch]      = useState('');
  const [catFilter,   setCatFilter]   = useState('');
  const [sortField,   setSortField]   = useState('category');
  const [sortDir,     setSortDir]     = useState('asc');
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getWarehouseStock(token);
      setProducts(data.products || []);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ──────────────────────────────────────────────────────────

  const categories = useMemo(
    () => [...new Set(products.map(p => p.category))].sort(),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = products;

    if (catFilter) {
      rows = rows.filter(p => p.category === catFilter);
    }
    if (q) {
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.internalRef || '').toLowerCase().includes(q)
      );
    }

    const fn = SORT[sortField];
    if (fn) {
      rows = [...rows].sort((a, b) => sortDir === 'asc' ? fn(a, b) : fn(b, a));
    }

    return rows;
  }, [products, catFilter, search, sortField, sortDir]);

  const grandTotal    = useMemo(() => products.reduce((s, p) => s + (p.totalValue || 0), 0), [products]);
  const filteredTotal = useMemo(() => filtered.reduce((s, p) => s + (p.totalValue || 0), 0), [filtered]);
  const isFiltering   = !!search || !!catFilter;

  // ── Sort handler ──────────────────────────────────────────────────────────

  const handleSort = (field) => {
    if (!SORT[field]) return;
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="ws-page">

      {/* ── Header ── */}
      <div className="ws-header">
        <div className="ws-header-left">
          <h1 className="ws-title">Magazijn stock</h1>
          {lastUpdated && (
            <span className="ws-updated">
              Bijgewerkt: {lastUpdated.toLocaleTimeString('nl-BE')}
            </span>
          )}
        </div>
        <button className="ws-refresh-btn" onClick={load} disabled={loading}>
          {loading
            ? <span className="spinner" style={{ width: 16, height: 16 }} />
            : '↻ Vernieuwen'}
        </button>
      </div>

      {/* ── Stats ── */}
      {!loading && !error && products.length > 0 && (
        <div className="ws-stats">
          <div className="ws-stat">
            <span className="ws-stat-value">{products.length}</span>
            <span className="ws-stat-label">producten</span>
          </div>
          <div className="ws-stat">
            <span className="ws-stat-value">{categories.length}</span>
            <span className="ws-stat-label">categorieën</span>
          </div>
          <div className="ws-stat ws-stat-highlight">
            <span className="ws-stat-value">{fmtCurrency(grandTotal)}</span>
            <span className="ws-stat-label">totale stockwaarde</span>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="ws-filters">
        <input
          className="ws-search"
          type="search"
          placeholder="Zoeken op naam of referentie…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="ws-cat-select"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
        >
          <option value="">Alle categorieën</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {isFiltering && (
          <button className="ws-clear-btn" onClick={() => { setSearch(''); setCatFilter(''); }}>
            ✕ Wis filter
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="ws-error">
          <strong>Fout bij laden:</strong>&nbsp;{error}
          <button className="ws-error-retry" onClick={load}>Opnieuw proberen</button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="ws-loading">
          <span className="spinner" style={{ width: 32, height: 32 }} />
          <span>Magazijnstock ophalen…</span>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !error && (
        <>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  {COLUMNS.map(col => {
                    const sortable = !!SORT[col.key];
                    const isActive = sortField === col.key;
                    return (
                      <th
                        key={col.key}
                        className={[
                          'ws-th',
                          `ws-col-${col.key}`,
                          sortable ? 'ws-th-sortable' : '',
                          col.align === 'right' ? 'ws-th-right' : '',
                          isActive ? 'ws-th-active' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        {sortable && (
                          <span className={`ws-sort-icon ${isActive ? 'ws-sort-on' : 'ws-sort-off'}`}>
                            {isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="ws-empty">
                      {isFiltering
                        ? 'Geen producten gevonden voor deze filter.'
                        : 'Geen stockgegevens beschikbaar.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map(p => (
                    <tr key={p.productId} className="ws-row">
                      <td className="ws-td ws-td-ref">
                        {p.internalRef || <span className="ws-nil">—</span>}
                      </td>
                      <td className="ws-td ws-td-name">{p.name}</td>
                      <td className="ws-td ws-td-cat">
                        <span className="ws-cat-badge">{p.category}</span>
                      </td>
                      <td className="ws-td ws-td-num">
                        {fmtQty(p.availableQty)}
                      </td>
                      <td className={`ws-td ws-td-num ${p.reservedQty > 0 ? 'ws-reserved' : ''}`}>
                        {p.reservedQty > 0 ? fmtQty(p.reservedQty) : <span className="ws-nil">—</span>}
                      </td>
                      <td className="ws-td ws-td-num ws-td-bold">
                        {fmtQty(p.qty)}
                      </td>
                      <td className="ws-td ws-td-unit">
                        {p.unit || <span className="ws-nil">—</span>}
                      </td>
                      <td className="ws-td ws-td-num">
                        {p.costPrice > 0 ? fmtCurrency(p.costPrice) : <span className="ws-nil">—</span>}
                      </td>
                      <td className="ws-td ws-td-num ws-td-value">
                        {p.totalValue > 0 ? fmtCurrency(p.totalValue) : <span className="ws-nil">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Footer ── */}
          <div className="ws-footer">
            <span className="ws-footer-count">
              {isFiltering
                ? `${filtered.length} van ${products.length} producten`
                : `${products.length} producten`}
            </span>
            <div className="ws-footer-totals">
              {isFiltering && (
                <span className="ws-footer-sub">
                  Selectie:&nbsp;<strong>{fmtCurrency(filteredTotal)}</strong>
                </span>
              )}
              <span className="ws-footer-grand">
                Totale stockwaarde:&nbsp;<strong>{fmtCurrency(grandTotal)}</strong>
              </span>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
