import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { MapLayerMouseEvent } from '@vis.gl/react-maplibre'
import { Toaster } from '@/components/ui/sonner'
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
import { PaddockDetail } from './components/PaddockDetail'

const INITIAL_BOUNDS: [LngLat, LngLat] = [toLngLat(-40, -40), toLngLat(140, 140)]

function App() {
  const { cows, error: cowsError } = useCows('sim-1')
  const { farmers, error: farmersError, createFarmer } = useFarmers()
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null)
  const [drawingPaddock, setDrawingPaddock] = useState(false)
  const [draftRing, setDraftRing] = useState<LngLat[] | null>(null)
  const { paddocks, error: paddocksError, createPaddock, deletePaddock } = usePaddocks(selectedFarmerId)
  const [selectedPaddockId, setSelectedPaddockId] = useState<string | null>(null)

  const selectedFarmer = farmers.find((f) => f.id === selectedFarmerId)
  const selectedPaddock = paddocks.find((p) => p.id === selectedPaddockId)

  const error = cowsError || farmersError || paddocksError

  const selectFarmer = (id: string | null) => {
    setSelectedFarmerId(id)
    setSelectedPaddockId(null)
    setDraftRing(null)
    setDrawingPaddock(false)
  }

  const handleCreateFarmer = async (name: string) => {
    const farmer = await createFarmer(name)
    selectFarmer(farmer.id)
    toast.success(`Farmer ${farmer.name} created`)
  }

  const handlePaddockDrawn = useCallback((ring: LngLat[]) => {
    setDraftRing(ring)
    setDrawingPaddock(false)
  }, [])

  const startDrawingPaddock = () => {
    setSelectedPaddockId(null)
    setDraftRing(null)
    setDrawingPaddock(true)
  }

  const saveDraftPaddock = async () => {
    if (!draftRing) return
    const paddock = await createPaddock(draftRing)
    setDraftRing(null)
    toast.success(`${paddock.name} saved`, { description: `${paddock.area_ha} ha` })
  }

  const deleteSelectedPaddock = async () => {
    if (!selectedPaddock) return
    await deletePaddock(selectedPaddock.id)
    setSelectedPaddockId(null)
    toast.success(`${selectedPaddock.name} deleted`)
  }

  const handleMapClick = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id
    setSelectedPaddockId(typeof id === 'string' ? id : null)
  }

  return (
    <main style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}>
      {error && (
        <p style={{ position: 'absolute', top: 12, left: 12, zIndex: 1, padding: '6px 10px', borderRadius: 6, background: '#fff', color: '#d64545' }}>
          {error}
        </p>
      )}

      <SatelliteMap
        initialBounds={INITIAL_BOUNDS}
        interactiveLayerIds={drawingPaddock ? [] : ['paddocks-fill']}
        onClick={drawingPaddock ? undefined : handleMapClick}
      >
        <PaddocksLayer paddocks={paddocks} selectedId={selectedPaddockId} />
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
          selectedId={selectedPaddockId}
          onSelect={setSelectedPaddockId}
          canAdd={!!selectedFarmer}
          drawing={drawingPaddock}
          hasDraft={!!draftRing}
          onStartDrawing={startDrawingPaddock}
          onCancelDrawing={() => setDrawingPaddock(false)}
          onDiscardDraft={() => setDraftRing(null)}
          onSaveDraft={saveDraftPaddock}
        />
        {selectedPaddock && <PaddockDetail paddock={selectedPaddock} onDelete={deleteSelectedPaddock} />}
      </MenuPanel>

      <Toaster theme="light" position="top-center" />
    </main>
  )
}

export default App
