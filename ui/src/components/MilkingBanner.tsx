import { Milk } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Paddock } from '@/usePaddocks'
import type { MilkingSession, SessionCowStatus } from '@/useMilking'

type Props = {
  session: MilkingSession
  paddocks: Paddock[]
  onShow: () => void
}

export function MilkingBanner({ session, paddocks, onShow }: Props) {
  const shed = paddocks.find((p) => p.id === session.shed_id)?.name ?? 'the shed'
  const count = (status: SessionCowStatus) => session.cows.filter((c) => c.status === status).length
  const title = session.slot === 'morning' ? 'Morning milking' : session.slot === 'evening' ? 'Evening milking' : 'Milking'

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/85 px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl">
      <Milk className="size-4 shrink-0 animate-pulse text-teal-600" />
      <p className="min-w-0 flex-1 truncate">
        {title} in {shed} · {count('waiting')} waiting · {count('called')} walking in · {count('milking')} milking ·{' '}
        {count('done')} done
      </p>
      <Button variant="outline" size="sm" className="cursor-pointer" onClick={onShow}>
        Show
      </Button>
    </div>
  )
}
