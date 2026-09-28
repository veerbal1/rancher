import { CreateFarmerDialog } from './CreateFarmerDialog'
import { FarmerSelect } from './FarmerSelect'

export type Farmer = { id: string; name: string }

type Props = {
  farmers: Farmer[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
}

export function FarmersSection({ farmers, selectedId, onSelect, onCreate }: Props) {
  return (
    <section className="flex items-center gap-3">
      <h2 className="text-sm font-semibold">Farmers</h2>

      <div className="min-w-0 flex-1">
        {farmers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No farmers yet.</p>
        ) : (
          <FarmerSelect farmers={farmers} value={selectedId} onChange={onSelect} />
        )}
      </div>

      <CreateFarmerDialog onCreate={onCreate} />
    </section>
  )
}
