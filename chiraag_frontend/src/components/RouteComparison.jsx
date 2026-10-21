import React from 'react'

function describeUnlit(metrics) {
  const coverage = metrics.coverage_ratio ?? 0
  const unlit = Math.round(metrics.unlit_length_m)
  const pct = Math.round(coverage * 100)

  // Below 40% observed, an unlit figure is more misleading than useful --
  // "0 m unlit" would read as safe when it means we have not looked.
  if (coverage < 0.4) {
    return `${pct}% observed — not enough data`
  }

  if (coverage < 0.8) {
    return `${unlit} m unlit · ${pct}% observed`
  }

  return `${unlit} m unlit`
}

export function RouteComparison({ data, selected, onSelect }) {
  const shortest = data.baseline_route
  const safer = data.chiraag_route

  return (
    <section className="comparison" aria-label="Route comparison">
      <p className="eyebrow">COMPARE ROUTES</p>

      <button
        type="button"
        className={`route-choice ${
          selected === 'shortest' ? 'selected' : ''
        }`}
        onClick={() => onSelect('shortest')}
      >
        <span className="route-swatch shortest" />

        <span className="route-kind">
          <b>Shortest</b>
          <small>
            {describeUnlit(shortest.metrics)}
          </small>
        </span>

        <strong>
          {Math.round(shortest.metrics.total_length_m)} m
        </strong>
      </button>

      <button
        type="button"
        className={`route-choice ${
          selected === 'safe' ? 'selected' : ''
        }`}
        onClick={() => onSelect('safe')}
      >
        <span className="route-swatch safe" />

        <span className="route-kind">
          <b>Chiraag / safer</b>
          <small>
            {describeUnlit(safer.metrics)}
          </small>
        </span>

        <strong>
          {Math.round(safer.metrics.total_length_m)} m
        </strong>
      </button>
    </section>
  )
}