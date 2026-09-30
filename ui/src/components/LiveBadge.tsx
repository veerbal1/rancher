import { Radio } from 'lucide-react'

export function LiveBadge({ live }: { live: boolean }) {
  const label = live ? 'Live: positions pushed over WebSocket' : 'Polling: no pushes in the last few seconds'
  return (
    <div
      role="status"
      aria-label={label}
      title={label}
      className="fixed top-36 left-4 z-10 grid size-12 place-items-center rounded-2xl border border-white/60 bg-white/80 shadow-lg backdrop-blur-xl"
    >
      <Radio className={live ? 'size-5 text-emerald-600' : 'size-5 animate-pulse text-muted-foreground'} />
    </div>
  )
}
