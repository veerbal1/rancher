import { useState } from 'react'
import { SatelliteMap } from './map/SatelliteMap'
import { FenceLayer } from './map/FenceLayer'
import { CowsLayer } from './map/CowsLayer'
import { toLngLat, type LngLat } from './map/geo'
import { useCows } from './useCows'
import { MenuPanel } from './components/MenuPanel'
import { FarmersSection, type Farmer } from './components/FarmersSection'

const INITIAL_BOUNDS: [LngLat, LngLat] = [toLngLat(-40, -40), toLngLat(140, 140)]

function App() {
  const { cows, error } = useCows('sim-1')
  const [farmers, setFarmers] = useState<Farmer[]>([])

  const createFarmer = (name: string) => {
    setFarmers((prev) => [...prev, { id: crypto.randomUUID(), name }])
  }

  return (
    <main style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}>
      {error && (
        <p style={{ position: 'absolute', top: 12, left: 12, zIndex: 1, padding: '6px 10px', borderRadius: 6, background: '#fff', color: '#d64545' }}>
          {error}
        </p>
      )}

      <SatelliteMap initialBounds={INITIAL_BOUNDS}>
        <FenceLayer />
        <CowsLayer cows={cows} />
      </SatelliteMap>

      <MenuPanel>
        <FarmersSection farmers={farmers} onCreate={createFarmer} />
      </MenuPanel>
    </main>
  )
}

export default App
