import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { Collar } from '@/useCollars'
import type { Paddock } from '@/usePaddocks'
import type { Mob } from '@/useMobs'
import { CowPicker } from './CowPicker'

type Props = {
  paddock: Paddock
  collars: Collar[]
  paddocks: Paddock[]
  mobs: Mob[]
  onSave: (add: string[], remove: string[]) => Promise<void>
}

export function AssignCollarsDialog({ paddock, collars, paddocks, mobs, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isHere = (c: Collar) => c.paddock_id === paddock.id
  const paddockName = (id: string | null) => paddocks.find((p) => p.id === id)?.name

  const add = collars.filter((c) => selected.has(c.id) && !isHere(c)).map((c) => c.id)
  const remove = collars.filter((c) => isHere(c) && !selected.has(c.id)).map((c) => c.id)

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) setSelected(new Set(collars.filter(isHere).map((c) => c.id)))
    else setError('')
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(add, remove)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="cursor-pointer" disabled={collars.length === 0} />}
      >
        Assign collars
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collars in {paddock.name}</DialogTitle>
          <DialogDescription>
            Tick the collars that belong in this paddock. Collars in another paddock move here.
          </DialogDescription>
        </DialogHeader>

        <CowPicker
          collars={collars}
          mobs={mobs}
          selected={selected}
          onChange={setSelected}
          describe={(c) => (isHere(c) ? 'here' : (paddockName(c.paddock_id) ?? 'unassigned'))}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button className="cursor-pointer" disabled={add.length + remove.length === 0 || saving} onClick={save}>
            {saving ? 'Saving…' : `Save (${selected.size} in paddock)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
