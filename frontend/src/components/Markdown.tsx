import ReactMarkdown from 'react-markdown'

/** Renders untrusted Markdown. Raw HTML is not rendered, so model text can't inject markup. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  )
}
