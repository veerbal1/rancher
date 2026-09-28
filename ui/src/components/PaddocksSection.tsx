import { Button } from '@/components/ui/button'

type Props = {
  canAdd: boolean
  drawing: boolean
  hasDraft: boolean
  onStartDrawing: () => void
  onCancelDrawing: () => void
  onDiscardDraft: () => void
}

export function PaddocksSection({ canAdd, drawing, hasDraft, onStartDrawing, onCancelDrawing, onDiscardDraft }: Props) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Paddocks</h2>
        {drawing ? (
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onCancelDrawing}>
            Cancel
          </Button>
        ) : hasDraft ? (
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onDiscardDraft}>
            Discard
          </Button>
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
      {!canAdd && <p className="text-sm text-muted-foreground">Select a farmer to add paddocks.</p>}
    </section>
  )
}
