import { SatelliteMap } from './map/SatelliteMap'
import { FenceLayer } from './map/FenceLayer'
import { CowsLayer } from './map/CowsLayer'
import { toLngLat, type LngLat } from './map/geo'
import { useCows } from './useCows'

// Start zoomed on the fence, with 40 m of margin so escaped cows stay in view.
const INITIAL_BOUNDS: [LngLat, LngLat] = [toLngLat(-40, -40), toLngLat(140, 140)]

function App() {
  const { cows, error } = useCows('sim-1')

  return (
    <main style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}>
      {error && (
        // overlay, so an error doesn't push the map down
        <p style={{ position: 'absolute', top: 12, left: 12, zIndex: 1, padding: '6px 10px', borderRadius: 6, background: '#fff', color: '#d64545' }}>
          {error}
        </p>
      )}

      <SatelliteMap initialBounds={INITIAL_BOUNDS}>
        <FenceLayer />
        <CowsLayer cows={cows} />
      </SatelliteMap>
    </main>
  )
}

export default App
