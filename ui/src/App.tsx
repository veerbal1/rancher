import { useCallback, useState } from 'react'
import { SatelliteMap } from './map/SatelliteMap'
import { CowsLayer } from './map/CowsLayer'
import { DrawPaddock } from './map/DrawPaddock'
import { DraftPaddockLayer } from './map/DraftPaddockLayer'
import { PaddocksLayer } from './map/PaddocksLayer'
import { toLngLat, type LngLat } from './map/geo'
import { useCows } from './useCows'
import { useFarmers } from './useFarmers'
import { usePaddocks } from './usePaddocks'
import { MenuPanel } from './components/MenuPanel'
import { FarmersSection } from './components/FarmersSection'
import { SelectedFarmer } from './components/SelectedFarmer'
import { PaddocksSection } from './components/PaddocksSection'

const INITIAL_BOUNDS: [LngLat, LngLat] = [toLngLat(-40, -40), toLngLat(140, 140)]

function App() {
  const { cows, error: cowsError } = useCows('sim-1')
  const { farmers, error: farmersError, createFarmer } = useFarmers()
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null)
  const [drawingPaddock, setDrawingPaddock] = useState(false)
  const [draftRing, setDraftRing] = useState<LngLat[] | null>(null)
  const { paddocks, error: paddocksError, createPaddock } = usePaddocks(selectedFarmerId)

  const selectedFarmer = farmers.find((f) => f.id === selectedFarmerId)

  const error = cowsError || farmersError || paddocksError

  const selectFarmer = (id: string | null) => {
    setSelectedFarmerId(id)
    setDraftRing(null)
    setDrawingPaddock(false)
  }

  const handleCreateFarmer = async (name: string) => {
    const farmer = await createFarmer(name)
    selectFarmer(farmer.id)
  }

  const handlePaddockDrawn = useCallback((ring: LngLat[]) => {
    setDraftRing(ring)
    setDrawingPaddock(false)
  }, [])

  const startDrawingPaddock = () => {
    setDraftRing(null)
    setDrawingPaddock(true)
  }

  const saveDraftPaddock = async () => {
    if (!draftRing) return
    await createPaddock(draftRing)
    setDraftRing(null)
  }

  return (
    <main style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}>
      {error && (
        <p style={{ position: 'absolute', top: 12, left: 12, zIndex: 1, padding: '6px 10px', borderRadius: 6, background: '#fff', color: '#d64545' }}>
          {error}
        </p>
      )}

      <SatelliteMap initialBounds={INITIAL_BOUNDS}>
        <PaddocksLayer paddocks={paddocks} />
        {draftRing && <DraftPaddockLayer ring={draftRing} />}
        <CowsLayer cows={cows} />
        <DrawPaddock active={drawingPaddock} onFinish={handlePaddockDrawn} />
      </SatelliteMap>

      <MenuPanel>
        <FarmersSection
          farmers={farmers}
          selectedId={selectedFarmerId}
          onSelect={selectFarmer}
          onCreate={handleCreateFarmer}
        />
        {selectedFarmer && <SelectedFarmer farmer={selectedFarmer} />}
        <PaddocksSection
          paddocks={paddocks}
          canAdd={!!selectedFarmer}
          drawing={drawingPaddock}
          hasDraft={!!draftRing}
          onStartDrawing={startDrawingPaddock}
          onCancelDrawing={() => setDrawingPaddock(false)}
          onDiscardDraft={() => setDraftRing(null)}
          onSaveDraft={saveDraftPaddock}
        />
      </MenuPanel>
    </main>
  )
}

export default App
