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
  cowCount: number
  cowName?: string
  disabled?: boolean
  lanes: Lane[]
  onPick: (toPaddockId: string, useSavedLane: boolean) => void
}

export function MoveHerdDialog({ paddock, paddocks, cowCount, cowName, disabled, lanes, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [toId, setToId] = useState<string | null>(null)

  const items = paddocks.filter((p) => p.id !== paddock.id).map((p) => ({ label: p.name, value: p.id }))

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) setToId(null)
  }

  const saved = !!toId && !!laneBetween(lanes, paddock.id, toId)

  const pick = (useSavedLane: boolean) => {
    if (!toId) return
    setOpen(false)
    onPick(toId, useSavedLane)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size={cowName ? 'default' : 'sm'} className="cursor-pointer" disabled={disabled || cowCount === 0 || items.length === 0} />
        }
      >
        {cowName ? (
          <>
            <Route />
            Move to paddock
          </>
        ) : (
          'Move herd'
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {cowName ?? 'herd'} from {paddock.name}
          </DialogTitle>
          <DialogDescription>
            {cowName
              ? `Pick where ${cowName} should go, then draw the lane. The collar guides the cow to the gate, down the lane and into the new paddock. The rest of the herd stays.`
              : `Pick where the ${cowCount} cow${cowCount === 1 ? '' : 's'} here should go, then draw the lane they walk along. Collars guide each cow to the gate, down the lane and into the new paddock.`}
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
          {saved ? (
            <>
              <Button variant="outline" className="cursor-pointer" onClick={() => pick(false)}>
                Draw new path
              </Button>
              <Button className="cursor-pointer" onClick={() => pick(true)}>
                Use saved lane
              </Button>
            </>
          ) : (
            <Button className="cursor-pointer" disabled={!toId} onClick={() => pick(false)}>
              Draw path
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
