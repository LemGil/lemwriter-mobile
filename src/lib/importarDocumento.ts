// src/lib/importarDocumento.ts
//
// Importación de documentos externos (diseño §4.2): Word .docx, PDF .pdf,
// texto .txt y Markdown .md se convierten al contenido del editor (HTML)
// y nacen como un proyecto nuevo en las carpetas de LemWriter Local.
// Todo ocurre en el teléfono, sin Internet.
//
// - .docx se convierte con mammoth (conserva títulos, negritas y listas
//   razonablemente); si trae títulos, cada título abre una sección.
// - .pdf entra como texto, igual que en el PC (se lee; no conserva la
//   maquetación): el texto de cada página forma una sección.
// - .txt entra tal cual, en una sola sección.
// - .md se convierte con el mismo conversor de las carpetas y se parte
//   por títulos si los trae.

import { markdownToHtml } from './folderStore'

export interface SeccionImportada {
  titulo: string
  html: string
}

export interface DocumentoImportado {
  titulo: string
  secciones: SeccionImportada[]
}

const EXTENSIONES_SOPORTADAS = ['docx', 'pdf', 'txt', 'md']

export function extensionDe(nombre: string): string {
  const i = nombre.lastIndexOf('.')
  return i >= 0 ? nombre.slice(i + 1).toLowerCase() : ''
}

export function esDocumentoSoportado(nombre: string): boolean {
  return EXTENSIONES_SOPORTADAS.includes(extensionDe(nombre))
}

/** Título del proyecto: el nombre del archivo sin la extensión. */
export function tituloDesdeNombre(nombre: string): string {
  const i = nombre.lastIndexOf('.')
  const base = (i > 0 ? nombre.slice(0, i) : nombre).trim()
  return base || 'Documento importado'
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Texto plano a párrafos del editor: bloques por línea en blanco. */
export function textoPlanoAHtml(texto: string): string {
  const bloques = texto
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
  if (bloques.length === 0) return '<p></p>'
  return bloques
    .map((b) => `<p>${escaparHtml(b).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Quita las etiquetas para leer el texto visible de un fragmento HTML. */
export function textoDeHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parte un HTML por sus títulos <h1>/<h2>: cada título abre una sección
 * con su nombre. Lo anterior al primer título va a una sección
 * «Introducción» (si trae texto). Sin títulos, una sola sección con el
 * título dado. Las secciones sin texto visible se descartan.
 */
export function dividirHtmlEnSecciones(html: string, tituloDefecto: string): SeccionImportada[] {
  const limpio = (html || '').trim()
  if (!limpio) return [{ titulo: tituloDefecto, html: '<p></p>' }]
  if (!/<h[12][\s>]/i.test(limpio)) {
    return [{ titulo: tituloDefecto, html: limpio }]
  }
  const partes = limpio.split(/(?=<h[12][\s>])/i).filter((p) => p.trim())
  const secciones: SeccionImportada[] = []
  for (const parte of partes) {
    const m = parte.match(/^<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)
    if (m) {
      const titulo = textoDeHtml(m[1]) || 'Sección'
      const cuerpo = parte.slice(m[0].length)
      if (textoDeHtml(cuerpo)) secciones.push({ titulo, html: cuerpo })
      else if (cuerpo.trim()) secciones.push({ titulo, html: '<p></p>' })
    } else if (textoDeHtml(parte)) {
      secciones.push({ titulo: 'Introducción', html: parte })
    }
  }
  return secciones.length > 0 ? secciones : [{ titulo: tituloDefecto, html: limpio }]
}

function leerArrayBuffer(datos: Blob): Promise<ArrayBuffer> {
  if (typeof (datos as any).arrayBuffer === 'function') return datos.arrayBuffer()
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(lector.result as ArrayBuffer)
    lector.onerror = () => rechazar(lector.error)
    lector.readAsArrayBuffer(datos)
  })
}

async function leerComoTexto(datos: Blob): Promise<string> {
  if (typeof (datos as any).text === 'function') return (datos as Blob).text()
  const buf = await leerArrayBuffer(datos)
  return new TextDecoder('utf-8').decode(buf)
}

async function convertirDocx(datos: Blob): Promise<string> {
  const mammoth = await import('mammoth')
  const ab = await leerArrayBuffer(datos)
  // La compilación web de mammoth lee {arrayBuffer}; su compilación de
  // escritorio (pruebas) lee {buffer}: se le dan las dos formas.
  const { value } = await mammoth.convertToHtml(
    { arrayBuffer: ab, buffer: new Uint8Array(ab) } as any,
    { styleMap: ['p[style-name^="Heading"] => h2:fresh', 'p[style-name="Title"] => h1:fresh'] }
  )
  return value || ''
}

async function extraerTextoPdf(datos: Blob): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = (worker as any).default ?? worker
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await leerArrayBuffer(datos)) }).promise
  const paginas: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n)
    const contenido = await pagina.getTextContent()
    let texto = ''
    for (const item of contenido.items as any[]) {
      texto += String(item?.str ?? '')
      texto += item?.hasEOL ? '\n' : ' '
    }
    paginas.push(texto.trim())
  }
  return paginas
}

/**
 * Convierte un archivo .docx/.pdf/.txt/.md en título + secciones listas
 * para guardarse como proyecto. Lanza un Error con mensaje amable si el
 * formato no se sostiene o el documento viene vacío.
 */
export async function convertirDocumento(
  archivo: { name: string; data: Blob }
): Promise<DocumentoImportado> {
  const ext = extensionDe(archivo.name)
  const titulo = tituloDesdeNombre(archivo.name)
  if (!EXTENSIONES_SOPORTADAS.includes(ext)) {
    throw new Error(`Formato no soportado: «${archivo.name}». Usa .docx, .pdf, .txt o .md.`)
  }
  let secciones: SeccionImportada[]
  if (ext === 'txt') {
    secciones = [{ titulo: 'Contenido', html: textoPlanoAHtml(await leerComoTexto(archivo.data)) }]
  } else if (ext === 'md') {
    const html = markdownToHtml(await leerComoTexto(archivo.data))
    secciones = dividirHtmlEnSecciones(html, 'Contenido')
  } else if (ext === 'docx') {
    const html = await convertirDocx(archivo.data)
    secciones = dividirHtmlEnSecciones(html, 'Contenido')
  } else {
    const paginas = await extraerTextoPdf(archivo.data)
    const conTexto = paginas.filter((p) => p.length > 0)
    if (conTexto.length === 0) {
      throw new Error('El PDF no trae texto que se pueda leer (puede ser un escaneo de imágenes).')
    }
    secciones = conTexto.map((p, i) => ({
      titulo: paginas.length > 1 ? `Página ${i + 1}` : 'Contenido',
      html: textoPlanoAHtml(p)
    }))
  }
  const hayTexto = secciones.some((s) => textoDeHtml(s.html).length > 0)
  if (!hayTexto) throw new Error('El documento se leyó, pero no trae texto aprovechable.')
  return { titulo, secciones }
}
