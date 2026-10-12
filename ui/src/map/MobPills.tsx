import { useMemo, useState } from 'react'
import { Marker } from '@vis.gl/react-maplibre'
import type { Collar } from '../useCollars'
import type { Cow } from '../useCows'
import { mobInitials, type Mob } from '../useMobs'

type Props = { cows: Cow[]; collars: Collar[]; mobs: Mob[] }

export function MobPills({ cows, collars, mobs }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const pills = useMemo(() => {
    const byId = new Map(collars.map((c) => [c.id, c]))
    const groups = new Map<string, { lngs: number[]; lats: number[]; perMob: Map<string, number> }>()
    for (const cow of cows) {
      const collar = byId.get(cow.collar_id)
      if (!collar?.paddock_id || cow.state === 'moving') continue
      const g = groups.get(collar.paddock_id) ?? { lngs: [], lats: [], perMob: new Map<string, number>() }
      g.lngs.push(cow.lng)
      g.lats.push(cow.lat)
      const key = collar.mob_id ?? ''
      g.perMob.set(key, (g.perMob.get(key) ?? 0) + 1)
      groups.set(collar.paddock_id, g)
    }
    return [...groups].map(([paddockId, g]) => ({
      paddockId,
      lng: g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length,
      lat: g.lats.reduce((a, b) => a + b, 0) / g.lats.length,
      count: g.lngs.length,
      mobs: mobs.filter((m) => g.perMob.has(m.id)).slice(0, 6),
      breakdown: [
        ...mobs.filter((m) => g.perMob.has(m.id)).map((m) => ({ mob: m, count: g.perMob.get(m.id)! })),
        ...(g.perMob.has('') ? [{ mob: null, count: g.perMob.get('')! }] : []),
      ].sort((a, b) => b.count - a.count),
    }))
  }, [cows, collars, mobs])

  return (
    <>
      {pills.map((p) => (
        <Marker key={p.paddockId} longitude={p.lng} latitude={p.lat} anchor="bottom">
          <div className="flex flex-col items-center">
            {openId === p.paddockId && (
              <ul className="mb-1.5 grid min-w-44 gap-1 rounded-xl bg-white p-2 text-sm shadow-lg">
                {p.breakdown.map((b) => (
                  <li key={b.mob?.id ?? 'none'} className="flex items-center gap-2">
                    {b.mob ? (
                      <span className="grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-semibold text-white" style={{ backgroundColor: b.mob.color }}>
                        {mobInitials(b.mob.name)}
                      </span>
                    ) : (
                      <span className="size-5 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/40" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{b.mob?.name ?? 'No mob'}</span>
                    <span className="font-semibold tabular-nums">{b.count}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setOpenId(openId === p.paddockId ? null : p.paddockId)}
              className="flex cursor-pointer items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 shadow-md"
            >
              {p.mobs.length > 0 && (
                <div className="flex">
                  {p.mobs.map((m, i) => (
                    <span
                      key={m.id}
                      className="grid size-6 place-items-center rounded-full border-2 border-white text-[9px] font-semibold text-white"
                      style={{ backgroundColor: m.color, marginLeft: i === 0 ? 0 : -10 }}
                    >
                      {i === p.mobs.length - 1 ? mobInitials(m.name) : ''}
                    </span>
                  ))}
                </div>
              )}
              <span className="text-sm font-semibold text-foreground tabular-nums">{p.count}</span>
            </button>
            <span className="-mt-1 size-2.5 rotate-45 bg-white" />
          </div>
        </Marker>
      ))}
    </>
  )
}
