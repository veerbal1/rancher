import { useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
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
import type { Paddock } from '@/usePaddocks'
import type { Lane } from '@/useLanes'
import { MOB_COLORS, mobInitials, type Mob } from '@/useMobs'
import { MoveHerdDialog } from './MoveHerdDialog'

type Props = {
  mobs: Mob[]
  collars: Collar[]
  paddocks: Paddock[]
  lanes: Lane[]
  canAdd: boolean
  onCreate: (name: string, color: string) => Promise<unknown>
  onMove: (fromId: string, toId: string, useSavedLane: boolean, collarIds: string[]) => void
}

export function MobsSection({ mobs, collars, paddocks, lanes, canAdd, onCreate, onMove }: Props) {
  const nextColor = MOB_COLORS.find((c) => !mobs.some((m) => m.color === c)) ?? MOB_COLORS[0]

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Mobs</h2>
        <AddMobDialog disabled={!canAdd} defaultColor={nextColor} onCreate={onCreate} />
      </div>

      {canAdd && mobs.length === 0 && <p className="text-sm text-muted-foreground">No mobs yet.</p>}
      {mobs.length > 0 && (
        <ul className="grid gap-1">
          {mobs.map((m) => {
            const members = collars.filter((c) => c.mob_id === m.id)
            const n = members.length
            const places = [...new Set(members.map((c) => c.paddock_id))]
            const from = places.length === 1 ? paddocks.find((p) => p.id === places[0]) : undefined
            const where = n === 0 ? '' : from ? from.name : places.length === 1 ? 'Unassigned' : `Split across ${places.length} places`
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-xl bg-white/60 px-2 py-1.5 text-sm">
                <MobAvatar mob={m} />
                <div className="min-w-0 leading-tight">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {n} cow{n === 1 ? '' : 's'}
                    {where && ` · ${where}`}
                  </p>
                </div>
                <div className="ml-auto shrink-0">
                  {from ? (
                    <MoveHerdDialog
                      paddock={from}
                      paddocks={paddocks}
                      cowCount={n}
                      mobName={m.name}
                      lanes={lanes}
                      onPick={(toId, useSavedLane) => onMove(from.id, toId, useSavedLane, members.map((c) => c.id))}
                    />
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      Move
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function MobAvatar({ mob }: { mob: Mob }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: mob.color }}>
      {mobInitials(mob.name)}
    </span>
  )
}

type DialogProps = {
  disabled: boolean
  defaultColor: string
  onCreate: (name: string, color: string) => Promise<unknown>
}

function AddMobDialog({ disabled, defaultColor, onCreate }: DialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(defaultColor)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) setColor(defaultColor)
    else setError('')
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError('')
    try {
      await onCreate(trimmed, color)
      setName('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button size="sm" className="cursor-pointer" disabled={disabled} />}>Add mob</DialogTrigger>

      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Mob details</DialogTitle>
            <DialogDescription>A mob is a group of cows you manage and move together.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="mob-name">Name</Label>
            <Input id="mob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Milkers" maxLength={100} autoFocus />
          </div>

          <div className="grid gap-2">
            <Label>Colour</Label>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {MOB_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={`grid size-8 cursor-pointer place-items-center rounded-full border-2 border-white shadow transition active:scale-95 ${color === c ? 'ring-2 ring-foreground/70' : ''}`}
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? 'Saving…' : 'Save mob'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
