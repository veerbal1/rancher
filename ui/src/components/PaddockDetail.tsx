import { useState, type FormEvent } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import type { Collar } from '@/useCollars'
import { AssignCollarsDialog } from './AssignCollarsDialog'
import { MoveHerdDialog } from './MoveHerdDialog'

type Props = {
  paddock: Paddock
  collars: Collar[]
  paddocks: Paddock[]
  onRename: (name: string) => Promise<void>
  onDelete: () => Promise<void>
  onAssignCollars: (add: string[], remove: string[]) => Promise<void>
  onMoveHerd: (toPaddockId: string) => void
}

export function PaddockDetail({ paddock, collars, paddocks, onRename, onDelete, onAssignCollars, onMoveHerd }: Props) {
  const collarCount = collars.filter((c) => c.paddock_id === paddock.id).length

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(paddock.name)
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const startEditing = () => {
    setName(paddock.name)
    setRenameError('')
    setEditing(true)
  }

  const stopEditing = () => {
    setEditing(false)
    setRenameError('')
  }

  const submitRename = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === paddock.name) {
      stopEditing()
      return
    }
    setRenaming(true)
    setRenameError('')
    try {
      await onRename(trimmed)
      setEditing(false)
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err))
    } finally {
      setRenaming(false)
    }
  }

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) setDeleteError('')
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await onDelete()
      setOpen(false)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="grid gap-2 rounded-xl border border-white/70 bg-white/60 p-3">
      {editing ? (
        <form onSubmit={submitRename} className="flex items-center gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && stopEditing()}
            onFocus={(e) => e.target.select()}
            maxLength={60}
            disabled={renaming}
            aria-label="Paddock name"
            autoFocus
            className="h-8"
          />
          <Button type="submit" size="icon-sm" className="cursor-pointer" disabled={renaming} aria-label="Save name">
            <Check />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer"
            disabled={renaming}
            onClick={stopEditing}
            aria-label="Cancel rename"
          >
            <X />
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="truncate text-sm font-medium">{paddock.name}</p>
              <Button
                variant="ghost"
                size="icon-xs"
                className="cursor-pointer text-muted-foreground"
                onClick={startEditing}
                aria-label="Rename paddock"
              >
                <Pencil />
              </Button>
            </div>
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
              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
              <AlertDialogFooter>
                <AlertDialogCancel className="cursor-pointer" disabled={deleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  className="cursor-pointer"
                  disabled={deleting}
                  onClick={confirmDelete}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {renameError && <p className="text-sm text-destructive">{renameError}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-2">
        <p className="text-xs text-muted-foreground">
          {collarCount} collar{collarCount === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-1.5">
          <MoveHerdDialog paddock={paddock} paddocks={paddocks} cowCount={collarCount} onPick={onMoveHerd} />
          <AssignCollarsDialog paddock={paddock} collars={collars} paddocks={paddocks} onSave={onAssignCollars} />
        </div>
      </div>
    </section>
  )
}
