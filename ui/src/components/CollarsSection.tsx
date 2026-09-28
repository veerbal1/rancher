import type { Collar } from '@/useCollars'
import type { Paddock } from '@/usePaddocks'
import { AddCollarsDialog } from './AddCollarsDialog'

type Props = {
  collars: Collar[]
  paddocks: Paddock[]
  canAdd: boolean
  onAdd: (count: number) => Promise<void>
}

export function CollarsSection({ collars, paddocks, canAdd, onAdd }: Props) {
  const paddockName = (id: string | null) => paddocks.find((p) => p.id === id)?.name
  const unassigned = collars.filter((c) => !c.paddock_id).length

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
            <li key={c.id} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 text-sm">
              <span>{c.name}</span>
              <span className="truncate text-xs text-muted-foreground">{paddockName(c.paddock_id) ?? 'Unassigned'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
