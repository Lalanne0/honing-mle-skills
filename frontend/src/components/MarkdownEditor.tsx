import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { minimalSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

type MarkdownEditorProps = {
  /** Read once when the editor mounts; give the component a new `key` to start over. */
  initialValue: string
  onChange: (value: string) => void
  label: string
}

/** A CodeMirror 6 Markdown editor. It owns its text and reports every edit. */
export function MarkdownEditor({ initialValue, onChange, label }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef({ initialValue, onChange, label })
  useEffect(() => {
    latest.current.onChange = onChange
  })

  useEffect(() => {
    const view = new EditorView({
      parent: host.current as HTMLDivElement,
      state: EditorState.create({
        doc: latest.current.initialValue,
        extensions: [
          minimalSetup,
          markdown(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': latest.current.label, 'aria-multiline': 'true' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    return () => view.destroy()
  }, [])

  return <div ref={host} className="editor" />
}
