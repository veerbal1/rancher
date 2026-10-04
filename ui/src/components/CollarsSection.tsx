import { useState } from 'react'
import { BatteryFull, BatteryLow, BatteryMedium, CircleAlert, Clock, Footprints, Milk, Siren, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Collar } from '@/useCollars'
import type { Cow } from '@/useCows'
import type { Paddock } from '@/usePaddocks'
import type { MilkingSession, SessionCow } from '@/useMilking'
import { AddCollarsDialog } from './AddCollarsDialog'

type CardStatus = { label: string; color: string; border: string; Icon: LucideIcon }

const STATUS: Record<string, CardStatus> = {
  moving: { label: 'Moving', color: 'bg-blue-500', border: 'border-blue-500', Icon: Footprints },
  warning: { label: 'Near fence', color: 'bg-amber-500', border: 'border-amber-400', Icon: TriangleAlert },
  breached: { label: 'Outside fence', color: 'bg-red-500', border: 'border-red-500', Icon: Siren },
}

const MILKING: Partial<Record<SessionCow['status'], CardStatus>> = {
  waiting: { label: 'Waiting to milk', color: 'bg-zinc-500', border: 'border-transparent', Icon: Clock },
  called: { label: 'Walking to shed', color: 'bg-blue-500', border: 'border-blue-500', Icon: Footprints },
  milking: { label: 'Milking', color: 'bg-teal-600', border: 'border-teal-500', Icon: Milk },
  missed: { label: 'Missed milking', color: 'bg-amber-600', border: 'border-amber-400', Icon: CircleAlert },
}

function timeLeft(from: string | undefined, secs: number) {
  const left = from ? Math.max(0, Math.ceil((secs * 1000 - (Date.now() - Date.parse(from))) / 1000)) : secs
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

function cardStatus(cow: Cow | undefined, milkingCow: SessionCow | undefined, milkingSecs: number): CardStatus | undefined {
  if (cow?.state === 'warning' || cow?.state === 'breached') return STATUS[cow.state]
  if (milkingCow) {
    const milk = MILKING[milkingCow.status]
    if (milk) return milkingCow.status === 'milking' ? { ...milk, label: `Milking ${timeLeft(milkingCow.milking_from, milkingSecs)}` } : milk
  }
  return cow && STATUS[cow.state]
}

type Props = {
  collars: Collar[]
  cows: Cow[]
  paddocks: Paddock[]
  canAdd: boolean
  onAdd: (count: number) => Promise<void>
  onDelete: (collars: Collar[]) => Promise<void>
  onUnassign: (collars: Collar[]) => Promise<void>
  selectedId: string | null
  onSelect: (id: string) => void
  milking?: MilkingSession
}

export function CollarsSection({ collars, cows, paddocks, canAdd, onAdd, onDelete, onUnassign, selectedId, onSelect, milking }: Props) {
  const paddockName = (id: string | null) => paddocks.find((p) => p.id === id)?.name
  const cowOf = (c: Collar) => cows.find((w) => w.collar_id === c.id)
  const syncing = (c: Collar) => {
    const cow = cowOf(c)
    const paddock = paddocks.find((p) => p.id === c.paddock_id)
    return !!cow && !!paddock && cow.state !== 'moving' && (cow.fence_version ?? 0) < (paddock.fence_version ?? 0)
  }
  const unassigned = collars.filter((c) => !c.paddock_id).length

  const [pending, setPending] = useState<Collar[]>([])
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [unassigning, setUnassigning] = useState(false)

  const chosen = collars.filter((c) => selected.has(c.id))
  const chosenAssigned = chosen.filter((c) => c.paddock_id)
  const pendingAssigned = pending.filter((c) => c.paddock_id)
  const pendingLabel = pending.length === 1 ? pending[0].name : `${pending.length} collars`

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const stopSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const askDelete = (list: Collar[]) => {
    setPending(list)
    setDeleteError('')
    setOpen(true)
  }

  const unassignChosen = async () => {
    setUnassigning(true)
    try {
      await onUnassign(chosenAssigned)
      stopSelecting()
    } catch (err) {
      toast.error('Could not unassign', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setUnassigning(false)
    }
  }

  const confirmDelete = async () => {
    if (pending.length === 0) return
    setDeleting(true)
    setDeleteError('')
    try {
      await onDelete(pending)
      setOpen(false)
      stopSelecting()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Collars</h2>
        <div className="flex items-center gap-1.5">
          {collars.length > 0 && (
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? 'Done' : 'Select'}
            </Button>
          )}
          {!selecting && <AddCollarsDialog disabled={!canAdd} onAdd={onAdd} />}
        </div>
      </div>

      {canAdd && collars.length === 0 && <p className="text-sm text-muted-foreground">No collars yet.</p>}
      {collars.length > 0 && !selecting && (
        <p className="text-sm text-muted-foreground">
          {collars.length} collar{collars.length === 1 ? '' : 's'} · {unassigned} unassigned
        </p>
      )}
      {selecting && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>{chosen.length} selected</p>
          <Button
            variant="link"
            size="xs"
            className="cursor-pointer"
            onClick={() => setSelected(chosen.length === collars.length ? new Set() : new Set(collars.map((c) => c.id)))}
          >
            {chosen.length === collars.length ? 'Clear' : 'Select all'}
          </Button>
        </div>
      )}

      {collars.length > 0 && (
        <ul className="grid grid-cols-2 gap-1.5">
          {collars.map((c) => {
            const cow = cowOf(c)
            const status = cardStatus(cow, milking?.cows.find((m) => m.collar_id === c.id), milking?.milking_secs ?? 0)
            return (
              <li
                key={c.id}
                onClick={() => (selecting ? toggle(c.id) : onSelect(c.id))}
                className={`group relative cursor-pointer overflow-hidden rounded-xl border-2 text-sm select-none ${status ? status.border : 'border-transparent'} ${(selecting ? selected.has(c.id) : selectedId === c.id) ? 'bg-white ring-2 ring-primary/60' : 'bg-white/60'}`}
              >
                <div className="relative">
                  <img src="/cow-collar.webp" alt="" className="aspect-[4/3] w-full bg-white object-contain p-1" />
                  {status && (
                    <span
                      title={cow?.level === 'none' ? status.label : `${status.label} · ${cow?.level} cue`}
                      className={`absolute bottom-1 left-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white ${status.color} ${cow?.level === 'none' ? '' : 'animate-pulse'}`}
                    >
                      <status.Icon className="size-3" />
                      {status.label}
                    </span>
                  )}
                </div>
                {c.paddock_id ? (
                  <span className="absolute top-2 left-2 flex size-2.5" title="Live">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full border border-white bg-emerald-500" />
                  </span>
                ) : (
                  <span className="absolute top-2 left-2 size-2.5 rounded-full border border-white bg-zinc-400" title="Inactive" />
                )}
                <div className="px-2 py-1.5 leading-tight">
                  <div className="flex items-center justify-between gap-1">
                    <p className="min-w-0 truncate font-medium">{c.name}</p>
                    <BatteryLevel level={cow?.battery} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {paddockName(c.paddock_id) ?? 'Unassigned'}
                    {syncing(c) && <span className="text-amber-700"> · syncing</span>}
                  </p>
                </div>
                {selecting ? (
                  <Checkbox
                    className="absolute top-1.5 right-1.5 bg-white"
                    checked={selected.has(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggle(c.id)}
                    aria-label={`Select ${c.name}`}
                  />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1 right-1 cursor-pointer bg-white/80 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      askDelete([c])
                    }}
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {selecting && chosen.length > 0 && (
        <div className="sticky bottom-0 flex items-center gap-2 rounded-xl border border-white/60 bg-white/90 p-2 shadow-lg backdrop-blur-xl">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 cursor-pointer"
            disabled={chosenAssigned.length === 0 || unassigning}
            onClick={unassignChosen}
          >
            {unassigning ? 'Unassigning…' : `Unassign${chosenAssigned.length > 0 ? ` (${chosenAssigned.length})` : ''}`}
          </Button>
          <Button variant="destructive" size="sm" className="flex-1 cursor-pointer" disabled={unassigning} onClick={() => askDelete(chosen)}>
            Delete ({chosen.length})
          </Button>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAssigned.length === 0
                ? `This removes ${pending.length === 1 ? 'the collar' : 'them'} from the farm. This can't be undone.`
                : pending.length === 1
                  ? `This removes the collar from the farm and its cow leaves ${paddockName(pending[0].paddock_id)}. This can't be undone.`
                  : `This removes them from the farm and ${pendingAssigned.length} cow${pendingAssigned.length === 1 ? '' : 's'} leave${pendingAssigned.length === 1 ? 's' : ''} ${pendingAssigned.length === 1 ? 'its paddock' : 'their paddocks'}. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="cursor-pointer" disabled={deleting} onClick={confirmDelete}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

export function BatteryLevel({ level }: { level?: number }) {
  if (level === undefined) return null
  const Icon = level >= 75 ? BatteryFull : level >= 40 ? BatteryMedium : BatteryLow
  return (
    <span className={`flex shrink-0 items-center gap-0.5 text-xs tabular-nums ${level < 20 ? 'text-destructive' : 'text-muted-foreground'}`} title="Battery">
      <Icon className="size-3" />
      {level}%
    </span>
  )
}
