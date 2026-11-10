import React from 'react'

export function Header({ dataSource, viewMode = 'router', onViewModeChange }) {
  return (
    <header className="tool-header">
      <div className="wordmark">CHIRAAG</div>
      <div className="product-line">Safer walking after dark</div>
      <div className="header-meta">
        <span>NEW DELHI PILOT</span>
        <span className="local-dot">
          {dataSource === 'pilot_snapshot'
            ? 'SEP 2026 · PILOT SNAPSHOT'
            : dataSource === 'live_postgis'
            ? 'LIVE POSTGIS EVIDENCE'
            : 'CHECKING ROUTE DATA'}
        </span>
      </div>

      {onViewModeChange && (
        <div className="mode-toggle-group" role="tablist" aria-label="Application View Mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'router'}
            className={`mode-btn ${viewMode === 'router' ? 'active' : ''}`}
            onClick={() => onViewModeChange('router')}
          >
            Pedestrian Routing
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'municipal'}
            className={`mode-btn ${viewMode === 'municipal' ? 'active' : ''}`}
            onClick={() => onViewModeChange('municipal')}
          >
            Municipal Gap View <span className="mode-badge">76</span>
          </button>
        </div>
      )}
    </header>
  )
}
