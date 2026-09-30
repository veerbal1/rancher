import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  onDelete: (collar: Collar) => Promise<void>
}

export function CollarsSection({ collars, cows, paddocks, canAdd, onAdd, onDelete }: Props) {
  const paddockName = (id: string | null) => paddocks.find((p) => p.id === id)?.name
  const syncing = (c: Collar) => {
    const cow = cows.find((w) => w.collar_id === c.id)
    const paddock = paddocks.find((p) => p.id === c.paddock_id)
    return !!cow && !!paddock && cow.state !== 'moving' && (cow.fence_version ?? 0) < (paddock.fence_version ?? 0)
  }
  const unassigned = collars.filter((c) => !c.paddock_id).length

  const [pending, setPending] = useState<Collar | null>(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const askDelete = (collar: Collar) => {
    setPending(collar)
    setDeleteError('')
    setOpen(true)
  }

  const confirmDelete = async () => {
    if (!pending) return
    setDeleting(true)
    setDeleteError('')
    try {
      await onDelete(pending)
      setOpen(false)
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
        <AddCollarsDialog disabled={!canAdd} onAdd={onAdd} />
      </div>

      {canAdd && collars.length === 0 && <p className="text-sm text-muted-foreground">No collars yet.</p>}
      {collars.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {collars.length} collar{collars.length === 1 ? '' : 's'} · {unassigned} unassigned
        </p>
      )}

      {collars.length > 0 && (
        <ul className="grid grid-cols-2 gap-1.5">
          {collars.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 rounded-lg bg-white/60 py-1 pr-1 pl-2 text-sm">
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
                <p>{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {paddockName(c.paddock_id) ?? 'Unassigned'}
                  {syncing(c) && <span className="text-amber-700"> · syncing</span>}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                className="cursor-pointer text-muted-foreground hover:text-destructive"
                onClick={() => askDelete(c)}
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pending?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && paddockName(pending.paddock_id)
                ? `This removes the collar from the farm and its cow leaves ${paddockName(pending.paddock_id)}. This can't be undone.`
                : "This removes the collar from the farm. This can't be undone."}
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
