import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

type Props = {
  paddock: Paddock
  collars: Collar[]
  paddocks: Paddock[]
  onSave: (add: string[], remove: string[]) => Promise<void>
}

export function AssignCollarsDialog({ paddock, collars, paddocks, onSave }: Props) {
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

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
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

        <ul className="grid max-h-72 gap-0.5 overflow-y-auto">
          {collars.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={selected.has(c.id)} onCheckedChange={(checked) => toggle(c.id, checked)} />
                <span className="flex-1 text-sm">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {isHere(c) ? 'Here' : (paddockName(c.paddock_id) ?? 'Unassigned')}
                </span>
              </label>
            </li>
          ))}
        </ul>

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
