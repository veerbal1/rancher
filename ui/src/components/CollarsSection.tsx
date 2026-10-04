import { useState } from 'react'
import { BatteryFull, BatteryLow, BatteryMedium, Trash2 } from 'lucide-react'
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
import { AddCollarsDialog } from './AddCollarsDialog'

type Props = {
  collars: Collar[]
  cows: Cow[]
  paddocks: Paddock[]
  canAdd: boolean
  onAdd: (count: number) => Promise<void>
  onDelete: (collars: Collar[]) => Promise<void>
  onUnassign: (collars: Collar[]) => Promise<void>
}

export function CollarsSection({ collars, cows, paddocks, canAdd, onAdd, onDelete, onUnassign }: Props) {
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
          {collars.map((c) => (
            <li
              key={c.id}
              onClick={selecting ? () => toggle(c.id) : undefined}
              className={`flex items-center gap-1.5 rounded-lg py-1 pr-1 pl-2 text-sm ${selecting ? 'cursor-pointer select-none' : ''} ${selected.has(c.id) ? 'bg-white ring-2 ring-primary/60' : 'bg-white/60'}`}
            >
              <div className="relative shrink-0">
                <img src="/collar.png" alt="" className="size-7" />
                {c.paddock_id ? (
                  <span className="absolute -top-0.5 -right-0.5 flex size-2.5" title="Live">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full border border-white bg-emerald-500" />
                  </span>
                ) : (
                  <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border border-white bg-zinc-400" title="Inactive" />
                )}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center justify-between gap-1">
                  <p>{c.name}</p>
                  <BatteryLevel level={cowOf(c)?.battery} />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {paddockName(c.paddock_id) ?? 'Unassigned'}
                  {syncing(c) && <span className="text-amber-700"> · syncing</span>}
                </p>
              </div>
              {selecting ? (
                <Checkbox
                  className="mr-1"
                  checked={selected.has(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => toggle(c.id)}
                  aria-label={`Select ${c.name}`}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                  onClick={() => askDelete([c])}
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
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

function BatteryLevel({ level }: { level?: number }) {
  if (level === undefined) return null
  const Icon = level >= 75 ? BatteryFull : level >= 40 ? BatteryMedium : BatteryLow
  return (
    <span className={`flex items-center gap-0.5 text-xs tabular-nums ${level < 20 ? 'text-destructive' : 'text-muted-foreground'}`} title="Battery">
      <Icon className="size-3.5" />
      {level}%
    </span>
  )
}
