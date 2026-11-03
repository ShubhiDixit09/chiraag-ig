import React from 'react'

export function Header({ dataSource }) {
  return <header className="tool-header">
    <div className="wordmark">CHIRAAG</div>
    <div className="product-line">Safer walking after dark</div>
    <div className="header-meta">
      <span>NEW DELHI PILOT</span>
      <span className="local-dot">{dataSource === 'pilot_snapshot' ? 'SEP 2026 · PILOT SNAPSHOT' : dataSource === 'live_postgis' ? 'LIVE POSTGIS EVIDENCE' : 'CHECKING ROUTE DATA'}</span>
    </div>
  </header>
}