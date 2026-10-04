import { useState } from 'react'
import { CalendarClock, Milk } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import type { MilkingSchedule, MilkingSession, SessionCowStatus } from '@/useMilking'

type Props = {
  shed: Paddock
  paddocks: Paddock[]
  session?: MilkingSession
  schedule: MilkingSchedule | null
  onStart: (fromId: string, toId: string) => Promise<boolean>
  onStop: () => Promise<void>
  onChangeCapacity: (capacity: number) => Promise<void>
  onSaveSchedule: (schedule: MilkingSchedule) => Promise<boolean>
}

const STEPS: { status: SessionCowStatus; label: string }[] = [
  { status: 'waiting', label: 'waiting' },
  { status: 'called', label: 'walking in' },
  { status: 'milking', label: 'milking' },
  { status: 'done', label: 'done' },
  { status: 'missed', label: 'missed' },
]

export function MilkingPanel({ shed, paddocks, session, schedule, onStart, onStop, onChangeCapacity, onSaveSchedule }: Props) {
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
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5 shrink-0" />
          {schedule && schedule.shed_id === shed.id
            ? `${schedule.enabled ? 'Every day' : 'Paused'} · morning ${schedule.morning_at} · evening ${schedule.evening_at}`
            : 'No schedule'}
        </p>
        <ScheduleDialog shed={shed} paddocks={paddocks} schedule={schedule} onSave={onSaveSchedule} />
      </div>

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

type ScheduleProps = {
  shed: Paddock
  paddocks: Paddock[]
  schedule: MilkingSchedule | null
  onSave: (schedule: MilkingSchedule) => Promise<boolean>
}

function ScheduleDialog({ shed, paddocks, schedule, onSave }: ScheduleProps) {
  const places = paddocks.filter((p) => p.kind !== 'milking_shed')
  const items = places.map((p) => ({ label: p.name, value: p.id }))
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [morning, setMorning] = useState('05:00')
  const [evening, setEvening] = useState('15:00')
  const [restId, setRestId] = useState<string | null>(null)
  const [paddockId, setPaddockId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const name = (id: string | null) => paddocks.find((p) => p.id === id)?.name ?? '…'

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) return
    const mine = schedule?.shed_id === shed.id ? schedule : null
    setEnabled(mine?.enabled ?? true)
    setMorning(mine?.morning_at ?? '05:00')
    setEvening(mine?.evening_at ?? '15:00')
    setRestId(mine?.rest_shed_id ?? places.find((p) => p.kind === 'rest_shed')?.id ?? null)
    setPaddockId(mine?.paddock_id ?? places.find((p) => (p.kind ?? 'paddock') === 'paddock')?.id ?? null)
  }

  const save = async () => {
    if (!restId || !paddockId) return
    setSaving(true)
    try {
      const ok = await onSave({
        enabled,
        timezone,
        morning_at: morning,
        evening_at: evening,
        rest_shed_id: restId,
        shed_id: shed.id,
        paddock_id: paddockId,
      })
      if (ok) setOpen(false)
    } finally {
      setSaving(false)
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
      <DialogTrigger render={<Button variant="outline" size="sm" className="cursor-pointer" disabled={places.length === 0} />}>
        {schedule?.shed_id === shed.id ? 'Edit' : 'Set schedule'}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Milking schedule for {shed.name}</DialogTitle>
          <DialogDescription>
            Milking starts by itself every day at these times. Times are in {timezone}.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
          Run every day
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <p className="text-sm">Morning</p>
            <Input type="time" value={morning} onChange={(e) => setMorning(e.target.value)} aria-label="Morning milking time" />
          </div>
          <div className="grid gap-1.5">
            <p className="text-sm">Evening</p>
            <Input type="time" value={evening} onChange={(e) => setEvening(e.target.value)} aria-label="Evening milking time" />
          </div>
        </div>

        <div className="grid gap-1.5">
          <p className="text-sm">Cows sleep in</p>
          {picker(restId, setRestId)}
        </div>
        <div className="grid gap-1.5">
          <p className="text-sm">Cows graze in</p>
          {picker(paddockId, setPaddockId)}
        </div>

        <p className="text-xs text-muted-foreground">
          Morning: {name(restId)} → {shed.name} → {name(paddockId)}. Evening: {name(paddockId)} → {shed.name} →{' '}
          {name(restId)}.
        </p>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            className="cursor-pointer"
            disabled={!restId || !paddockId || !morning || !evening || morning === evening || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
