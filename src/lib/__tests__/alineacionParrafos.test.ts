// src/lib/__tests__/alineacionParrafos.test.ts
//
// Regresión: la alineación (justificar/centrar/derecha) que pone el editor
// NO debe perderse en el ciclo guardar→abrir de la app Local. El .md la
// conserva con un marcador discreto: «<!-- alinear: justify -->».

import { describe, it, expect } from 'vitest'
import { htmlToMarkdown, markdownToHtml } from '../folderStore'

describe('alineación: el .md conserva justificar/centrar/derecha', () => {
  it('al guardar, el párrafo justificado lleva el marcador', () => {
    const md = htmlToMarkdown('<p style="text-align: justify">Mi párrafo justificado.</p>')
    expect(md).toContain('Mi párrafo justificado. <!-- alinear: justify -->')
  })

  it('al guardar, el párrafo sin alinear no lleva marcador', () => {
    const md = htmlToMarkdown('<p>Mi párrafo normal.</p>')
    expect(md).toBe('Mi párrafo normal.')
    expect(md).not.toContain('alinear')
  })

  it('«left» no se marca (es el valor por defecto)', () => {
    const md = htmlToMarkdown('<p style="text-align: left">A la izquierda.</p>')
    expect(md).not.toContain('alinear')
  })

  it('al abrir, el marcador se convierte en style y no queda texto visible', () => {
    const html = markdownToHtml('Mi párrafo justificado. <!-- alinear: justify -->')
    expect(html).toContain('<p style="text-align: justify">Mi párrafo justificado.</p>')
    expect(html).not.toContain('alinear')
  })

  it('centrar y derecha también viajan', () => {
    expect(markdownToHtml('Título. <!-- alinear: center -->')).toContain(
      '<p style="text-align: center">Título.</p>'
    )
    expect(markdownToHtml('Firma. <!-- alinear: right -->')).toContain(
      '<p style="text-align: right">Firma.</p>'
    )
  })

  it('los encabezados conservan su alineación', () => {
    const md = htmlToMarkdown('<h2 style="text-align: center">Mi título</h2>')
    expect(md).toContain('## Mi título <!-- alinear: center -->')
    const html = markdownToHtml(md)
    expect(html).toContain('<h2 style="text-align: center">Mi título</h2>')
  })

  it('el ciclo es estable: dos vueltas no agregan ni quitan nada', () => {
    const html = '<p style="text-align: justify">Uno.</p><p>Dos.</p>'
    const una = markdownToHtml(htmlToMarkdown(html))
    const dos = markdownToHtml(htmlToMarkdown(una))
    expect(dos).toBe(una)
    expect(una).toContain('<p style="text-align: justify">Uno.</p>')
    expect(una).toContain('<p>Dos.</p>')
  })

  it('dentro de un bloque el marcador tampoco se ve ni se duplica', () => {
    const html =
      '<blockquote data-callout-type="biblia">' +
      '<p style="text-align: justify">Yo soy el Señor</p>' +
      '</blockquote>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('> Yo soy el Señor <!-- alinear: justify -->')
    const abierto = markdownToHtml(md)
    expect(abierto).toContain('<p style="text-align: justify">Yo soy el Señor</p>')
    expect(abierto).not.toContain('alinear:')
    // Y el ciclo no acumula marcadores
    const md2 = htmlToMarkdown(abierto)
    expect(md2).toBe(md)
  })
})
