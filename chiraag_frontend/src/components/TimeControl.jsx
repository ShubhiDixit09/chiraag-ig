import React from 'react'

export function TimeControl({ hour, onChange }) {
  const format = value => `${String(value).padStart(2, '0')}:00`

  return (
    <section className="control-section">
      <div className="control-title">
        <label htmlFor="time">TIME OF DAY</label>
        <output>{format(hour)}</output>
      </div>

      <input
        id="time"
        type="range"
        min="0"
        max="23"
        step="1"
        value={hour}
        onChange={event => onChange(Number(event.target.value))}
        aria-label="Time of day"
      />

      <div className="range-labels">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </section>
  )
}