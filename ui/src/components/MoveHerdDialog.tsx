import { useState } from 'react'
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

type Props = {
  paddock: Paddock
  paddocks: Paddock[]
  cowCount: number
  onPick: (toPaddockId: string) => void
}

export function MoveHerdDialog({ paddock, paddocks, cowCount, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [toId, setToId] = useState<string | null>(null)

  const items = paddocks.filter((p) => p.id !== paddock.id).map((p) => ({ label: p.name, value: p.id }))

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
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="cursor-pointer" disabled={cowCount === 0 || items.length === 0} />}
      >
        Move herd
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move herd from {paddock.name}</DialogTitle>
          <DialogDescription>
            Pick where the {cowCount} cow{cowCount === 1 ? '' : 's'} here should go, then draw the lane they walk along.
            Collars guide each cow to the gate, down the lane and into the new paddock.
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

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button className="cursor-pointer" disabled={!toId} onClick={pick}>
            Draw path
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
