import { useEffect } from 'react'
import { History, Route, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Collar } from '@/useCollars'
import type { Cow } from '@/useCows'
import type { Paddock } from '@/usePaddocks'
import { BatteryLevel } from './CollarsSection'
import { MoveHerdDialog } from './MoveHerdDialog'

type Props = {
  collar: Collar
  cow?: Cow
  paddock?: Paddock
  paddocks: Paddock[]
  onMove: (toPaddockId: string) => void
  onClose: () => void
}

const STATE_COLORS: Record<string, string> = {
  inside: 'bg-emerald-600',
  warning: 'bg-amber-500',
  breached: 'bg-red-500',
  moving: 'bg-blue-500',
}

export function CowPanel({ collar, cow, paddock, paddocks, onMove, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside className="fixed top-20 right-[26rem] z-10 w-72 overflow-hidden rounded-2xl border border-white/60 bg-white/85 text-sm shadow-[0_8px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl duration-200 animate-in fade-in slide-in-from-right-6">
      <div className="relative bg-white">
        <img src="/cow-collar.webp" alt="" className="aspect-[4/3] w-full object-contain p-2" />
        <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2 cursor-pointer bg-white/80" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>

      <div className="grid gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{collar.name}</h2>
          <BatteryLevel level={cow?.battery} />
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted-foreground">Paddock</dt>
          <dd className="text-right">{paddock?.name ?? 'Unassigned'}</dd>
          <dt className="text-muted-foreground">State</dt>
          <dd className="flex items-center justify-end gap-1.5 capitalize">
            {cow ? (
              <>
                <span className={`size-2 rounded-full ${STATE_COLORS[cow.state] ?? 'bg-zinc-400'}`} />
                {cow.state}
              </>
            ) : (
              <span className="text-muted-foreground">No signal</span>
            )}
          </dd>
          {cow && cow.level !== 'none' && (
            <>
              <dt className="text-muted-foreground">Cue</dt>
              <dd className="text-right capitalize">
                {cow.level}
                {cow.side && cow.side !== 'none' && ` · ${cow.side}`}
              </dd>
            </>
          )}
          {cow && (
            <>
              <dt className="text-muted-foreground">Fence</dt>
              <dd className="text-right">v{cow.fence_version ?? 0}</dd>
            </>
          )}
        </dl>

        <div className="grid gap-2">
          {paddock ? (
            <MoveHerdDialog
              paddock={paddock}
              paddocks={paddocks}
              cowCount={1}
              cowName={collar.name}
              disabled={cow?.state === 'moving'}
              onPick={onMove}
            />
          ) : (
            <Button variant="outline" disabled>
              <Route />
              Move to paddock
            </Button>
          )}
          <Button variant="outline" className="cursor-not-allowed" disabled>
            <History />
            View history
          </Button>
        </div>
      </div>
    </aside>
  )
}
