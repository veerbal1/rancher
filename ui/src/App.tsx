import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useMap, type MapLayerMouseEvent } from '@vis.gl/react-maplibre'
import { Toaster } from '@/components/ui/sonner'
import { SatelliteMap } from './map/SatelliteMap'
import { CowsLayer } from './map/CowsLayer'
import { DrawPaddock } from './map/DrawPaddock'
import { DraftPaddockLayer } from './map/DraftPaddockLayer'
import { PaddocksLayer } from './map/PaddocksLayer'
import { PaddockLabelsLayer } from './map/PaddockLabelsLayer'
import { toLngLat, type LngLat } from './map/geo'
import { findOverlaps } from './map/overlap'
import { useCows } from './useCows'
import { useFarmers, type Location } from './useFarmers'
import { usePaddocks } from './usePaddocks'
import { MenuPanel } from './components/MenuPanel'
import { FarmersSection } from './components/FarmersSection'
import { SelectedFarmer } from './components/SelectedFarmer'
import { PaddocksSection } from './components/PaddocksSection'
import { PaddockDetail } from './components/PaddockDetail'

const INITIAL_BOUNDS: [LngLat, LngLat] = [toLngLat(-40, -40), toLngLat(140, 140)]

function App() {
  const { main: map } = useMap()
  const { cows, error: cowsError } = useCows('sim-1')
  const { farmers, error: farmersError, createFarmer } = useFarmers()
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null)
  const [drawingPaddock, setDrawingPaddock] = useState(false)
  const [draftRing, setDraftRing] = useState<LngLat[] | null>(null)
  const { paddocks, error: paddocksError, createPaddock, renamePaddock, deletePaddock } = usePaddocks(selectedFarmerId)
  const [selectedPaddockId, setSelectedPaddockId] = useState<string | null>(null)

  const selectedFarmer = farmers.find((f) => f.id === selectedFarmerId)
  const selectedPaddock = paddocks.find((p) => p.id === selectedPaddockId)
  const overlaps = useMemo(() => (draftRing ? findOverlaps(draftRing, paddocks) : []), [draftRing, paddocks])

  const error = cowsError || farmersError || paddocksError

  const getMapCenter = (): Location | null => {
    const center = map?.getCenter()
    return center ? { lng: Number(center.lng.toFixed(6)), lat: Number(center.lat.toFixed(6)) } : null
  }

  const selectFarmer = (id: string | null) => {
    const location = farmers.find((f) => f.id === id)?.location
    if (location) map?.flyTo({ center: [location.lng, location.lat], zoom: 16, duration: 1500 })
    setSelectedFarmerId(id)
    setSelectedPaddockId(null)
    setDraftRing(null)
    setDrawingPaddock(false)
  }

  const handleCreateFarmer = async (name: string, location: Location) => {
    const farmer = await createFarmer(name, location)
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

  const renameSelectedPaddock = async (name: string) => {
    if (!selectedPaddock) return
    const paddock = await renamePaddock(selectedPaddock.id, name)
    toast.success(`Renamed to ${paddock.name}`)
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
        <PaddockLabelsLayer selectedId={selectedPaddockId} />
        <DrawPaddock active={drawingPaddock} onFinish={handlePaddockDrawn} />
      </SatelliteMap>

      <MenuPanel>
        <FarmersSection
          farmers={farmers}
          selectedId={selectedFarmerId}
          onSelect={selectFarmer}
          getLocation={getMapCenter}
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
          overlaps={overlaps}
          onStartDrawing={startDrawingPaddock}
          onCancelDrawing={() => setDrawingPaddock(false)}
          onDiscardDraft={() => setDraftRing(null)}
          onSaveDraft={saveDraftPaddock}
        />
        {selectedPaddock && (
          <PaddockDetail
            key={selectedPaddock.id}
            paddock={selectedPaddock}
            onRename={renameSelectedPaddock}
            onDelete={deleteSelectedPaddock}
          />
        )}
      </MenuPanel>

      <Toaster theme="light" position="top-center" />
    </main>
  )
}

export default App
