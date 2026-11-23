import type { ReactNode } from 'react'

type ChipProps = { selected: boolean; onSelect: () => void; children: ReactNode }

export function Chip({ selected, onSelect, children }: ChipProps) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onSelect}>
      {children}
    </button>
  )
}
