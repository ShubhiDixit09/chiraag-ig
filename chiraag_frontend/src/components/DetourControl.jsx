import React from 'react'

export function DetourControl({ value, onChange }) {
  return <section className="control-section">
    <div className="control-title"><label htmlFor="detour">MAX DETOUR</label><output>{value}%</output></div>
    <input id="detour" type="range" min="5" max="40" step="5" value={value} onChange={event => onChange(Number(event.target.value))} aria-label="Maximum detour" />
    <div className="range-labels"><span>5%</span><span>20%</span><span>40%</span></div>
  </section>
}