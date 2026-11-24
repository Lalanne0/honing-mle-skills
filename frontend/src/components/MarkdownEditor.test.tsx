import { EditorView } from '@codemirror/view'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from './MarkdownEditor'

function viewOf(container: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)
  if (!view) throw new Error('no editor')
  return view
}

describe('MarkdownEditor', () => {
  it('starts from the initial value, as a labelled multi-line textbox', () => {
    const { container } = render(<MarkdownEditor initialValue="# Draft" onChange={() => {}} label="Your answer" />)

    const textbox = screen.getByRole('textbox', { name: 'Your answer' })
    expect(textbox).toHaveAttribute('aria-multiline', 'true')
    expect(viewOf(container).state.doc.toString()).toBe('# Draft')
  })

  it('reports every edit with the whole text', () => {
    const onChange = vi.fn()
    const { container } = render(<MarkdownEditor initialValue="a" onChange={onChange} label="Your answer" />)

    act(() => viewOf(container).dispatch({ changes: { from: 1, insert: 'b' } }))

    expect(onChange).toHaveBeenLastCalledWith('ab')
  })

  it('can be made read-only and editable again', () => {
    const { container, rerender } = render(
      <MarkdownEditor initialValue="" onChange={() => {}} label="Your answer" readOnly />,
    )
    expect(viewOf(container).state.readOnly).toBe(true)
    expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'false')

    rerender(<MarkdownEditor initialValue="" onChange={() => {}} label="Your answer" />)

    expect(viewOf(container).state.readOnly).toBe(false)
    expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'true')
  })

  it('stops the editor when it goes away', () => {
    const { container, unmount } = render(<MarkdownEditor initialValue="" onChange={() => {}} label="Your answer" />)
    const view = viewOf(container)
    const destroy = vi.spyOn(view, 'destroy')

    unmount()

    expect(destroy).toHaveBeenCalledOnce()
  })
})
