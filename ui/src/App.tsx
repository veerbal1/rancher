import { useState } from 'react'
import { SatelliteMap } from './map/SatelliteMap'
import { FenceLayer } from './map/FenceLayer'
import { CowsLayer } from './map/CowsLayer'
import { toLngLat, type LngLat } from './map/geo'
import { useCows } from './useCows'
import { useFarmers } from './useFarmers'
import { MenuPanel } from './components/MenuPanel'
import { FarmersSection } from './components/FarmersSection'
import { SelectedFarmer } from './components/SelectedFarmer'

const INITIAL_BOUNDS: [LngLat, LngLat] = [toLngLat(-40, -40), toLngLat(140, 140)]

function App() {
  const { cows, error: cowsError } = useCows('sim-1')
  const { farmers, error: farmersError, createFarmer } = useFarmers()
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null)

  const selectedFarmer = farmers.find((f) => f.id === selectedFarmerId)

  const error = cowsError || farmersError

  const handleCreateFarmer = async (name: string) => {
    const farmer = await createFarmer(name)
    setSelectedFarmerId(farmer.id)
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
        <FarmersSection
          farmers={farmers}
          selectedId={selectedFarmerId}
          onSelect={setSelectedFarmerId}
          onCreate={handleCreateFarmer}
        />
        {selectedFarmer && <SelectedFarmer farmer={selectedFarmer} />}
      </MenuPanel>
    </main>
  )
}

export default App
