import { Button } from '@/components/ui/button'
import type { Collar } from '@/useCollars'
import type { Mob } from '@/useMobs'

type Props = {
  collars: Collar[]
  mobs: Mob[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  describe: (collar: Collar) => string
}

export function CowPicker({ collars, mobs, selected, onChange, describe }: Props) {
  const mobOf = (c: Collar) => mobs.find((m) => m.id === c.mob_id)
  const all = collars.length > 0 && selected.size === collars.length

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {selected.size} of {collars.length} selected
        </span>
        <Button
          variant="link"
          size="xs"
          className="cursor-pointer"
          disabled={collars.length === 0}
          onClick={() => onChange(all ? new Set() : new Set(collars.map((c) => c.id)))}
        >
          {all ? 'Clear' : 'Select all'}
        </Button>
      </div>

      <ul className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1.5 overflow-y-auto p-0.5">
        {collars.map((c) => {
          const mob = mobOf(c)
          const on = selected.has(c.id)
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                title={`${c.name} · ${describe(c)}${mob ? ` · ${mob.name}` : ''}`}
                onClick={() => toggle(c.id)}
                className={`relative grid aspect-square w-full cursor-pointer place-items-center rounded-lg border text-sm font-medium tabular-nums transition active:scale-95 ${
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-white/70 hover:bg-white'
                }`}
              >
                {c.number}
                {mob && (
                  <span
                    className="absolute top-1 right-1 size-2 rounded-full ring-1 ring-white"
                    style={{ backgroundColor: mob.color }}
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
