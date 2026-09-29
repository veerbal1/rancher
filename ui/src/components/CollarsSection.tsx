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
import type { Paddock } from '@/usePaddocks'
import { AddCollarsDialog } from './AddCollarsDialog'

type Props = {
  collars: Collar[]
  paddocks: Paddock[]
  canAdd: boolean
  onAdd: (count: number) => Promise<void>
  onDelete: (collar: Collar) => Promise<void>
}

export function CollarsSection({ collars, paddocks, canAdd, onAdd, onDelete }: Props) {
  const paddockName = (id: string | null) => paddocks.find((p) => p.id === id)?.name
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
            <li key={c.id} className="flex items-center gap-1 rounded-lg bg-white/60 py-1 pr-1 pl-3 text-sm">
              <span className="shrink-0">{c.name}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {paddockName(c.paddock_id) ?? 'Unassigned'}
              </span>
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
