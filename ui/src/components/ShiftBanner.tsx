import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Paddock } from '@/usePaddocks'
import type { Shift } from '@/useShifts'

type Props = {
  shift: Shift
  paddocks: Paddock[]
  onTurnBack: (shift: Shift) => Promise<void>
}

export function ShiftBanner({ shift, paddocks, onTurnBack }: Props) {
  const [busy, setBusy] = useState(false)
  const name = (id: string) => paddocks.find((p) => p.id === id)?.name ?? 'a paddock'
  const n = shift.collar_ids.length

  const turnBack = async () => {
    setBusy(true)
    try {
      await onTurnBack(shift)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/85 px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl">
      <span className="size-2.5 shrink-0 rounded-full bg-blue-500" />
      <p className="min-w-0 flex-1">
        Moving {n} cow{n === 1 ? '' : 's'} from {name(shift.from_paddock_id)} to {name(shift.to_paddock_id)}
      </p>
      <Button variant="outline" size="sm" className="cursor-pointer" disabled={busy} onClick={turnBack}>
        {busy ? 'Turning back…' : 'Turn back'}
      </Button>
    </div>
  )
}
