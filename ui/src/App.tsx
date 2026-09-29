import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useMap, type MapLayerMouseEvent } from '@vis.gl/react-maplibre'
import { Toaster } from '@/components/ui/sonner'
import { SatelliteMap } from './map/SatelliteMap'
import { CowsLayer } from './map/CowsLayer'
import { ShiftLayer } from './map/ShiftLayer'
import { DrawPaddock } from './map/DrawPaddock'
import { DraftPaddockLayer } from './map/DraftPaddockLayer'
import { PaddocksLayer } from './map/PaddocksLayer'
import { PaddockLabelsLayer } from './map/PaddockLabelsLayer'
import { toLngLat, type LngLat } from './map/geo'
import { findOverlaps } from './map/overlap'
import { useCows } from './useCows'
import { useFarmers, type Location } from './useFarmers'
import { usePaddocks } from './usePaddocks'
import { useCollars, type Collar } from './useCollars'
import { useShifts } from './useShifts'
import { useCueSound } from './useCueSound'
import { MenuPanel } from './components/MenuPanel'
import { FarmersSection } from './components/FarmersSection'
import { SelectedFarmer } from './components/SelectedFarmer'
import { PaddocksSection } from './components/PaddocksSection'
import { PaddockDetail } from './components/PaddockDetail'
import { CollarsSection } from './components/CollarsSection'
import { SoundToggle } from './components/SoundToggle'

const INITIAL_BOUNDS: [LngLat, LngLat] = [toLngLat(-40, -40), toLngLat(140, 140)]

function App() {
  const { main: map } = useMap()
  const { farmers, error: farmersError, createFarmer } = useFarmers()
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null)
  const { cows, error: cowsError } = useCows(selectedFarmerId)
  const [drawingPaddock, setDrawingPaddock] = useState(false)
  const [draftRing, setDraftRing] = useState<LngLat[] | null>(null)
  const { paddocks, error: paddocksError, createPaddock, renamePaddock, deletePaddock } = usePaddocks(selectedFarmerId)
  const [selectedPaddockId, setSelectedPaddockId] = useState<string | null>(null)
  const { collars, error: collarsError, buyCollars, assignCollars, deleteCollar, moveLocally, forgetPaddock } = useCollars(selectedFarmerId)
  const { shifts, error: shiftsError, startShift } = useShifts(selectedFarmerId)
  const [soundOn, setSoundOn] = useState(false)
  useCueSound(cows, soundOn)

  const selectedFarmer = farmers.find((f) => f.id === selectedFarmerId)
  const selectedPaddock = paddocks.find((p) => p.id === selectedPaddockId)
  const overlaps = useMemo(() => (draftRing ? findOverlaps(draftRing, paddocks) : []), [draftRing, paddocks])

  const error = cowsError || farmersError || paddocksError || collarsError || shiftsError

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
    forgetPaddock(selectedPaddock.id)
    setSelectedPaddockId(null)
    toast.success(`${selectedPaddock.name} deleted`)
  }

  const saveCollarAssignment = async (add: string[], remove: string[]) => {
    if (!selectedPaddock) return
    if (add.length > 0) await assignCollars(add, selectedPaddock.id)
    if (remove.length > 0) await assignCollars(remove, null)
    toast.success(`${selectedPaddock.name} updated`, { description: `${add.length} added · ${remove.length} removed` })
  }

  const moveHerd = async (toPaddockId: string) => {
    if (!selectedPaddock) return
    const shift = await startShift(selectedPaddock.id, toPaddockId)
    moveLocally(shift.collar_ids, toPaddockId)
    const to = paddocks.find((p) => p.id === toPaddockId)
    const n = shift.collar_ids.length
    toast.success(`Moving ${n} cow${n === 1 ? '' : 's'} to ${to?.name ?? 'the new paddock'}`, { description: 'Starts in 10 seconds' })
  }

  const addCollars = async (count: number) => {
    const added = await buyCollars(count)
    const range = added.length === 1 ? added[0].name : `${added[0].name}–#${added[added.length - 1].number}`
    toast.success(`Added ${added.length} collar${added.length === 1 ? '' : 's'}`, { description: range })
  }

  const removeCollar = async (collar: Collar) => {
    await deleteCollar(collar.id)
    toast.success(`${collar.name} deleted`)
  }

  const handleMapClick = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id
    setSelectedPaddockId(typeof id === 'string' ? id : null)
  }

  return (
    <main style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}>
      {error && (
        <p style={{ position: 'absolute', top: 16, left: 80, zIndex: 1, padding: '6px 10px', borderRadius: 6, background: '#fff', color: '#d64545' }}>
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
        <ShiftLayer shifts={shifts} paddocks={paddocks} />
        <PaddockLabelsLayer selectedId={selectedPaddockId} />
        <DrawPaddock active={drawingPaddock} onFinish={handlePaddockDrawn} />
      </SatelliteMap>

      <img src="/logo-96.png" alt="Rancher" className="fixed top-4 left-4 z-10 size-12 rounded-2xl shadow-lg" />
      <SoundToggle on={soundOn} onChange={setSoundOn} />

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
            collars={collars}
            paddocks={paddocks}
            onRename={renameSelectedPaddock}
            onDelete={deleteSelectedPaddock}
            onAssignCollars={saveCollarAssignment}
            onMoveHerd={moveHerd}
          />
        )}
        <CollarsSection collars={collars} paddocks={paddocks} canAdd={!!selectedFarmer} onAdd={addCollars} onDelete={removeCollar} />
      </MenuPanel>

      <Toaster theme="light" position="top-center" />
    </main>
  )
}

export default App
