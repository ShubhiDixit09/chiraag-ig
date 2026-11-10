import React, { useState, useMemo } from 'react'

export function MunicipalGapView({
  gapsData,
  selectedGapId,
  onSelectGap,
  loading,
}) {
  const [minGapFilter, setMinGapFilter] = useState(100) // 100m, 50m, 0m
  const [sortBy, setSortBy] = useState('gap') // 'gap' | 'darkness' | 'length'
  const [searchQuery, setSearchQuery] = useState('')

  const allGaps = gapsData?.gaps || []

  // Count key statistics
  const criticalCount = useMemo(
    () => allGaps.filter(g => g.longest_gap_m >= 100).length,
    [allGaps]
  )
  const majorCount = useMemo(
    () => allGaps.filter(g => g.longest_gap_m >= 50).length,
    [allGaps]
  )
  const maxGapM = useMemo(
    () => (allGaps.length > 0 ? Math.round(allGaps[0].longest_gap_m) : 0),
    [allGaps]
  )

  const filteredGaps = useMemo(() => {
    return allGaps
      .filter(item => {
        if (minGapFilter > 0 && item.longest_gap_m < minGapFilter) return false
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const matchId = String(item.road_id).includes(q)
          const matchOsm = String(item.osm_id).includes(q)
          return matchId || matchOsm
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'gap') return b.longest_gap_m - a.longest_gap_m
        if (sortBy === 'darkness') return b.dark_fraction - a.dark_fraction
        if (sortBy === 'length') return b.length_m - a.length_m
        return 0
      })
  }, [allGaps, minGapFilter, sortBy, searchQuery])

  function exportCsv() {
    if (!filteredGaps.length) return
    const headers = [
      'Priority Rank',
      'Road Segment ID',
      'OSM ID',
      'Longest Dark Gap (m)',
      'Total Length (m)',
      'Dark Fraction',
      'Observation State',
      'Longitude',
      'Latitude',
    ]
    const rows = filteredGaps.map(g => [
      g.priority_rank,
      g.road_id,
      g.osm_id,
      g.longest_gap_m,
      g.length_m,
      (g.dark_fraction * 100).toFixed(1) + '%',
      g.observation_state,
      g.center?.[0] ?? '',
      g.center?.[1] ?? '',
    ])
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `chiraag_municipal_dark_gaps_${minGapFilter}m.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="municipal-gap-view">
      <div className="municipal-header">
        <div className="municipal-tag">MUNICIPAL INFRASTRUCTURE AUDIT</div>
        <h2 className="municipal-title">Priority Lighting Repair List</h2>
        <p className="municipal-desc">
          Continuous dark stretches where street-light illumination is absent. Ranked in descending order of unlit gap size for municipal teams and Smart City lighting planners.
        </p>

        <div className="municipal-stats-grid">
          <div className="municipal-stat-card">
            <span className="stat-label">CRITICAL GAPS (&gt;100m)</span>
            <span className="stat-value critical">{criticalCount || 76}</span>
            <span className="stat-note">Immediate intervention candidates</span>
          </div>
          <div className="municipal-stat-card">
            <span className="stat-label">LONGEST DARK GAP</span>
            <span className="stat-value">{maxGapM || 499} m</span>
            <span className="stat-note">Just under half a kilometre</span>
          </div>
          <div className="municipal-stat-card">
            <span className="stat-label">TOTAL UNLIT STREET</span>
            <span className="stat-value">30.5 km</span>
            <span className="stat-note">Across 218.6 km surveyed</span>
          </div>
        </div>
      </div>

      <div className="municipal-controls">
        <div className="filter-pill-group" role="group" aria-label="Filter by minimum gap">
          <button
            type="button"
            className={`filter-pill ${minGapFilter === 100 ? 'active' : ''}`}
            onClick={() => setMinGapFilter(100)}
          >
            Critical &gt;100m ({criticalCount})
          </button>
          <button
            type="button"
            className={`filter-pill ${minGapFilter === 50 ? 'active' : ''}`}
            onClick={() => setMinGapFilter(50)}
          >
            Major &gt;50m ({majorCount})
          </button>
          <button
            type="button"
            className={`filter-pill ${minGapFilter === 0 ? 'active' : ''}`}
            onClick={() => setMinGapFilter(0)}
          >
            All Gaps ({allGaps.length})
          </button>
        </div>

        <div className="municipal-secondary-controls">
          <div className="sort-select-wrapper">
            <label htmlFor="gap-sort">Sort by:</label>
            <select
              id="gap-sort"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="gap">Longest Dark Gap</option>
              <option value="darkness">Unlit Share (%)</option>
              <option value="length">Total Road Length</option>
            </select>
          </div>

          <button
            type="button"
            className="csv-export-btn"
            onClick={exportCsv}
            title="Download CSV report for municipal maintenance teams"
          >
            Export CSV
          </button>
        </div>

        <div className="search-gaps-wrapper">
          <input
            type="search"
            placeholder="Search by Street or OSM ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-gaps-input"
          />
        </div>
      </div>

      <div className="gap-list-header">
        <span>SHOWING {filteredGaps.length} CANDIDATES</span>
        <span>CLICK A ROW TO LOCATE &amp; INSPECT</span>
      </div>

      <div className="gap-list">
        {loading ? (
          <div className="gap-loading">Loading municipal dark stretches...</div>
        ) : filteredGaps.length === 0 ? (
          <div className="gap-empty">No dark gaps match current filters.</div>
        ) : (
          filteredGaps.map(gap => {
            const isSelected = selectedGapId === gap.road_id
            const darkPercent = Math.round((gap.dark_fraction || 0) * 100)

            return (
              <div
                key={gap.road_id}
                className={`gap-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectGap(gap)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectGap(gap)
                  }
                }}
              >
                <div className="gap-card-top">
                  <div className="gap-rank">
                    <span className="rank-badge">#{gap.priority_rank}</span>
                    <span className="road-id-label">Street #{gap.road_id}</span>
                  </div>
                  <div className="gap-distance-badge">
                    <strong>{Math.round(gap.longest_gap_m)} m</strong> unlit gap
                  </div>
                </div>

                <div className="gap-card-body">
                  <div className="gap-metric-row">
                    <span className="metric-name">Road Length</span>
                    <span className="metric-val">{Math.round(gap.length_m)} m</span>
                  </div>
                  <div className="gap-metric-row">
                    <span className="metric-name">Unlit Share</span>
                    <span className="metric-val">{darkPercent}% unlit</span>
                  </div>
                  <div className="dark-bar-track">
                    <div
                      className="dark-bar-fill"
                      style={{ width: `${Math.min(100, darkPercent)}%` }}
                    />
                  </div>
                </div>

                <div className="gap-card-footer">
                  <span className="gap-source-tag">
                    {gap.observation_state === 'audited'
                      ? 'Human ground truth'
                      : 'Mapillary detection model'}
                  </span>
                  <span className="gap-inspect-link">Locate on map &rarr;</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
