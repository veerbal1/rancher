import { useState, type FormEvent } from 'react'
import { Check, Pencil, Spline, Trash2, X } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KINDS, type Paddock, type PaddockKind } from '@/usePaddocks'
import type { Collar } from '@/useCollars'
import type { Cow } from '@/useCows'
import { AssignCollarsDialog } from './AssignCollarsDialog'
import { MoveHerdDialog } from './MoveHerdDialog'

type Props = {
  paddock: Paddock
  collars: Collar[]
  cows: Cow[]
  paddocks: Paddock[]
  onRename: (name: string) => Promise<void>
  onChangeKind: (kind: PaddockKind) => Promise<void>
  onEditBoundary: () => void
  onDelete: () => Promise<void>
  onAssignCollars: (add: string[], remove: string[]) => Promise<void>
  onMoveHerd: (toPaddockId: string) => void
}

export function PaddockDetail({ paddock, collars, cows, paddocks, onRename, onChangeKind, onEditBoundary, onDelete, onAssignCollars, onMoveHerd }: Props) {
  const collarCount = collars.filter((c) => c.paddock_id === paddock.id).length
  const version = paddock.fence_version ?? 0
  const here = new Set(collars.filter((c) => c.paddock_id === paddock.id).map((c) => c.id))
  const reporting = cows.filter((c) => here.has(c.collar_id) && c.state !== 'moving')
  const updated = reporting.filter((c) => (c.fence_version ?? 0) >= version).length
  const synced = updated === reporting.length

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(paddock.name)
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  const [savingKind, setSavingKind] = useState(false)
  const kind = paddock.kind ?? 'paddock'

  const changeKind = async (next: PaddockKind) => {
    if (next === kind) return
    setSavingKind(true)
    try {
      await onChangeKind(next)
    } finally {
      setSavingKind(false)
    }
  }

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
            <p className="text-xs text-muted-foreground">
              {paddock.area_ha} ha{kind === 'milking_shed' && ` · holds ${paddock.capacity} cows`}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`size-2 rounded-full ${synced ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'}`} />
              Fence v{version}
              {reporting.length > 0 && ` · ${updated}/${reporting.length} updated`}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={onEditBoundary}>
              <Spline />
              Edit boundary
            </Button>
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
        </div>
      )}

      {renameError && <p className="text-sm text-destructive">{renameError}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-2">
        <p className="text-xs text-muted-foreground">Kind</p>
        <Select items={KINDS} value={kind} onValueChange={(v) => v && changeKind(v as PaddockKind)} disabled={savingKind}>
          <SelectTrigger size="sm" className="w-36 cursor-pointer" aria-label="Paddock kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
