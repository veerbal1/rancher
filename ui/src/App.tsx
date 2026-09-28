import { useEffect, useState } from 'react'

type Cow = {
  sim_id: string
  seq: number
  time: string
  cow_id: string
  x: number
  y: number
  state: string
  level: string
}

const API_URL = import.meta.env.VITE_API_URL

const COLORS: Record<string, string> = {
  inside: '#2e9e5b',
  warning: '#e0a100',
  breached: '#d64545',
}

function App() {
  const [cows, setCows] = useState<Cow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}?farm=sim-1`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setCows(await res.json())
        setError('')
      } catch (e) {
        setError(String(e))
      }
    }

    load()
    const id = setInterval(load, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <main>
      <h1>sim-1: {cows.length} cows</h1>
      {error && <p>{error}</p>}

      {/* Fence is 0..100 m; the extra 50 m around it shows cows that got out. */}
      <svg viewBox="-50 -50 200 200" style={{ width: '100%', maxWidth: 600, background: '#f4f1e8' }}>
        <rect x={0} y={0} width={100} height={100} fill="#dcebc8" stroke="#6b4f2a" strokeWidth={1} />
        {/* warning zone starts 10 m inside the fence */}
        <rect x={10} y={10} width={80} height={80} fill="none" stroke="#6b4f2a" strokeWidth={0.3} strokeDasharray="2 2" />
        {cows.map((c) => (
          <circle
            key={c.cow_id}
            cx={c.x}
            cy={100 - c.y} // sim y points north, SVG y points down
            r={1.8}
            fill={COLORS[c.state] ?? '#888'}
            style={{ transition: 'cx 1s linear, cy 1s linear' }}
          >
            <title>{`${c.cow_id} · ${c.state}/${c.level}`}</title>
          </circle>
        ))}
      </svg>

      <ul>
        {cows.map((c) => (
          <li key={c.cow_id}>
            {c.cow_id} ({c.x.toFixed(1)}, {c.y.toFixed(1)}) {c.state}/{c.level} · seq {c.seq}
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
