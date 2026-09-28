import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Paddock } from '@/usePaddocks'
import type { Overlap } from '@/map/overlap'

function formatArea(m2: number) {
  return m2 >= 100 ? `${(m2 / 10_000).toFixed(2)} ha` : `${Math.round(m2)} m²`
}

type Props = {
  paddocks: Paddock[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  canAdd: boolean
  drawing: boolean
  hasDraft: boolean
  overlaps: Overlap[]
  onStartDrawing: () => void
  onCancelDrawing: () => void
  onDiscardDraft: () => void
  onSaveDraft: () => Promise<void>
}

export function PaddocksSection({
  paddocks,
  selectedId,
  onSelect,
  canAdd,
  drawing,
  hasDraft,
  overlaps,
  onStartDrawing,
  onCancelDrawing,
  onDiscardDraft,
  onSaveDraft,
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

  const discard = () => {
    setError('')
    onDiscardDraft()
  }

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Paddocks</h2>
        {drawing ? (
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onCancelDrawing}>
            Cancel
          </Button>
        ) : hasDraft ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="cursor-pointer" disabled={saving} onClick={discard}>
              Discard
            </Button>
            <Button size="sm" className="cursor-pointer" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : overlaps.length > 0 ? 'Save anyway' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button size="sm" className="cursor-pointer" disabled={!canAdd} onClick={onStartDrawing}>
            Add paddock
          </Button>
        )}
      </div>

      {drawing && (
        <p className="text-sm text-muted-foreground">
          Click on the map to add corners. Edges can't cross. Click the first corner, double-click, or press Enter to finish.
        </p>
      )}
      {hasDraft && <p className="text-sm text-muted-foreground">New paddock drawn.</p>}
      {hasDraft && overlaps.length > 0 && (
        <p className="flex gap-2 rounded-lg bg-amber-100/80 px-3 py-2 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Overlaps {overlaps.map((o) => `${o.name} (${formatArea(o.areaM2)})`).join(', ')}.
          </span>
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!canAdd && <p className="text-sm text-muted-foreground">Select a farmer to add paddocks.</p>}

      {paddocks.length > 0 && (
        <ul className="grid gap-1.5">
          {paddocks.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id === selectedId ? null : p.id)}
                className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                  p.id === selectedId ? 'bg-primary/10 ring-1 ring-primary' : 'bg-white/60 hover:bg-white/80'
                }`}
              >
                <span>{p.name}</span>
                <span className="text-muted-foreground">{p.area_ha} ha</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
