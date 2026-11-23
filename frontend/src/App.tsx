import { useEffect, useState } from 'react'

type Health = 'checking' | 'ok' | 'unreachable'

async function fetchHealth(): Promise<Health> {
  try {
    const response = await fetch('/api/health')
    const body: unknown = await response.json()
    return (body as { status?: unknown }).status === 'ok' ? 'ok' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

function App() {
  const [health, setHealth] = useState<Health>('checking')

  useEffect(() => {
    void fetchHealth().then(setHealth)
  }, [])

  return (
    <main>
      <h1>honing-mle-skills</h1>
      <p>Backend: {health}</p>
    </main>
  )
}

export default App
