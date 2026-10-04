import { useState } from 'react'
import { Milk } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Paddock } from '@/usePaddocks'
import type { MilkingSession, SessionCowStatus } from '@/useMilking'

type Props = {
  shed: Paddock
  paddocks: Paddock[]
  session?: MilkingSession
  onStart: (fromId: string, toId: string) => Promise<boolean>
  onStop: () => Promise<void>
  onChangeCapacity: (capacity: number) => Promise<void>
}

const STEPS: { status: SessionCowStatus; label: string }[] = [
  { status: 'waiting', label: 'waiting' },
  { status: 'called', label: 'walking in' },
  { status: 'milking', label: 'milking' },
  { status: 'done', label: 'done' },
  { status: 'missed', label: 'missed' },
]

export function MilkingPanel({ shed, paddocks, session, onStart, onStop, onChangeCapacity }: Props) {
  const [stopping, setStopping] = useState(false)
  const name = (id: string) => paddocks.find((p) => p.id === id)?.name ?? 'a paddock'
  const capacity = shed.capacity ?? 20

  const counts = STEPS.map((s) => ({ ...s, n: session?.cows.filter((c) => c.status === s.status).length ?? 0 })).filter(
    (s) => s.status !== 'missed' || s.n > 0,
  )

  const stop = async () => {
    setStopping(true)
    try {
      await onStop()
    } finally {
      setStopping(false)
    }
  }

  const saveCapacity = (value: string) => {
    const n = Number(value)
    if (Number.isInteger(n) && n >= 1 && n <= 98 && n !== capacity) void onChangeCapacity(n)
  }

  return (
    <section className="grid gap-2 rounded-xl border border-white/70 bg-white/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Milk className="size-4" />
          Milking
        </h3>
        {session ? (
          <Button variant="outline" size="sm" className="cursor-pointer" disabled={stopping} onClick={stop}>
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
        ) : (
          <StartMilkingDialog shed={shed} paddocks={paddocks} capacity={capacity} onStart={onStart} />
        )}
      </div>

      {session ? (
        <>
          <p className="text-xs text-muted-foreground">
            {name(session.from_paddock_id)} → {shed.name} → {name(session.to_paddock_id)}
          </p>
          <p className="text-sm">{counts.map((s) => `${s.n} ${s.label}`).join(' · ')}</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Not milking now.</p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-2">
        <p className="text-xs text-muted-foreground">Cows in the shed at a time</p>
        <Input
          key={capacity}
          type="number"
          min={1}
          max={98}
          defaultValue={capacity}
          aria-label="Cows in the shed at a time"
          className="h-7 w-16"
          onBlur={(e) => saveCapacity(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
    </section>
  )
}

type DialogProps = {
  shed: Paddock
  paddocks: Paddock[]
  capacity: number
  onStart: (fromId: string, toId: string) => Promise<boolean>
}

function StartMilkingDialog({ shed, paddocks, capacity, onStart }: DialogProps) {
  const places = paddocks.filter((p) => p.kind !== 'milking_shed')
  const items = places.map((p) => ({ label: p.name, value: p.id }))
  const [open, setOpen] = useState(false)
  const [fromId, setFromId] = useState<string | null>(null)
  const [toId, setToId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) {
      setFromId(places.find((p) => p.kind === 'rest_shed')?.id ?? places[0]?.id ?? null)
      setToId(places.find((p) => (p.kind ?? 'paddock') === 'paddock')?.id ?? null)
    }
  }

  const start = async () => {
    if (!fromId || !toId) return
    setStarting(true)
    try {
      if (await onStart(fromId, toId)) setOpen(false)
    } finally {
      setStarting(false)
    }
  }

  const picker = (value: string | null, onChange: (v: string | null) => void) => (
    <Select items={items} value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full cursor-pointer">
        <SelectValue placeholder="Pick a place" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button size="sm" className="cursor-pointer" disabled={places.length === 0} />}>
        Start milking
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start milking in {shed.name}</DialogTitle>
          <DialogDescription>
            Cows walk in on the saved lanes, {capacity} at a time. After milking, each cow walks on to the next place by
            herself.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <p className="text-sm">Cows come from</p>
          {picker(fromId, setFromId)}
        </div>
        <div className="grid gap-1.5">
          <p className="text-sm">After milking they go to</p>
          {picker(toId, setToId)}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button className="cursor-pointer" disabled={!fromId || !toId || starting} onClick={start}>
            {starting ? 'Starting…' : 'Start milking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
