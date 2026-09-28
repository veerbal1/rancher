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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { Paddock } from '@/usePaddocks'

type Props = {
  paddock: Paddock
  onDelete: () => Promise<void>
}

export function PaddockDetail({ paddock, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) setError('')
  }

  const confirm = async () => {
    setDeleting(true)
    setError('')
    try {
      await onDelete()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="flex items-center justify-between gap-3 rounded-xl border border-white/70 bg-white/60 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{paddock.name}</p>
        <p className="text-xs text-muted-foreground">{paddock.area_ha} ha</p>
      </div>

      <AlertDialog open={open} onOpenChange={changeOpen}>
        <AlertDialogTrigger render={<Button variant="destructive" size="sm" className="cursor-pointer" />}>
          <Trash2 />
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {paddock.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the paddock and its boundary from the farm. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="cursor-pointer" disabled={deleting} onClick={confirm}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
