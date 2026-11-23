export type Page = 'app' | 'design'

export function pageFor(pathname: string): Page {
  return pathname.replace(/\/$/, '') === '/design' ? 'design' : 'app'
}
