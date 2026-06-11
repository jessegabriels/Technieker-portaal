// src/pages/WarehouseStockPage.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import './WarehouseStockPage.css';

// ─── Formatter helpers ────────────────────────────────────────────────────────

function fmtCurrency(val) {
  if (val === null || val === undefined) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  const [int, dec] = n.toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `€ ${intFmt},${dec}`;
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
  { key: 'internalRef',  label: 'Ref',         align: 'left'  },
  { key: 'name',         label: 'Naam',         align: 'left'  },
  { key: 'category',     label: 'Categorie',    align: 'left'  },
  { key: 'availableQty', label: 'Beschikbaar',  align: 'right' },
  { key: 'reservedQty',  label: 'Gereserveerd', align: 'right' },
  { key: 'qty',          label: 'Op voorraad',  align: 'right' },
  { key: 'unit',         label: 'Eenheid',      align: 'left'  },
  { key: 'costPrice',    label: 'Kostprijs',    align: 'right' },
  { key: 'totalValue',   label: 'Waarde',       align: 'right' },
];

// ─── Lot detail rij ───────────────────────────────────────────────────────────

function LotDetailRow({ product, colSpan }) {
  const isSerial = product.tracking === 'serial';
  const isLot    = product.tracking === 'lot';

  return (
    <tr className="ws-lot-detail-row">
      <td colSpan={colSpan} className="ws-lot-detail-cell">
        <div className="ws-lot-section">
          <span className="ws-lot-section-label">
            {isSerial ? 'Serienummers' : 'Lotnummers'}
            <span className="ws-lot-count">({product.lots.length})</span>
          </span>
          <div className="ws-lot-list">
            {product.lots.map(lot => {
              const fullyReserved = lot.availableQty === 0 && lot.reservedQty > 0;
              const partlyReserved = lot.reservedQty > 0 && lot.availableQty > 0;

              let title = '';
              if (isSerial) {
                title = fullyReserved ? 'Gereserveerd — niet beschikbaar' : 'Beschikbaar';
              } else {
                title = `Beschikbaar: ${fmtQty(lot.availableQty)}  |  Gereserveerd: ${fmtQty(lot.reservedQty)}  |  Totaal: ${fmtQty(lot.qty)}`;
              }

              return (
                <span
                  key={lot.id}
                  className={[
                    'ws-lot-chip',
                    fullyReserved  ? 'ws-lot-chip-reserved'       : '',
                    partlyReserved ? 'ws-lot-chip-partly-reserved' : '',
                  ].filter(Boolean).join(' ')}
                  title={title}
                >
                  <span className="ws-lot-name">{lot.name}</span>
                  {isLot && (
                    <span className="ws-lot-qty-info">
                      {fmtQty(lot.availableQty)}/{fmtQty(lot.qty)}
                    </span>
                  )}
                  {fullyReserved && (
                    <span className="ws-lot-reserved-tag">gereserveerd</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Hoofd component ──────────────────────────────────────────────────────────

export default function WarehouseStockPage() {
  const { token } = useAuth();

  const [products,     setProducts]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [search,       setSearch]       = useState('');
  const [catFilter,    setCatFilter]    = useState('');
  const [trackFilter,  setTrackFilter]  = useState(''); // '' | 'serial' | 'lot'
  const [sortField,    setSortField]    = useState('category');
  const [sortDir,      setSortDir]      = useState('asc');
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());

  const load = async () => {
    setLoading(true);
    setError(null);
    setExpandedRows(new Set());
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

  const toggleRow = useCallback((productId) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────

  const categories = useMemo(
    () => [...new Set(products.map(p => p.category))].sort(),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = products;

    if (catFilter)   rows = rows.filter(p => p.category === catFilter);
    if (trackFilter) rows = rows.filter(p => p.tracking === trackFilter);
    if (q) {
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.internalRef || '').toLowerCase().includes(q) ||
        // Ook zoeken in lot-/serienummers
        p.lots.some(l => l.name.toLowerCase().includes(q))
      );
    }

    const fn = SORT[sortField];
    if (fn) rows = [...rows].sort((a, b) => sortDir === 'asc' ? fn(a, b) : fn(b, a));

    return rows;
  }, [products, catFilter, trackFilter, search, sortField, sortDir]);

  // Auto-expand rijen waarvan een lot/SN overeenkomt met de zoekterm
  const autoExpandedIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set();
    const ids = new Set();
    filtered.forEach(p => {
      if (p.lots.some(l => l.name.toLowerCase().includes(q))) ids.add(p.productId);
    });
    return ids;
  }, [search, filtered]);

  const grandTotal    = useMemo(() => products.reduce((s, p) => s + (p.totalValue || 0), 0), [products]);
  const filteredTotal = useMemo(() => filtered.reduce((s, p) => s + (p.totalValue || 0), 0), [filtered]);
  const isFiltering   = !!search || !!catFilter || !!trackFilter;

  const serialCount = useMemo(() => products.filter(p => p.tracking === 'serial').length, [products]);
  const lotCount    = useMemo(() => products.filter(p => p.tracking === 'lot').length,    [products]);

  const handleSort = (field) => {
    if (!SORT[field]) return;
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
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
          {serialCount > 0 && (
            <div className="ws-stat">
              <span className="ws-stat-value">{serialCount}</span>
              <span className="ws-stat-label">geserialiseerd</span>
            </div>
          )}
          {lotCount > 0 && (
            <div className="ws-stat">
              <span className="ws-stat-value">{lotCount}</span>
              <span className="ws-stat-label">met lotnummer</span>
            </div>
          )}
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
          placeholder="Zoeken op naam, ref of serienummer…"
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
        {(serialCount > 0 || lotCount > 0) && (
          <select
            className="ws-cat-select"
            value={trackFilter}
            onChange={e => setTrackFilter(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="">Alle tracking</option>
            {serialCount > 0 && <option value="serial">Serienummer</option>}
            {lotCount    > 0 && <option value="lot">Lotnummer</option>}
            <option value="none">Geen tracking</option>
          </select>
        )}
        {isFiltering && (
          <button className="ws-clear-btn" onClick={() => { setSearch(''); setCatFilter(''); setTrackFilter(''); }}>
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

      {/* ── Tabel ── */}
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
                  filtered.map(p => {
                    const hasLots  = p.lots.length > 0;
                    const isExpanded = expandedRows.has(p.productId) || autoExpandedIds.has(p.productId);
                    const isSerial = p.tracking === 'serial';

                    return (
                      <React.Fragment key={p.productId}>
                        <tr
                          className={[
                            'ws-row',
                            hasLots   ? 'ws-row-has-lots' : '',
                            isExpanded ? 'ws-row-expanded'  : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => hasLots && toggleRow(p.productId)}
                        >
                          {/* Ref */}
                          <td className="ws-td ws-td-ref">
                            {p.internalRef || <span className="ws-nil">—</span>}
                          </td>

                          {/* Naam + tracking-indicator */}
                          <td className="ws-td ws-td-name">
                            <span>{p.name}</span>
                            {hasLots && (
                              <span className={`ws-tracking-badge ws-tracking-${p.tracking}`}>
                                {isSerial ? 'SN' : 'LOT'}
                              </span>
                            )}
                          </td>

                          {/* Categorie */}
                          <td className="ws-td ws-td-cat">
                            <span className="ws-cat-badge">{p.category}</span>
                          </td>

                          {/* Beschikbaar */}
                          <td className="ws-td ws-td-num">
                            {fmtQty(p.availableQty)}
                          </td>

                          {/* Gereserveerd */}
                          <td className={`ws-td ws-td-num ${p.reservedQty > 0 ? 'ws-reserved' : ''}`}>
                            {p.reservedQty > 0 ? fmtQty(p.reservedQty) : <span className="ws-nil">—</span>}
                          </td>

                          {/* Op voorraad + uitklap-knop */}
                          <td className="ws-td ws-td-num ws-td-bold">
                            <div className="ws-qty-cell">
                              {fmtQty(p.qty)}
                              {hasLots && (
                                <button
                                  className={`ws-lot-btn ${isExpanded ? 'ws-lot-btn-open' : ''}`}
                                  onClick={e => { e.stopPropagation(); toggleRow(p.productId); }}
                                  title={isExpanded ? 'Verberg nummers' : `Toon ${p.lots.length} ${isSerial ? 'serienummer(s)' : 'lotnummer(s)'}`}
                                >
                                  {p.lots.length} {isSerial ? 'SN' : 'lot'}
                                  <span className="ws-lot-btn-arrow">{isExpanded ? '▲' : '▼'}</span>
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Eenheid */}
                          <td className="ws-td ws-td-unit">
                            {p.unit || <span className="ws-nil">—</span>}
                          </td>

                          {/* Kostprijs */}
                          <td className="ws-td ws-td-num">
                            {p.costPrice > 0 ? fmtCurrency(p.costPrice) : <span className="ws-nil">—</span>}
                          </td>

                          {/* Waarde */}
                          <td className="ws-td ws-td-num ws-td-value">
                            {p.totalValue > 0 ? fmtCurrency(p.totalValue) : <span className="ws-nil">—</span>}
                          </td>
                        </tr>

                        {/* Uitklapbare lot/serial rij */}
                        {hasLots && isExpanded && (
                          <LotDetailRow product={p} colSpan={COLUMNS.length} />
                        )}
                      </React.Fragment>
                    );
                  })
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
