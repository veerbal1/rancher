import { useState } from 'react'
import { Route } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Paddock } from '@/usePaddocks'
import { laneBetween, type Lane } from '@/useLanes'

type Props = {
  paddock: Paddock
  paddocks: Paddock[]
  lanes: Lane[]
  onPick: (toPaddockId: string) => void
}

export function DrawLaneDialog({ paddock, paddocks, lanes, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [toId, setToId] = useState<string | null>(null)

  const items = paddocks.filter((p) => p.id !== paddock.id).map((p) => ({ label: p.name, value: p.id }))
  const replacing = !!toId && !!laneBetween(lanes, paddock.id, toId)

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) setToId(null)
  }

  const pick = () => {
    if (!toId) return
    setOpen(false)
    onPick(toId)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="cursor-pointer" disabled={items.length === 0} />}>
        <Route />
        Draw lane
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Draw a lane from {paddock.name}</DialogTitle>
          <DialogDescription>
            Pick where the lane goes, then draw it on the map. No cows move. Moves and milking can use the lane later, in
            either direction.
          </DialogDescription>
        </DialogHeader>

        <Select items={items} value={toId} onValueChange={setToId}>
          <SelectTrigger className="w-full cursor-pointer">
            <SelectValue placeholder="Pick a paddock" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {replacing && <p className="text-sm text-muted-foreground">This replaces the lane already saved between them.</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button className="cursor-pointer" disabled={!toId} onClick={pick}>
            Draw lane
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
