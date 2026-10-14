// src/lib/__tests__/calloutTitulo.test.ts
//
// Regresión: el título del encabezado de los bloques ministeriales
// («> [!quote] Pasaje Bíblico») NO debe multiplicarse en cada ciclo
// guardar→abrir, y los títulos ya acumulados en los .md se sanean al abrir.

import { describe, it, expect } from 'vitest'
import { htmlToMarkdown, markdownToHtml } from '../folderStore'

const BLOQUE_BIBLIA =
  '<blockquote data-callout-type="biblia">' +
  '<p>Yo soy el Señor que os sacó de Egipto</p>' +
  '<p><strong>Lv 11:45 (RV1909)</strong></p>' +
  '</blockquote>'

describe('callouts: el título del encabezado no se multiplica', () => {
  it('ida y vuelta: no aparece ningún «Pasaje Bíblico» en el contenido', () => {
    const md = htmlToMarkdown(BLOQUE_BIBLIA)
    // El .md sí lleva el encabezado legible (estilo Obsidian)
    expect(md).toContain('> [!quote] Pasaje Bíblico')
    const html = markdownToHtml(md)
    expect(html).toContain('data-callout-type="biblia"')
    expect(html).toContain('Yo soy el Señor que os sacó de Egipto')
    expect(html).not.toContain('<p>Pasaje Bíblico</p>')
  })

  it('el ciclo es estable: dos vueltas no agregan líneas', () => {
    const una = markdownToHtml(htmlToMarkdown(BLOQUE_BIBLIA))
    const dos = markdownToHtml(htmlToMarkdown(una))
    expect(dos).toBe(una)
  })

  it('sanea los títulos acumulados por el defecto (archivos ya afectados)', () => {
    const mdAfectado =
      '> [!quote] Pasaje Bíblico\n' +
      '> Pasaje Bíblico\n' +
      '> Pasaje Bíblico\n' +
      '> Yo soy el Señor que os sacó de Egipto\n\n'
    const html = markdownToHtml(mdAfectado)
    expect(html).not.toContain('Pasaje Bíblico')
    expect(html).toContain('data-callout-type="biblia"')
    expect(html).toContain('Yo soy el Señor que os sacó de Egipto')
  })

  it('un título propio tras el marcador sí se conserva', () => {
    const md = '> [!quote] Mi pasaje favorito\n> Texto del versículo\n\n'
    const html = markdownToHtml(md)
    expect(html).toContain('Mi pasaje favorito')
    expect(html).toContain('Texto del versículo')
  })

  it('vale para los cuatro tipos de bloque', () => {
    const casos = [
      { tipo: 'biblia', marcador: 'quote', titulo: 'Pasaje Bíblico' },
      { tipo: 'idea', marcador: 'idea', titulo: 'Idea / Ilustración' },
      { tipo: 'aplicacion', marcador: 'tip', titulo: 'Aplicación Práctica' },
      { tipo: 'nota', marcador: 'note', titulo: 'Nota Ministerial' },
    ]
    for (const { tipo, marcador, titulo } of casos) {
      const html = `<blockquote data-callout-type="${tipo}"><p>Contenido</p></blockquote>`
      const vuelta = markdownToHtml(htmlToMarkdown(html))
      expect(vuelta).toContain(`data-callout-type="${tipo}"`)
      expect(vuelta).toContain('Contenido')
      expect(vuelta).not.toContain(`<p>${titulo}</p>`)
      // saneamiento de un .md ya afectado
      const mdAfectado = `> [!${marcador}] ${titulo}\n> ${titulo}\n> Contenido\n\n`
      const saneado = markdownToHtml(mdAfectado)
      expect(saneado).not.toContain(titulo)
      expect(saneado).toContain('Contenido')
    }
  })

  it('un blockquote sin tipo sigue funcionando igual', () => {
    const html = markdownToHtml('> Una cita simple\n> en dos líneas\n\n')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('Una cita simple')
  })
})
