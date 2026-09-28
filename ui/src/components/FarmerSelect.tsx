import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Farmer } from '@/useFarmers'

type Props = {
  farmers: Farmer[]
  value: string | null
  onChange: (id: string | null) => void
}

export function FarmerSelect({ farmers, value, onChange }: Props) {
  const items = farmers.map((f) => ({ label: f.name, value: f.id }))

  return (
    <Select items={items} value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full cursor-pointer bg-white/60">
        <SelectValue placeholder="Select a farmer" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
