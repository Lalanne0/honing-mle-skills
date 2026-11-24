import type { ReactNode } from 'react'

type IntroPageProps = { title: string; children: ReactNode }

/** A page with just a title and a lead paragraph: the placeholders and the not-found page. */
export function IntroPage({ title, children }: IntroPageProps) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <p className="page__lead">{children}</p>
    </section>
  )
}
