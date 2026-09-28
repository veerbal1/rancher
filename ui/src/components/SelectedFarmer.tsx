import type { Farmer } from './FarmersSection'

export function SelectedFarmer({ farmer }: { farmer: Farmer }) {
  return (
    <p className="truncate text-sm text-muted-foreground">
      Selected: <span className="font-medium text-foreground">{farmer.name}</span>
    </p>
  )
}
