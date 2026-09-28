import { useState, type FormEvent } from 'react'
import { MapPin, Plus } from 'lucide-react'
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
import type { Location } from '@/useFarmers'

type Props = {
  getLocation: () => Location | null
  onCreate: (name: string, location: Location) => Promise<void>
}

export function CreateFarmerDialog({ getLocation, onCreate }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState<Location | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) setLocation(getLocation())
    else setError('')
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !location) return
    setSaving(true)
    setError('')
    try {
      await onCreate(trimmed, location)
      setName('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
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

          <div className="grid gap-2">
            <Label>Location</Label>
            <div className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
              <MapPin className="mt-0.5 size-4 text-primary" />
              <div>
                <p>Map centre</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Map not ready'}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Move the map to the farm before creating.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={!name.trim() || !location || saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
