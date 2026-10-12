import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { LngLat } from '@/map/geo'
import type { Raceway } from '@/useRaceways'

function lengthM(path: LngLat[]) {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]]
    const k = 111320 * Math.cos((a[1] * Math.PI) / 180)
    total += Math.hypot((b[0] - a[0]) * k, (b[1] - a[1]) * 111320)
  }
  return Math.round(total)
}

type Props = {
  raceways: Raceway[]
  canAdd: boolean
  drawing: boolean
  draft: LngLat[] | null
  width: number
  onWidthChange: (width: number) => void
  onStartDrawing: () => void
  onCancelDrawing: () => void
  onDiscardDraft: () => void
  onSaveDraft: () => Promise<void>
  onDelete: (raceway: Raceway) => Promise<void>
}

export function RacewaysSection({
  raceways,
  canAdd,
  drawing,
  draft,
  width,
  onWidthChange,
  onStartDrawing,
  onCancelDrawing,
  onDiscardDraft,
  onSaveDraft,
  onDelete,
}: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSaveDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: Raceway) => {
    try {
      await onDelete(r)
    } catch (err) {
      toast.error('Could not delete the raceway', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Raceways</h2>
        {drawing ? (
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onCancelDrawing}>
            Cancel
          </Button>
        ) : draft ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              disabled={saving}
              onClick={() => {
                setError('')
                onDiscardDraft()
              }}
            >
              Discard
            </Button>
            <Button size="sm" className="cursor-pointer" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button size="sm" className="cursor-pointer" disabled={!canAdd} onClick={onStartDrawing}>
            Add raceway
          </Button>
        )}
      </div>

      {drawing && (
        <p className="text-sm text-muted-foreground">
          Click along the middle of the track. Points snap to corners, fences and other raceways. Click the last point again or press Enter to finish.
        </p>
      )}
      {draft && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">New raceway · {lengthM(draft)} m long</span>
          <label className="flex items-center gap-1.5">
            <Input
              type="number"
              min={3}
              max={15}
              step={0.5}
              value={width}
              onChange={(e) => onWidthChange(Number(e.target.value))}
              className="h-7 w-16"
            />
            <span className="text-muted-foreground">m wide</span>
          </label>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {raceways.length > 0 && (
        <ul className="grid gap-1.5">
          {raceways.map((r, i) => (
            <li key={r.id} className="group flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 text-sm">
              <span>Raceway {i + 1}</span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {lengthM(r.path.coordinates)} m · {r.width_m} m wide
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="cursor-pointer opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  onClick={() => remove(r)}
                  aria-label={`Delete raceway ${i + 1}`}
                >
                  <Trash2 />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
