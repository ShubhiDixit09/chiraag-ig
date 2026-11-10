import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'


const API_KEY = import.meta.env.VITE_MAPTILER_KEY

// The pilot must not render a blank map just because its old MapTiler browser
// key is missing in a new deployment. OSM tiles include required attribution.
// A production-scale public rollout should use its own permitted tile provider.
const OPENSTREETMAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

const STREET_STYLE = API_KEY
  ? `https://api.maptiler.com/maps/streets-v4/style.json?key=${API_KEY}`
  : OPENSTREETMAP_STYLE

const SATELLITE_STYLE = API_KEY
  ? `https://api.maptiler.com/maps/satellite/style.json?key=${API_KEY}`
  : OPENSTREETMAP_STYLE


const line = (route) => ({
  type: 'FeatureCollection',
  features: [route],
})

const lineFeature = (coordinates) => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates,
  },
})

// Render the actual geometry of every physical road segment.
// Do NOT connect route nodes directly with straight lines because
// graph nodes represent endpoints/intersections, not the road shape.
const routeGeometryCollection = route => {
  const segments = route?.segments || []

  if (segments.length > 0) {
    return {
      type: 'FeatureCollection',
      features: segments
        .filter(segment => segment.coordinates?.length >= 2)
        .map(segment => ({
          type: 'Feature',
          properties: {
            road_id: segment.road_id,
            observation_state: segment.observation_state,
            dark_fraction: segment.dark_fraction ?? -1,
          },
          geometry: {
            type: 'LineString',
            coordinates: segment.coordinates,
          },
        })),
    }
  }

  // Safe fallback for old/API responses that do not contain segments.
  return line(lineFeature(route?.nodes || []))
}

// One feature per physical street, carrying the evidence needed to colour
// it and to open the drawer when clicked.
const segmentCollection = (route) => ({
  type: 'FeatureCollection',
  features: (route?.segments || [])
    .filter(segment => segment.coordinates?.length >= 2)
    .map(segment => ({
      type: 'Feature',
      properties: {
        road_id: segment.road_id,
        observation_state: segment.observation_state,
        // GeoJSON filters can't match null, so unknown is encoded as -1.
        dark_fraction:
          segment.dark_fraction === null ||
            segment.dark_fraction === undefined
            ? -1
            : segment.dark_fraction,
      },
      geometry: {
        type: 'LineString',
        coordinates: segment.coordinates,
      },
    })),
})

// FeatureCollection for municipal dark gap stretches
const darkGapsCollection = (gaps = []) => ({
  type: 'FeatureCollection',
  features: gaps
    .filter(segment => segment.coordinates?.length >= 2)
    .map(segment => ({
      type: 'Feature',
      properties: {
        road_id: segment.road_id,
        osm_id: segment.osm_id,
        longest_gap_m: segment.longest_gap_m,
        length_m: segment.length_m,
        dark_fraction: segment.dark_fraction,
        observation_state: segment.observation_state,
        priority_rank: segment.priority_rank,
      },
      geometry: {
        type: 'LineString',
        coordinates: segment.coordinates,
      },
    })),
})

export function MapView({
  data,
  selected,
  selectedSegment,
  onSegment,
  fromCoords,
  toCoords,
  fromName,
  toName,
  viewMode = 'router',
  darkGaps = [],
  flyToCoords = null,
}) {
  const container = useRef(null)
  const map = useRef(null)
  const markers = useRef([])
  const [satellite, setSatellite] = useState(false)

  // Keep the latest callback and route in refs so the map event handlers,
  // which are registered once, never close over stale props.
  const onSegmentRef = useRef(onSegment)
  const dataRef = useRef(data)
  const selectedRef = useRef(selected)
  const viewModeRef = useRef(viewMode)
  const darkGapsRef = useRef(darkGaps)

  useEffect(() => {
    onSegmentRef.current = onSegment
  }, [onSegment])

  useEffect(() => {
    dataRef.current = data
    selectedRef.current = selected
    viewModeRef.current = viewMode
    darkGapsRef.current = darkGaps
  }, [data, selected, viewMode, darkGaps])

  const activeRoute = () =>
    selectedRef.current === 'safe'
      ? dataRef.current?.chiraag_route
      : dataRef.current?.baseline_route

  const handleSegmentClick = useRef(event => {
    const feature = event.features?.[0]
    const roadId = feature?.properties?.road_id

    if (roadId !== undefined && roadId !== null) {
      onSegmentRef.current?.(roadId)
    }
  }).current

  const handleSegmentEnter = useRef(event => {
    event.target.getCanvas().style.cursor = 'pointer'
  }).current

  const handleSegmentLeave = useRef(event => {
    event.target.getCanvas().style.cursor = ''
  }).current

  function setLayerVisibility(m, layerId, isVisible) {
    if (m.getLayer(layerId)) {
      m.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none')
    }
  }

  function addChiraagLayers(m) {
    if (!m.getSource('shortest') && data?.baseline_route) {
      m.addSource('shortest', {
        type: 'geojson',
        data: routeGeometryCollection(data.baseline_route),
      })

      m.addLayer({
        id: 'shortest-line',
        type: 'line',
        source: 'shortest',
        paint: {
          'line-color': '#575b58',
          'line-width': selected === 'shortest' ? 6 : 3.5,
          'line-opacity': selected === 'shortest' ? 0.92 : 0.64,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: viewModeRef.current === 'router' ? 'visible' : 'none',
        },
      })
    }

    if (!m.getSource('safest') && data?.chiraag_route) {
      m.addSource('safest', {
        type: 'geojson',
        data: routeGeometryCollection(data.chiraag_route),
      })

      m.addLayer({
        id: 'safest-line',
        type: 'line',
        source: 'safest',
        paint: {
          'line-color': '#ad7f24',
          'line-width': selected === 'safe' ? 7 : 4.5,
          'line-opacity': selected === 'safe' ? 1 : 0.72,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: viewModeRef.current === 'router' ? 'visible' : 'none',
        },
      })
    }

    if (!m.getSource('segments') && (data?.chiraag_route || data?.baseline_route)) {
      m.addSource('segments', {
        type: 'geojson',
        data: segmentCollection(
          selected === 'safe' ? data.chiraag_route : data.baseline_route
        ),
      })

      m.addLayer({
        id: 'segments-unknown',
        type: 'line',
        source: 'segments',
        filter: ['==', ['get', 'observation_state'], 'unobserved'],
        paint: {
          'line-color': '#ffffff',
          'line-width': 2.4,
          'line-opacity': 0.95,
          'line-dasharray': [0.9, 1.5],
        },
        layout: {
          'line-cap': 'butt',
          visibility: viewModeRef.current === 'router' ? 'visible' : 'none',
        },
      })

      m.addLayer({
        id: 'segments-dark',
        type: 'line',
        source: 'segments',
        filter: ['>', ['get', 'dark_fraction'], 0.5],
        paint: {
          'line-color': '#151b23',
          'line-width': 3.4,
          'line-opacity': 0.92,
          'line-dasharray': [2, 1.1],
        },
        layout: {
          'line-cap': 'butt',
          visibility: viewModeRef.current === 'router' ? 'visible' : 'none',
        },
      })

      m.addLayer({
        id: 'segments-selected',
        type: 'line',
        source: 'segments',
        filter: ['==', ['get', 'road_id'], -1],
        paint: {
          'line-color': '#111311',
          'line-width': 10,
          'line-opacity': 0.35,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: viewModeRef.current === 'router' ? 'visible' : 'none',
        },
      })

      m.addLayer({
        id: 'segments-hit',
        type: 'line',
        source: 'segments',
        paint: {
          'line-color': '#000000',
          'line-width': 22,
          'line-opacity': 0,
        },
        layout: {
          visibility: viewModeRef.current === 'router' ? 'visible' : 'none',
        },
      })

      m.off('click', 'segments-hit', handleSegmentClick)
      m.on('click', 'segments-hit', handleSegmentClick)

      m.off('mouseenter', 'segments-hit', handleSegmentEnter)
      m.on('mouseenter', 'segments-hit', handleSegmentEnter)

      m.off('mouseleave', 'segments-hit', handleSegmentLeave)
      m.on('mouseleave', 'segments-hit', handleSegmentLeave)
    }
  }

  function addDarkGapsLayers(m) {
    if (!m.getSource('darkgaps')) {
      m.addSource('darkgaps', {
        type: 'geojson',
        data: darkGapsCollection(darkGapsRef.current),
      })

      // Red/amber glow for critical gaps
      m.addLayer({
        id: 'darkgaps-glow',
        type: 'line',
        source: 'darkgaps',
        paint: {
          'line-color': '#c62828',
          'line-width': 7,
          'line-opacity': 0.45,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: viewModeRef.current === 'municipal' ? 'visible' : 'none',
        },
      })

      // Sharp dark line indicating continuous unlit stretch
      m.addLayer({
        id: 'darkgaps-line',
        type: 'line',
        source: 'darkgaps',
        paint: {
          'line-color': '#1a1d1a',
          'line-width': 3.5,
          'line-opacity': 0.95,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: viewModeRef.current === 'municipal' ? 'visible' : 'none',
        },
      })

      // Selected dark gap highlight
      m.addLayer({
        id: 'darkgaps-selected',
        type: 'line',
        source: 'darkgaps',
        filter: ['==', ['get', 'road_id'], -1],
        paint: {
          'line-color': '#ad7f24',
          'line-width': 9,
          'line-opacity': 0.85,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: viewModeRef.current === 'municipal' ? 'visible' : 'none',
        },
      })

      // Wide hit area for clicking dark gaps
      m.addLayer({
        id: 'darkgaps-hit',
        type: 'line',
        source: 'darkgaps',
        paint: {
          'line-color': '#000000',
          'line-width': 24,
          'line-opacity': 0,
        },
        layout: {
          visibility: viewModeRef.current === 'municipal' ? 'visible' : 'none',
        },
      })

      m.off('click', 'darkgaps-hit', handleSegmentClick)
      m.on('click', 'darkgaps-hit', handleSegmentClick)

      m.off('mouseenter', 'darkgaps-hit', handleSegmentEnter)
      m.on('mouseenter', 'darkgaps-hit', handleSegmentEnter)

      m.off('mouseleave', 'darkgaps-hit', handleSegmentLeave)
      m.on('mouseleave', 'darkgaps-hit', handleSegmentLeave)
    }
  }

  function addMarkers(m) {
    markers.current.forEach(marker => marker.remove())
    markers.current = []

    if (viewModeRef.current === 'municipal') {
      return
    }

    const route = activeRoute()

    if (!route?.nodes?.length) return

    // Snapped route endpoints
    const start = route.nodes[0]
    const end = route.nodes[route.nodes.length - 1]

    const points = [
      {
        coords: start,
        color: '#222522',
        popup: fromName,
      },
      {
        coords: end,
        color: '#ad7f24',
        popup: toName,
      },
    ]

    points.forEach(point => {
      const marker = new maplibregl.Marker({
        color: point.color,
      })
        .setLngLat(point.coords)
        .setPopup(
          new maplibregl.Popup({ offset: 22 }).setText(point.popup)
        )
        .addTo(m)

      markers.current.push(marker)
    })
  }

  useEffect(() => {
    if (!container.current || map.current) return

    const m = new maplibregl.Map({
      container: container.current,
      style: STREET_STYLE,
      center: [77.2202, 28.6198],
      zoom: 15.65,
      attributionControl: true,
      pitchWithRotate: false,
      dragRotate: false,
    })

    m.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
      }),
      'top-right'
    )

    map.current = m

    m.on('load', () => {
      addChiraagLayers(m)
      addDarkGapsLayers(m)
      addMarkers(m)

      if (data?.baseline_route?.nodes?.length && data?.chiraag_route?.nodes?.length) {
        const coords = [
          ...data.baseline_route.nodes,
          ...data.chiraag_route.nodes,
        ]

        const bounds = coords.reduce(
          (b, coord) => b.extend(coord),
          new maplibregl.LngLatBounds(coords[0], coords[0])
        )

        m.fitBounds(bounds, {
          padding: 100,
          duration: 0,
        })
      }
    })

    return () => {
      m.off('click', 'segments-hit', handleSegmentClick)
      m.off('mouseenter', 'segments-hit', handleSegmentEnter)
      m.off('mouseleave', 'segments-hit', handleSegmentLeave)

      m.off('click', 'darkgaps-hit', handleSegmentClick)
      m.off('mouseenter', 'darkgaps-hit', handleSegmentEnter)
      m.off('mouseleave', 'darkgaps-hit', handleSegmentLeave)

      markers.current.forEach(marker => marker.remove())
      markers.current = []
      m.remove()
      map.current = null
    }
  }, [])

  // Update routing data
  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return

    addChiraagLayers(m)

    if (data?.baseline_route) {
      m.getSource('shortest')?.setData(
        routeGeometryCollection(data.baseline_route)
      )
    }

    if (data?.chiraag_route) {
      m.getSource('safest')?.setData(
        routeGeometryCollection(data.chiraag_route)
      )
    }

    const route = activeRoute()
    if (route) {
      m.getSource('segments')?.setData(segmentCollection(route))
    }

    addMarkers(m)

    if (m.getLayer('shortest-line')) {
      m.setPaintProperty(
        'shortest-line',
        'line-width',
        selected === 'shortest' ? 6 : 3.5
      )
      m.setPaintProperty(
        'shortest-line',
        'line-opacity',
        selected === 'shortest' ? 0.92 : 0.64
      )
    }

    if (m.getLayer('safest-line')) {
      m.setPaintProperty(
        'safest-line',
        'line-width',
        selected === 'safe' ? 7 : 4.5
      )
      m.setPaintProperty(
        'safest-line',
        'line-opacity',
        selected === 'safe' ? 1 : 0.72
      )
    }
  }, [data, selected])

  // Update dark gaps data
  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return

    addDarkGapsLayers(m)
    m.getSource('darkgaps')?.setData(darkGapsCollection(darkGaps))
  }, [darkGaps])

  // Toggle view mode layers
  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return

    const isMunicipal = viewMode === 'municipal'

    // Router layers
    setLayerVisibility(m, 'shortest-line', !isMunicipal)
    setLayerVisibility(m, 'safest-line', !isMunicipal)
    setLayerVisibility(m, 'segments-unknown', !isMunicipal)
    setLayerVisibility(m, 'segments-dark', !isMunicipal)
    setLayerVisibility(m, 'segments-selected', !isMunicipal)
    setLayerVisibility(m, 'segments-hit', !isMunicipal)

    // Municipal layers
    setLayerVisibility(m, 'darkgaps-glow', isMunicipal)
    setLayerVisibility(m, 'darkgaps-line', isMunicipal)
    setLayerVisibility(m, 'darkgaps-selected', isMunicipal)
    setLayerVisibility(m, 'darkgaps-hit', isMunicipal)

    addMarkers(m)

    if (isMunicipal && darkGaps?.length) {
      // Fit to dark gaps bounds
      const bounds = new maplibregl.LngLatBounds()
      darkGaps.forEach(g => {
        if (g.center) bounds.extend(g.center)
      })
      if (!bounds.isEmpty()) {
        m.fitBounds(bounds, { padding: 80, duration: 800 })
      }
    } else if (!isMunicipal && data?.baseline_route?.nodes?.length) {
      const coords = [
        ...data.baseline_route.nodes,
        ...data.chiraag_route.nodes,
      ]
      const bounds = coords.reduce(
        (b, coord) => b.extend(coord),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      )
      m.fitBounds(bounds, { padding: 100, duration: 800 })
    }
  }, [viewMode])

  // Update selected segment highlight in both modes
  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return

    const segId = selectedSegment ?? -1

    if (m.getLayer('segments-selected')) {
      m.setFilter('segments-selected', ['==', ['get', 'road_id'], segId])
    }

    if (m.getLayer('darkgaps-selected')) {
      m.setFilter('darkgaps-selected', ['==', ['get', 'road_id'], segId])
    }
  }, [selectedSegment])

  // Handle flyTo when an item is selected from Municipal list
  useEffect(() => {
    const m = map.current
    if (!m || !flyToCoords) return

    m.flyTo({
      center: flyToCoords,
      zoom: 16.8,
      speed: 1.4,
      curve: 1.4,
      essential: true,
    })
  }, [flyToCoords])

  function switchStyle() {
    const m = map.current
    if (!m) return

    const nextSatellite = !satellite
    setSatellite(nextSatellite)

    m.once('style.load', () => {
      addChiraagLayers(m)
      addDarkGapsLayers(m)
      addMarkers(m)

      const isMunicipal = viewMode === 'municipal'
      setLayerVisibility(m, 'shortest-line', !isMunicipal)
      setLayerVisibility(m, 'safest-line', !isMunicipal)
      setLayerVisibility(m, 'segments-unknown', !isMunicipal)
      setLayerVisibility(m, 'segments-dark', !isMunicipal)
      setLayerVisibility(m, 'segments-selected', !isMunicipal)
      setLayerVisibility(m, 'segments-hit', !isMunicipal)

      setLayerVisibility(m, 'darkgaps-glow', isMunicipal)
      setLayerVisibility(m, 'darkgaps-line', isMunicipal)
      setLayerVisibility(m, 'darkgaps-selected', isMunicipal)
      setLayerVisibility(m, 'darkgaps-hit', isMunicipal)

      if (selectedSegment !== null && selectedSegment !== undefined) {
        if (m.getLayer('segments-selected')) {
          m.setFilter('segments-selected', ['==', ['get', 'road_id'], selectedSegment])
        }
        if (m.getLayer('darkgaps-selected')) {
          m.setFilter('darkgaps-selected', ['==', ['get', 'road_id'], selectedSegment])
        }
      }
    })

    m.setStyle(
      nextSatellite
        ? SATELLITE_STYLE
        : STREET_STYLE
    )
  }

  return (
    <div ref={container} className="map-canvas">
      {viewMode === 'router' ? (
        <div className="route-chip">
          <i className={selected === 'safe' ? 'gold' : 'grey'} />
          {selected === 'safe'
            ? 'Safer route selected'
            : 'Shortest route selected'}
        </div>
      ) : (
        <div className="route-chip municipal-chip">
          <i className="red-dot" />
          Municipal Gap View · 76 Priority Gaps (&gt;100m)
        </div>
      )}

      <div className="basemap-toggle">
        <button
          type="button"
          className={satellite ? '' : 'active'}
          onClick={() => {
            if (satellite) switchStyle()
          }}
        >
          Map
        </button>

        <button
          type="button"
          className={satellite ? 'active' : ''}
          onClick={() => {
            if (!satellite) switchStyle()
          }}
        >
          Satellite
        </button>
      </div>

      {viewMode === 'router' ? (
        <div className="map-legend">
          <span>
            <i className="legend-safe" /> Safer
          </span>
          <span>
            <i className="legend-short" /> Shortest
          </span>
          <span>
            <i className="legend-dark" /> Unlit stretch
          </span>
          <span>
            <i className="legend-unknown" /> Limited observation
          </span>
        </div>
      ) : (
        <div className="map-legend">
          <span>
            <i className="legend-critical-gap" /> Critical gap (&gt;100 m)
          </span>
          <span>
            <i className="legend-gap-line" /> Continuous dark stretch
          </span>
          <span>
            <i className="legend-selected-gap" /> Selected street
          </span>
        </div>
      )}

      <div className="map-attribution">
        © OpenStreetMap contributors &nbsp; | &nbsp; © MapTiler
      </div>
    </div>
  )
}
