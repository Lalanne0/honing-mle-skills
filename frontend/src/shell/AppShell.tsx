import { Link, NavLink, Outlet } from 'react-router'
import './shell.css'

const NAV = [
  { to: '/', label: 'Practice' },
  { to: '/history', label: 'History' },
]

/** The shared header and navigation around every page except the /design demo. */
export function AppShell() {
  return (
    <div className="shell">
      <header className="shell__header">
        <Link to="/" className="shell__brand" aria-label="honing-mle-skills home">
          honing<span className="shell__brand-tail">-mle-skills</span>
        </Link>
        <nav aria-label="Main">
          <ul className="shell__nav">
            {NAV.map(({ to, label }) => (
              <li key={to}>
                <NavLink to={to} end className="shell__link">
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  )
}
