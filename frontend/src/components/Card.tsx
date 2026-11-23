import { useId, type ReactNode } from 'react'

type CardProps = { title: string; children: ReactNode }

export function Card({ title, children }: CardProps) {
  const titleId = useId()
  return (
    <section className="card" aria-labelledby={titleId}>
      <h3 id={titleId} className="card__title">
        {title}
      </h3>
      {children}
    </section>
  )
}
