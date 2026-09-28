import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
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

export function CreateFarmerDialog({ onCreate }: { onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="Add farmer"
            className="grid size-9 cursor-pointer place-items-center rounded-full border border-white/70 bg-white/60 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur-md transition hover:bg-white/80 active:scale-95"
          />
        }
      >
        <Plus className="size-4" />
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New farmer</DialogTitle>
            <DialogDescription>Add a farmer to start mapping their paddocks.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="farmer-name">Name</Label>
            <Input
              id="farmer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aroha Farms"
              autoFocus
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
