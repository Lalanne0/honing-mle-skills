import { markdown } from '@codemirror/lang-markdown'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { minimalSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

type MarkdownEditorProps = {
  /** Read once when the editor mounts; give the component a new `key` to start over. */
  initialValue: string
  onChange: (value: string) => void
  label: string
  /** While true the text can't be changed, for example while it is being graded. */
  readOnly?: boolean
}

const editable = (readOnly: boolean) => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]

/** A CodeMirror 6 Markdown editor. It owns its text and reports every edit. */
export function MarkdownEditor({ initialValue, onChange, label, readOnly = false }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const editability = useRef(new Compartment())
  const latest = useRef({ initialValue, onChange, label, readOnly })
  useEffect(() => {
    latest.current.onChange = onChange
  })

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current as HTMLDivElement,
      state: EditorState.create({
        doc: latest.current.initialValue,
        extensions: [
          minimalSetup,
          editability.current.of(editable(latest.current.readOnly)),
          markdown(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': latest.current.label, 'aria-multiline': 'true' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    return () => editor.destroy()
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: editability.current.reconfigure(editable(readOnly)) })
  }, [readOnly])

  return <div ref={host} className="editor" />
}
