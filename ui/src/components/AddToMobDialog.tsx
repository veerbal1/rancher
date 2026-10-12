import { useState } from 'react'
import { Users } from 'lucide-react'
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
import type { Mob } from '@/useMobs'
import { MobAvatar } from './MobsSection'

type Props = {
  mobs: Mob[]
  count: number
  cowName?: string
  label?: string
  disabled?: boolean
  onPick: (mob: Mob) => Promise<void>
}

export function AddToMobDialog({ mobs, count, cowName, label, disabled, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) setError('')
  }

  const pick = async (mob: Mob) => {
    setSavingId(mob.id)
    setError('')
    try {
      await onPick(mob)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size={cowName ? 'default' : 'sm'}
            className={cowName ? 'cursor-pointer' : 'flex-1 cursor-pointer'}
            disabled={disabled || mobs.length === 0}
            title={mobs.length === 0 ? 'Add a mob first' : undefined}
          />
        }
      >
        {cowName && <Users />}
        {label ?? 'Add to mob'}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Add {cowName ?? `${count} cow${count === 1 ? '' : 's'}`} to a mob
          </DialogTitle>
          <DialogDescription>A cow is in one mob at a time. Cows already in another mob switch to this one.</DialogDescription>
        </DialogHeader>

        <ul className="grid gap-1">
          {mobs.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={savingId !== null}
                onClick={() => pick(m)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-default disabled:opacity-60"
              >
                <MobAvatar mob={m} />
                <span className="min-w-0 truncate font-medium">{m.name}</span>
                {savingId === m.id && <span className="ml-auto text-xs text-muted-foreground">Saving…</span>}
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
