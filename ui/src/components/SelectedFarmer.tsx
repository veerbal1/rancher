import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Farmer } from '@/useFarmers'

type Props = {
  farmer: Farmer
  drawing: boolean
  hasDraft: boolean
  onStartDrawing: () => void
  onCancelDrawing: () => void
  onDiscardDraft: () => void
  onSaveDraft: () => Promise<void>
}

export function SelectedFarmer({ farmer, drawing, hasDraft, onStartDrawing, onCancelDrawing, onDiscardDraft, onSaveDraft }: Props) {
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

  const status = drawing ? 'Click the corners, then the first one to close' : hasDraft ? 'New farm boundary' : farmer.boundary ? 'Farm boundary set' : 'No farm boundary yet'

  return (
    <div className="grid gap-2">
      <p className="truncate text-sm text-muted-foreground">
        Selected: <span className="font-medium text-foreground">{farmer.name}</span>
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">{status}</p>
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
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onStartDrawing}>
            {farmer.boundary ? 'Redraw boundary' : 'Draw boundary'}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
