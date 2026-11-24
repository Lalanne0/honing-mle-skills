import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="page">
      <h1>Page not found</h1>
      <p className="page__lead">
        There's nothing at this address. <Link to="/">Back to Practice</Link>
      </p>
    </section>
  )
}
