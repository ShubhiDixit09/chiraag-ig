import React from 'react'

export function HeroMetric({ delta, coverage = 1 }) {
  const pct = Math.round(coverage * 100)

  return <section className="hero-metric" aria-label="Unlit road avoided">
    <div className="metric-number">{Math.round(delta.dark_avoided_m)}<span>m</span></div>
    <div className="metric-label">LESS UNLIT ROAD</div>
    <div className="metric-context">
      for only <b>{Math.round(delta.extra_m)} m extra</b> <span>(+{delta.extra_pct}%)</span>
    </div>
    {coverage < 0.8 && (
      <div className="metric-caveat">
        Based on the {pct}% of this route we have imagery for.
      </div>
    )}
  </section>
}