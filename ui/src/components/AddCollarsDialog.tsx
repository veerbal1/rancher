import { useState, type FormEvent } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MAX_PER_PURCHASE = 100

type Props = {
  disabled: boolean
  onAdd: (count: number) => Promise<void>
}

export function AddCollarsDialog({ disabled, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState('5')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const n = Number(count)
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_PER_PURCHASE

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) setError('')
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await onAdd(n)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button size="sm" className="cursor-pointer" disabled={disabled} />}>
        Add collars
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add collars</DialogTitle>
            <DialogDescription>
              Register collars the farmer has bought. They're numbered after the existing ones.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="collar-count">How many?</Label>
            <Input
              id="collar-count"
              type="number"
              min={1}
              max={MAX_PER_PURCHASE}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              onFocus={(e) => e.target.select()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Up to {MAX_PER_PURCHASE} at a time.</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={!valid || saving}>
              {saving ? 'Adding…' : valid ? `Add ${n} collar${n === 1 ? '' : 's'}` : 'Add collars'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
