import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Paddock } from '@/usePaddocks'

type Props = {
  paddocks: Paddock[]
  canAdd: boolean
  drawing: boolean
  hasDraft: boolean
  onStartDrawing: () => void
  onCancelDrawing: () => void
  onDiscardDraft: () => void
  onSaveDraft: () => Promise<void>
}

export function PaddocksSection({
  paddocks,
  canAdd,
  drawing,
  hasDraft,
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
              {saving ? 'Saving…' : 'Save'}
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
          Click on the map to add corners. Click the first corner, double-click, or press Enter to finish.
        </p>
      )}
      {hasDraft && <p className="text-sm text-muted-foreground">New paddock drawn.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!canAdd && <p className="text-sm text-muted-foreground">Select a farmer to add paddocks.</p>}

      {paddocks.length > 0 && (
        <ul className="grid gap-1.5">
          {paddocks.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 text-sm">
              <span>{p.name}</span>
              <span className="text-muted-foreground">{p.area_ha} ha</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
