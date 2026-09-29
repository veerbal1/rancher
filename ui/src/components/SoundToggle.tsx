import { Volume2, VolumeX } from 'lucide-react'

type Props = {
  on: boolean
  onChange: (on: boolean) => void
}

export function SoundToggle({ on, onChange }: Props) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Mute cue sounds' : 'Play cue sounds'}
      title={on ? 'Mute cue sounds' : 'Play cue sounds'}
      onClick={() => onChange(!on)}
      className="fixed top-20 left-4 z-10 grid size-12 cursor-pointer place-items-center rounded-2xl border border-white/60 bg-white/80 text-foreground shadow-lg backdrop-blur-xl"
    >
      {on ? <Volume2 className="size-5" /> : <VolumeX className="size-5 text-muted-foreground" />}
    </button>
  )
}
