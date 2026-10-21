# Offline map archive

Place the ward basemap archive at `public/ward.pmtiles` and set
`VITE_USE_LOCAL_PMTILES=true` in `.env.local` when deploying with a local
archive. The app otherwise uses its included neutral cartographic fallback, so
the route demo remains entirely functional without a tile archive or network.
