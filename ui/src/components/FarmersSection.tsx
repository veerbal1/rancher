import { CreateFarmerDialog } from './CreateFarmerDialog'

export type Farmer = { id: string; name: string }

type Props = {
  farmers: Farmer[]
  onCreate: (name: string) => void
}

export function FarmersSection({ farmers, onCreate }: Props) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Farmers</h2>
        <CreateFarmerDialog onCreate={onCreate} />
      </div>

      {farmers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No farmers yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {farmers.map((f) => (
            <li key={f.id} className="rounded-lg bg-white/60 px-3 py-2 text-sm">
              {f.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
