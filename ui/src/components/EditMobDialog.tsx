import { useState, type ReactNode } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Collar } from '@/useCollars'
import type { Mob } from '@/useMobs'
import { ColorSwatches } from './MobsSection'
import { CowPicker } from './CowPicker'

export type MobPatch = { name?: string; color?: string }

type Props = {
  mob: Mob
  mobs: Mob[]
  collars: Collar[]
  children: ReactNode
  onSave: (patch: MobPatch, add: string[], remove: string[]) => Promise<void>
}

export function EditMobDialog({ mob, mobs, collars, children, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(mob.name)
  const [color, setColor] = useState(mob.color)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inMob = (c: Collar) => c.mob_id === mob.id
  const mobName = (id: string | null) => mobs.find((m) => m.id === id)?.name

  const add = collars.filter((c) => selected.has(c.id) && !inMob(c)).map((c) => c.id)
  const remove = collars.filter((c) => inMob(c) && !selected.has(c.id)).map((c) => c.id)
  const patch: MobPatch = {
    ...(name.trim() !== mob.name ? { name: name.trim() } : {}),
    ...(color !== mob.color ? { color } : {}),
  }
  const changed = Object.keys(patch).length + add.length + remove.length > 0

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) {
      setName(mob.name)
      setColor(mob.color)
      setSelected(new Set(collars.filter(inMob).map((c) => c.id)))
    } else setError('')
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(patch, add, remove)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" />}>{children}</DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {mob.name}</DialogTitle>
          <DialogDescription>Change the name or colour, and tick the cows that belong in this mob. Cows in another mob switch to this one.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={`mob-name-${mob.id}`}>Name</Label>
          <Input id={`mob-name-${mob.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>

        <div className="grid gap-2">
          <Label>Colour</Label>
          <ColorSwatches value={color} onChange={setColor} />
        </div>

        <div className="grid gap-1">
          <Label>Cows</Label>
          <CowPicker
            collars={collars}
            mobs={mobs}
            selected={selected}
            onChange={setSelected}
            describe={(c) => (inMob(c) ? 'in this mob' : mobName(c.mob_id) ? `in ${mobName(c.mob_id)}` : 'no mob')}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button className="cursor-pointer" disabled={!changed || !name.trim() || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
