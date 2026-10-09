// src/lib/__tests__/compartirImagen.test.ts
//
// Pruebas de «Compartir como imagen / PDF»: el documento visual que se
// dibuja y el PDF por páginas. Solo se prueba la lógica pura (el dibujo
// en canvas se comprueba en el teléfono).

import { describe, it, expect } from 'vitest'
import { construirDocumentoCompartible, construirPdfPaginas } from '../compartirImagen'

describe('compartirImagen: documento visual de la sección', () => {
  it('lleva el título, el contenido y los estilos de numeración', () => {
    const doc = construirDocumentoCompartible(
      'Los tres frutos',
      '<ol data-list-style="upper-roman"><li>Pensamientos</li><li>Palabras</li></ol>' +
        '<p>La fe <strong>obra</strong> por el amor.</p>'
    )
    expect(doc).toContain('Los tres frutos')
    expect(doc).toContain('data-list-style="upper-roman"')
    expect(doc).toContain('list-style-type:upper-roman')
    expect(doc).toContain('list-style-type:upper-alpha')
    expect(doc).toContain('list-style-type:lower-alpha')
    expect(doc).toContain('#0A1A31')
  })

  it('quita las imágenes (no viajan en la tarjeta) y escapa el título', () => {
    const doc = construirDocumentoCompartible(
      'Fe <b>&</b> obras',
      '<p>Texto</p><img src="foto.jpg"><p>Fin</p>'
    )
    expect(doc).not.toContain('<img')
    expect(doc).toContain('Fe &lt;b&gt;&amp;&lt;/b&gt; obras')
    expect(doc).toContain('Fin')
  })
})

describe('compartirImagen: PDF por páginas', () => {
  const jpegFalso = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])

  it('arma un PDF válido con el número de páginas dado', () => {
    const pdf = construirPdfPaginas([
      { datos: jpegFalso, ancho: 1080, alto: 1527 },
      { datos: jpegFalso, ancho: 1080, alto: 1527 },
    ])
    const texto = new TextDecoder('latin1').decode(pdf)
    expect(texto.startsWith('%PDF-1.4')).toBe(true)
    expect(texto).toContain('/Count 2')
    expect(texto).toContain('/MediaBox [0 0 595.28 841.89]')
    expect(texto).toContain('/Filter /DCTDecode')
    expect(texto.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(texto).toContain('startxref')
  })

  it('sin páginas, avisa en vez de armar un PDF vacío', () => {
    expect(() => construirPdfPaginas([])).toThrow()
  })
})
