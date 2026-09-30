import { useEffect, useRef } from 'react'
import type { MapRef } from '@vis.gl/react-maplibre'
import type { Cow } from './useCows'

const MOO_EVERY_S = { grazing: [25, 40], moving: [25, 40] }
const BELL_VOLUME = 0.1
const MOO_VOLUME = 0.1

const between = ([min, max]: number[]) => min + Math.random() * (max - min)
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const nearness = (zoom: number) => clamp((zoom - 13) / 5, 0.1, 1)

async function load(ctx: AudioContext, url: string) {
  const res = await fetch(url)
  return ctx.decodeAudioData(await res.arrayBuffer())
}

export function useFarmSounds(map: MapRef | undefined, cows: Cow[], enabled: boolean) {
  const herd = useRef(cows)

  useEffect(() => {
    herd.current = cows
  }, [cows])

  useEffect(() => {
    if (!enabled || !map) return

    const ctx = new AudioContext()
    const bellGain = ctx.createGain()
    bellGain.gain.value = 0
    bellGain.connect(ctx.destination)

    let moo: AudioBuffer | null = null
    let mooTimer = 0
    let stopped = false

    const moving = () => herd.current.some((c) => c.state === 'moving')

    const updateBells = () => {
      const n = herd.current.length
      const level = n === 0 ? 0 : nearness(map.getZoom()) * Math.min(1, 0.3 + n / 10) * (moving() ? 0.6 : 0.2) * BELL_VOLUME
      bellGain.gain.setTargetAtTime(level, ctx.currentTime, 0.8)
    }

    const playMoo = () => {
      const cows = herd.current
      if (moo && cows.length > 0) {
        const cow = cows[Math.floor(Math.random() * cows.length)]
        const { x, y } = map.project([cow.lng, cow.lat])
        const { clientWidth: w, clientHeight: h } = map.getContainer()
        const onScreen = x >= 0 && x <= w && y >= 0 && y <= h

        const source = ctx.createBufferSource()
        source.buffer = moo
        source.playbackRate.value = between([0.85, 1.12])
        const gain = ctx.createGain()
        gain.gain.value = nearness(map.getZoom()) * (onScreen ? 0.7 : 0.25) * between([0.7, 1]) * MOO_VOLUME
        const pan = ctx.createStereoPanner()
        pan.pan.value = clamp((x / w) * 2 - 1, -1, 1) * 0.8
        source.connect(gain).connect(pan).connect(ctx.destination)
        source.start()
      }
      mooTimer = window.setTimeout(playMoo, between(moving() ? MOO_EVERY_S.moving : MOO_EVERY_S.grazing) * 1000)
    }

    Promise.all([load(ctx, '/cow-bell.mp3'), load(ctx, '/cow-mow.mp3')]).then(([bellBuffer, mooBuffer]) => {
      if (stopped) return
      const bells = ctx.createBufferSource()
      bells.buffer = bellBuffer
      bells.loop = true
      bells.connect(bellGain)
      bells.start()
      moo = mooBuffer
      updateBells()
      mooTimer = window.setTimeout(playMoo, 3000)
    })

    const bellTimer = window.setInterval(updateBells, 500)
    return () => {
      stopped = true
      window.clearTimeout(mooTimer)
      window.clearInterval(bellTimer)
      ctx.close()
    }
  }, [map, enabled])
}
