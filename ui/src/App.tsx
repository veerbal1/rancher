import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useMap, type MapLayerMouseEvent } from '@vis.gl/react-maplibre'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { SatelliteMap } from './map/SatelliteMap'
import { CowsLayer } from './map/CowsLayer'
import { LanesLayer } from './map/LanesLayer'
import { ShiftLayer } from './map/ShiftLayer'
import { DrawPaddock } from './map/DrawPaddock'
import { DraftPaddockLayer } from './map/DraftPaddockLayer'
import { DrawPath } from './map/DrawPath'
import { EditPaddock } from './map/EditPaddock'
import { PaddocksLayer } from './map/PaddocksLayer'
import { PaddockLabelsLayer } from './map/PaddockLabelsLayer'
import { toLngLat, type LngLat } from './map/geo'
import { findOverlaps } from './map/overlap'
import { useCows } from './useCows'
import { useFarmers, type Location } from './useFarmers'
import { KINDS, usePaddocks, type PaddockKind } from './usePaddocks'
import { useCollars, type Collar } from './useCollars'
import { useActiveShifts, useShifts, type Shift } from './useShifts'
import { useLanes } from './useLanes'
import { useMilking } from './useMilking'
import { useCueSound } from './useCueSound'
import { useFarmSounds } from './useFarmSounds'
import { MenuPanel } from './components/MenuPanel'
import { FarmersSection } from './components/FarmersSection'
import { SelectedFarmer } from './components/SelectedFarmer'
import { PaddocksSection } from './components/PaddocksSection'
import { PaddockDetail } from './components/PaddockDetail'
import { CollarsSection } from './components/CollarsSection'
import { SoundToggle } from './components/SoundToggle'
import { LiveBadge } from './components/LiveBadge'
import { ShiftBanner } from './components/ShiftBanner'
import { CowPanel } from './components/CowPanel'
import { MilkingPanel } from './components/MilkingPanel'

const INITIAL_BOUNDS: [LngLat, LngLat] = [toLngLat(-40, -40), toLngLat(140, 140)]

function App() {
  const { main: map } = useMap()
  const { farmers, error: farmersError, createFarmer } = useFarmers()
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null)
  const { cows, error: cowsError, live } = useCows(selectedFarmerId)
  const [drawingPaddock, setDrawingPaddock] = useState(false)
  const [draftRing, setDraftRing] = useState<LngLat[] | null>(null)
  const { paddocks, error: paddocksError, createPaddock, updatePaddock, deletePaddock } = usePaddocks(selectedFarmerId)
  const [selectedPaddockId, setSelectedPaddockId] = useState<string | null>(null)
  const [selectedCollarId, setSelectedCollarId] = useState<string | null>(null)
  const { collars, error: collarsError, buyCollars, assignCollars, deleteCollars, moveLocally, forgetPaddock } = useCollars(selectedFarmerId)
  const { shifts, error: shiftsError, startShift, turnBack } = useShifts(selectedFarmerId)
  const { lanes, error: lanesError, saveLane } = useLanes(selectedFarmerId)
  const { sessions, error: milkingError, startMilking, stopMilking } = useMilking(selectedFarmerId)
  const activeShifts = useActiveShifts(shifts, cows)
  const [soundOn, setSoundOn] = useState(false)
  const [pathDraft, setPathDraft] = useState<{ fromId: string; toId: string; collarIds?: string[]; lane?: boolean } | null>(null)
  const [reshape, setReshape] = useState<{ id: string; ring: LngLat[] } | null>(null)
  const [savingShape, setSavingShape] = useState(false)
  useCueSound(cows, soundOn)
  useFarmSounds(map, cows, soundOn)

  const selectedFarmer = farmers.find((f) => f.id === selectedFarmerId)
  const selectedPaddock = paddocks.find((p) => p.id === selectedPaddockId)
  const selectedCollar = collars.find((c) => c.id === selectedCollarId)
  const closeCowPanel = useCallback(() => setSelectedCollarId(null), [])
  const overlaps = useMemo(() => (draftRing ? findOverlaps(draftRing, paddocks) : []), [draftRing, paddocks])
  const reshapeOverlaps = useMemo(
    () => (reshape ? findOverlaps(reshape.ring, paddocks.filter((p) => p.id !== reshape.id)) : []),
    [reshape, paddocks],
  )
  const reshaping = paddocks.find((p) => p.id === reshape?.id)
  const busyOnMap = drawingPaddock || !!pathDraft || !!reshape

  const error = cowsError || farmersError || paddocksError || collarsError || shiftsError || lanesError || milkingError
  const shedSession = sessions.find((s) => s.status === 'running' && s.shed_id === selectedPaddock?.id)
  const liveLanes = useMemo(
    () => lanes.filter((l) => paddocks.some((p) => p.id === l.from_paddock_id) && paddocks.some((p) => p.id === l.to_paddock_id)),
    [lanes, paddocks],
  )

  const getMapCenter = (): Location | null => {
    const center = map?.getCenter()
    return center ? { lng: Number(center.lng.toFixed(6)), lat: Number(center.lat.toFixed(6)) } : null
  }

  const selectFarmer = (id: string | null) => {
    const location = farmers.find((f) => f.id === id)?.location
    if (location) map?.flyTo({ center: [location.lng, location.lat], zoom: 16, duration: 1500 })
    setSelectedFarmerId(id)
    setSelectedPaddockId(null)
    setSelectedCollarId(null)
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
    const paddock = await updatePaddock(selectedPaddock.id, { name })
    toast.success(`Renamed to ${paddock.name}`)
  }

  const changeSelectedPaddockKind = async (kind: PaddockKind) => {
    if (!selectedPaddock) return
    try {
      const paddock = await updatePaddock(selectedPaddock.id, { kind })
      toast.success(`${paddock.name} is now a ${KINDS.find((k) => k.value === kind)?.label.toLowerCase()}`)
    } catch (err) {
      toast.error('Could not change the kind', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const startReshape = () => {
    if (!selectedPaddock) return
    setDrawingPaddock(false)
    setDraftRing(null)
    setPathDraft(null)
    const ring = selectedPaddock.polygon.coordinates[0]
    setReshape({ id: selectedPaddock.id, ring })
    const lngs = ring.map(([lng]) => lng)
    const lats = ring.map(([, lat]) => lat)
    map?.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 110, bottom: 60, left: 100, right: 440 }, duration: 800 },
    )
  }

  const handleReshape = useCallback((ring: LngLat[]) => {
    setReshape((prev) => (prev ? { ...prev, ring } : prev))
  }, [])

  const saveReshape = async () => {
    if (!reshape) return
    setSavingShape(true)
    try {
      const paddock = await updatePaddock(reshape.id, { ring: reshape.ring })
      setReshape(null)
      toast.success(`${paddock.name} boundary saved`, { description: `${paddock.area_ha} ha` })
    } catch (err) {
      toast.error('Could not save the boundary', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setSavingShape(false)
    }
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

  const paddockName = (id: string) => paddocks.find((p) => p.id === id)?.name ?? 'the paddock'

  const sendMove = async (fromId: string, toId: string, path: LngLat[], collarIds?: string[]) => {
    try {
      const shift = await startShift(fromId, toId, path, collarIds)
      moveLocally(shift.collar_ids, toId)
      const n = shift.collar_ids.length
      toast.success(`Moving ${n} cow${n === 1 ? '' : 's'} to ${paddockName(toId)}`, { description: 'Starts in 10 seconds' })
    } catch (err) {
      toast.error('Could not start the move', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const beginMove = (fromId: string, toId: string, useSavedLane: boolean, collarIds?: string[]) => {
    setDrawingPaddock(false)
    setDraftRing(null)
    if (useSavedLane) {
      void sendMove(fromId, toId, [], collarIds)
      return
    }
    setPathDraft({ fromId, toId, collarIds })
  }

  const startDrawingPath = (toPaddockId: string, useSavedLane: boolean) => {
    if (!selectedPaddock) return
    beginMove(selectedPaddock.id, toPaddockId, useSavedLane)
  }

  const startMovingCow = (toPaddockId: string, useSavedLane: boolean) => {
    if (!selectedCollar?.paddock_id) return
    beginMove(selectedCollar.paddock_id, toPaddockId, useSavedLane, [selectedCollar.id])
  }

  const startDrawingLane = (toPaddockId: string) => {
    if (!selectedPaddock) return
    setDrawingPaddock(false)
    setDraftRing(null)
    setPathDraft({ fromId: selectedPaddock.id, toId: toPaddockId, lane: true })
  }

  const handlePathDrawn = async (path: LngLat[]) => {
    if (!pathDraft) return
    setPathDraft(null)
    if (!pathDraft.lane) {
      await sendMove(pathDraft.fromId, pathDraft.toId, path, pathDraft.collarIds)
      return
    }
    try {
      await saveLane(pathDraft.fromId, pathDraft.toId, path)
      toast.success(`Lane saved: ${paddockName(pathDraft.fromId)} to ${paddockName(pathDraft.toId)}`)
    } catch (err) {
      toast.error('Could not save the lane', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const startMilkingInShed = async (fromId: string, toId: string) => {
    if (!selectedPaddock) return false
    try {
      const session = await startMilking(fromId, selectedPaddock.id, toId)
      toast.success(`Milking started in ${selectedPaddock.name}`, {
        description: `${session.cows.length} cows waiting in ${paddockName(fromId)}`,
      })
      return true
    } catch (err) {
      toast.error('Could not start milking', { description: err instanceof Error ? err.message : String(err) })
      return false
    }
  }

  const stopMilkingInShed = async () => {
    if (!shedSession) return
    try {
      await stopMilking(shedSession.id)
      toast.success('Milking stopped', { description: 'Cows already walking finish their walk' })
    } catch (err) {
      toast.error('Could not stop milking', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const changeShedCapacity = async (capacity: number) => {
    if (!selectedPaddock) return
    try {
      await updatePaddock(selectedPaddock.id, { capacity })
      toast.success(`${selectedPaddock.name} holds ${capacity} cows at a time`)
    } catch (err) {
      toast.error('Could not change the capacity', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const turnBackShift = async (shift: Shift) => {
    try {
      const back = await turnBack(shift)
      moveLocally(shift.collar_ids, shift.from_paddock_id)
      toast.success(back ? `Turning back to ${paddockName(shift.from_paddock_id)}` : 'Move cancelled', {
        description: back ? 'The cows walk back along the same lane' : 'The cows had not left yet',
      })
    } catch (err) {
      toast.error('Could not turn back', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const addCollars = async (count: number) => {
    const added = await buyCollars(count)
    const range = added.length === 1 ? added[0].name : `${added[0].name}–#${added[added.length - 1].number}`
    toast.success(`Added ${added.length} collar${added.length === 1 ? '' : 's'}`, { description: range })
  }

  const collarsLabel = (list: Collar[]) => (list.length === 1 ? list[0].name : `${list.length} collars`)

  const removeCollars = async (list: Collar[]) => {
    await deleteCollars(list.map((c) => c.id))
    toast.success(`${collarsLabel(list)} deleted`)
  }

  const unassignCollars = async (list: Collar[]) => {
    await assignCollars(list.map((c) => c.id), null)
    toast.success(`${collarsLabel(list)} unassigned`)
  }

  const handleMapClick = (e: MapLayerMouseEvent) => {
    const cow = e.features?.find((f) => f.source === 'cows')
    if (cow) {
      setSelectedCollarId(cow.properties.collar_id)
      return
    }
    const id = e.features?.[0]?.properties?.id
    setSelectedPaddockId(typeof id === 'string' ? id : null)
    setSelectedCollarId(null)
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
        interactiveLayerIds={busyOnMap ? [] : ['cow-icons', 'cow-rings', 'paddocks-fill', 'sheds-fill']}
        onClick={busyOnMap ? undefined : handleMapClick}
      >
        <PaddocksLayer paddocks={reshape ? paddocks.filter((p) => p.id !== reshape.id) : paddocks} selectedId={selectedPaddockId} />
        {draftRing && <DraftPaddockLayer ring={draftRing} />}
        <LanesLayer lanes={liveLanes} />
        <CowsLayer cows={cows} selectedId={selectedCollarId} />
        <ShiftLayer shifts={activeShifts} />
        <PaddockLabelsLayer selectedId={selectedPaddockId} />
        <DrawPaddock active={drawingPaddock} onFinish={handlePaddockDrawn} />
        <DrawPath active={!!pathDraft} onFinish={handlePathDrawn} />
        {reshaping && <EditPaddock key={reshaping.id} initialRing={reshaping.polygon.coordinates[0]} onChange={handleReshape} />}
      </SatelliteMap>

      <img src="/logo-96.png" alt="Rancher" className="fixed top-4 left-4 z-10 size-12 rounded-2xl shadow-lg" />
      <SoundToggle on={soundOn} onChange={setSoundOn} />
      {selectedFarmerId && <LiveBadge live={live} />}

      {!pathDraft && !reshape && activeShifts[0] && (
        <ShiftBanner shift={activeShifts[0]} paddocks={paddocks} onTurnBack={turnBackShift} />
      )}

      {reshape && reshaping && (
        <div className="fixed top-4 right-[26rem] left-20 z-10 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/85 px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl">
          <div className="min-w-0 flex-1">
            <p>
              Reshaping {reshaping.name}: drag corners, drag a midpoint to add a corner, right-click a corner to remove it.
            </p>
            {reshapeOverlaps.length > 0 && (
              <p className="text-amber-800">Overlaps {reshapeOverlaps.map((o) => o.name).join(', ')}.</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="cursor-pointer" disabled={savingShape} onClick={() => setReshape(null)}>
            Cancel
          </Button>
          <Button size="sm" className="cursor-pointer" disabled={savingShape} onClick={saveReshape}>
            {savingShape ? 'Saving…' : reshapeOverlaps.length > 0 ? 'Save anyway' : 'Save'}
          </Button>
        </div>
      )}

      {pathDraft && (
        <div className="fixed top-4 right-[26rem] left-20 z-10 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/85 px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl">
          <p>
            Draw the lane: click inside {paddockName(pathDraft.fromId)}, along the lane, and finish inside{' '}
            {paddockName(pathDraft.toId)} by clicking the last point again or pressing Enter.
            {pathDraft.lane && ' No cows move.'}
          </p>
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setPathDraft(null)}>
            Cancel
          </Button>
        </div>
      )}

      {selectedCollar && !busyOnMap && (
        <CowPanel
          collar={selectedCollar}
          cow={cows.find((c) => c.collar_id === selectedCollar.id)}
          paddock={paddocks.find((p) => p.id === selectedCollar.paddock_id)}
          paddocks={paddocks}
          lanes={liveLanes}
          onMove={startMovingCow}
          onClose={closeCowPanel}
        />
      )}

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
            cows={cows}
            paddocks={paddocks}
            lanes={liveLanes}
            onRename={renameSelectedPaddock}
            onChangeKind={changeSelectedPaddockKind}
            onEditBoundary={startReshape}
            onDelete={deleteSelectedPaddock}
            onAssignCollars={saveCollarAssignment}
            onMoveHerd={startDrawingPath}
            onDrawLane={startDrawingLane}
          />
        )}
        {selectedPaddock?.kind === 'milking_shed' && (
          <MilkingPanel
            key={selectedPaddock.id}
            shed={selectedPaddock}
            paddocks={paddocks}
            session={shedSession}
            onStart={startMilkingInShed}
            onStop={stopMilkingInShed}
            onChangeCapacity={changeShedCapacity}
          />
        )}
        <CollarsSection collars={collars} cows={cows} paddocks={paddocks} canAdd={!!selectedFarmer} onAdd={addCollars} onDelete={removeCollars} onUnassign={unassignCollars} selectedId={selectedCollarId} onSelect={setSelectedCollarId} />
      </MenuPanel>

      <Toaster theme="light" position="top-center" />
    </main>
  )
}

export default App
