import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { ListaNumerada } from '../../utils/listaNumerada'
import { htmlToMarkdown, markdownToHtml } from '../folderStore'

function crearEditor(content: string) {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ blockquote: false, orderedList: false, link: false, underline: false }),
      ListaNumerada,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content,
  })
}

// Regresión del reporte de LemGil (2026-10-09): «Tx no funciona» y
// «A,B,C - a,b,c no existen» en la app Local.
describe('Editor: Tx y numeración con letras (regresión 2026-10-09)', () => {
  it('Tx limpia también títulos y listas, no solo negritas', () => {
    const editor = crearEditor(
      '<h2><strong>Encabezado</strong></h2>' +
        '<ol data-list-style="upper-alpha"><li><p><strong>Uno</strong></p></li><li><p>Dos</p></li></ol>' +
        '<p><span style="color: #F87171">con color</span></p>'
    )
    editor.commands.selectAll()
    editor.chain().clearNodes().unsetAllMarks().unsetTextAlign().run()
    const html = editor.getHTML()
    expect(html).not.toContain('<strong>')
    expect(html).not.toContain('<h2')
    expect(html).not.toContain('<ol')
    expect(html).not.toContain('style=')
    expect(html).toContain('Encabezado')
    expect(html).toContain('Uno')
    editor.destroy()
  })

  it('la numeración A,B,C sobrevive guardar (.md) y reabrir', () => {
    const editor = crearEditor('<p>Primero</p><p>Segundo</p><p>Tercero</p>')
    editor.commands.selectAll()
    editor.chain().toggleOrderedList().run()
    editor.chain().updateAttributes('orderedList', { listStyle: 'upper-alpha' as never }).run()
    const html = editor.getHTML()
    expect(html).toContain('data-list-style="upper-alpha"')
    const md = htmlToMarkdown(html)
    expect(md).toContain('A. Primero')
    expect(md).toContain('B. Segundo')
    expect(md).toContain('C. Tercero')
    expect(markdownToHtml(md)).toContain('data-list-style="upper-alpha"')
    editor.destroy()
  })

  it('la numeración a,b,c sobrevive guardar (.md) y reabrir', () => {
    const md = htmlToMarkdown('<ol data-list-style="lower-alpha"><li>Uno</li><li>Dos</li></ol>')
    expect(md).toContain('a. Uno')
    expect(md).toContain('b. Dos')
    expect(markdownToHtml(md)).toContain('data-list-style="lower-alpha"')
  })

  it('la numeración I,II,III sobrevive guardar (.md) y reabrir', () => {
    const md = htmlToMarkdown('<ol data-list-style="upper-roman"><li>Uno</li><li>Dos</li><li>Tres</li></ol>')
    expect(md).toContain('I. Uno')
    expect(md).toContain('II. Dos')
    expect(md).toContain('III. Tres')
    expect(markdownToHtml(md)).toContain('data-list-style="upper-roman"')
  })

  it('la lista 1,2,3 de siempre no cambia', () => {
    const md = htmlToMarkdown('<ol><li>Uno</li><li>Dos</li></ol>')
    expect(md).toContain('1. Uno')
    expect(markdownToHtml(md)).toBe('<ol><li>Uno</li><li>Dos</li></ol>')
  })

  it('un renglón suelto que empieza con «A.» no se vuelve lista', () => {
    const html = markdownToHtml('A. La fe obra por el amor.\n\nOtro párrafo.')
    expect(html).not.toContain('<ol')
    expect(html).toContain('A. La fe obra por el amor.')
  })
})
