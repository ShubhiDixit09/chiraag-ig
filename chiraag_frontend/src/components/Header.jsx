import React from 'react'
import { USE_MOCK_DATA } from '../lib/api'

export function Header() {
  return <header className="tool-header">
    <div className="wordmark">CHIRAAG</div>
    <div className="product-line">Safer walking after dark</div>
    <div className="header-meta">
      <span>NEW DELHI PILOT</span>
      <span className="local-dot">{USE_MOCK_DATA ? 'LOCAL DATA' : 'LIVE DATA'}</span>
    </div>
  </header>
}