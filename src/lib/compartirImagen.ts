// src/lib/compartirImagen.ts
//
// Compartir una sección como IMAGEN (PNG) y como PDF: la sección se dibuja
// tal como se ve (colores, resaltado, títulos, numeración I/A/a) sobre una
// tarjeta azul marino y dorada. Sin Internet y sin librerías nuevas: el
// propio navegador dibuja el HTML en un lienzo.
//
// Honestidad del formato: en la imagen y en el PDF el texto queda «dibujado»
// (se lee y se imprime igual, pero no se puede copiar); para copiar el
// texto está la opción «Texto» de compartirSeccion.ts.

import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// ─── Documento visual de la sección (HTML autocontenido para dibujar) ────────

export function construirDocumentoCompartible(titulo: string, html: string): string {
  const cuerpo = (html || '').replace(/<img[^>]*>/gi, '')
  const tituloSeguro = (titulo || 'Sección')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<div xmlns="http://www.w3.org/1999/xhtml" style="width:1080px;background:#0A1A31;color:#F5F1E8;font-family:Georgia,'Times New Roman',serif;padding:72px 76px;box-sizing:border-box;">
<style>
h1{font-size:42px;color:#DFBE72;margin:26px 0 14px;line-height:1.25}
h2{font-size:38px;color:#DFBE72;margin:24px 0 12px;line-height:1.25}
h3{font-size:33px;color:#EFE3BC;margin:20px 0 10px;line-height:1.3}
h4{font-size:30px;color:#EFE3BC;margin:18px 0 8px}
p{font-size:30px;line-height:1.6;margin:0 0 16px}
ul,ol{font-size:30px;line-height:1.6;margin:0 0 16px;padding-left:52px}
ol[data-list-style="upper-roman"]{list-style-type:upper-roman}
ol[data-list-style="lower-roman"]{list-style-type:lower-roman}
ol[data-list-style="upper-alpha"]{list-style-type:upper-alpha}
ol[data-list-style="lower-alpha"]{list-style-type:lower-alpha}
li{margin-bottom:8px}
blockquote{border-left:5px solid #C9A24A;margin:18px 0;padding:6px 0 6px 24px;color:#EFE3BC}
strong,b{color:#FFFFFF}
mark{padding:0 3px;border-radius:3px}
a{color:#7FC8F8}
</style>
<div style="font-size:46px;font-weight:bold;color:#DFBE72;line-height:1.2;margin-bottom:10px;">${tituloSeguro}</div>
<div style="height:3px;background:#C9A24A;margin:18px 0 30px;"></div>
${cuerpo}
<div style="margin-top:36px;font-size:22px;color:#9BB0BD;">LemWriter</div>
</div>`
}

// ─── Dibujo del documento en un lienzo (canvas) ──────────────────────────────
//
// Calidad: el documento se maqueta a 1080 px de ancho «de papel» y se
// dibuja al DOBLE (2160 px reales), para que al verlo y ampliarlo en
// WhatsApp el texto se lea nítido. Tope de alto para no agotar la memoria
// del teléfono en secciones larguísimas.

export const ANCHO_DOCUMENTO_CSS = 1080
const ESCALA_RASTER_MAXIMA = 2
const ALTO_RASTER_MAXIMO = 16000

/** Escala de dibujo según el alto del documento: doble hasta el tope. */
export function calcularEscalaRaster(altoCss: number): number {
  return Math.min(ESCALA_RASTER_MAXIMA, ALTO_RASTER_MAXIMO / Math.max(1, altoCss))
}

/** SVG que envuelve el documento para dibujarlo en un lienzo a la escala dada. */
export function construirSvgDocumento(
  documentoHtml: string,
  anchoCss: number,
  altoCss: number,
  escala: number
): string {
  const anchoPx = Math.round(anchoCss * escala)
  const altoPx = Math.round(altoCss * escala)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${anchoPx}" height="${altoPx}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${anchoCss}px;height:${altoCss}px;transform:scale(${escala});transform-origin:0 0;">${documentoHtml}</div>` +
    `</foreignObject></svg>`
  )
}

async function documentoACanvas(titulo: string, html: string): Promise<HTMLCanvasElement> {
  const documentoHtml = construirDocumentoCompartible(titulo, html)

  // Medir la altura real con un contenedor fuera de pantalla
  const medidor = document.createElement('div')
  medidor.style.position = 'fixed'
  medidor.style.left = '-100000px'
  medidor.style.top = '0'
  medidor.innerHTML = documentoHtml
  document.body.appendChild(medidor)
  const nodo = medidor.firstElementChild as HTMLElement
  const ancho = ANCHO_DOCUMENTO_CSS
  const altoReal = Math.max(nodo.scrollHeight, nodo.offsetHeight, 200)
  medidor.remove()

  const escala = calcularEscalaRaster(altoReal)
  const svg = construirSvgDocumento(documentoHtml, ancho, altoReal, escala)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('No se pudo dibujar la imagen'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(ancho * escala)
  canvas.height = Math.round(altoReal * escala)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Sin contexto de dibujo')
  ctx.fillStyle = '#0A1A31'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasABlob(canvas: HTMLCanvasElement, tipo: string, calidad?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo crear el archivo'))),
      tipo,
      calidad
    )
  })
}

/** La sección como imagen PNG (tamaño real, lista para WhatsApp). */
export async function seccionAImagenBlob(titulo: string, html: string): Promise<Blob> {
  const canvas = await documentoACanvas(titulo, html)
  return canvasABlob(canvas, 'image/png')
}

// ─── PDF por páginas (cada página es una foto del documento) ─────────────────

type PaginaJpeg = { datos: Uint8Array; ancho: number; alto: number }

function dataUrlABytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || ''
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Arma un PDF A4 con las páginas JPEG dadas. Función pura (sin navegador):
 * devuelve los bytes del PDF. Cada página llena la hoja A4.
 */
export function construirPdfPaginas(paginas: PaginaJpeg[]): Uint8Array {
  if (!paginas.length) throw new Error('PDF sin páginas')
  const ANCHO_PT = 595.28
  const ALTO_PT = 841.89
  const objetos: Uint8Array[] = []
  const offsets: number[] = []
  const encoder = new TextEncoder()
  let salida = encoder.encode('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')
  const total = 3 + paginas.length * 3

  const agregarTexto = (s: string) => {
    const b = encoder.encode(s)
    const nuevo = new Uint8Array(salida.length + b.length)
    nuevo.set(salida)
    nuevo.set(b, salida.length)
    salida = nuevo
  }
  const agregarBytes = (b: Uint8Array) => {
    const nuevo = new Uint8Array(salida.length + b.length)
    nuevo.set(salida)
    nuevo.set(b, salida.length)
    salida = nuevo
  }
  const inicioObjeto = (n: number) => {
    offsets[n] = salida.length
    agregarTexto(`${n} 0 obj\n`)
  }

  // Objetos 1 (catálogo) y 2 (árbol de páginas) van al final con offsets ya
  // conocidos; primero se escriben las páginas (3..N) y luego 1 y 2.
  const kids = paginas.map((_, i) => `${3 + i * 3} 0 R`).join(' ')

  paginas.forEach((pag, i) => {
    const objPagina = 3 + i * 3
    const objContenido = objPagina + 1
    const objImagen = objPagina + 2
    inicioObjeto(objPagina)
    agregarTexto(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO_PT} ${ALTO_PT}] ` +
        `/Resources << /XObject << /Im${i} ${objImagen} 0 R >> >> /Contents ${objContenido} 0 R >>\nendobj\n`
    )
    const flujo = `q ${ANCHO_PT} 0 0 ${ALTO_PT} 0 0 cm /Im${i} Do Q`
    inicioObjeto(objContenido)
    agregarTexto(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream\nendobj\n`)
    inicioObjeto(objImagen)
    agregarTexto(
      `<< /Type /XObject /Subtype /Image /Width ${pag.ancho} /Height ${pag.alto} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pag.datos.length} >>\nstream\n`
    )
    agregarBytes(pag.datos)
    agregarTexto('\nendstream\nendobj\n')
  })

  inicioObjeto(1)
  agregarTexto('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  inicioObjeto(2)
  agregarTexto(`<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>\nendobj\n`)

  const xrefPos = salida.length
  agregarTexto(`xref\n0 ${total}\n0000000000 65535 f \n`)
  for (let n = 1; n < total; n++) {
    agregarTexto(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  }
  agregarTexto(
    `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  )
  void objetos
  return salida
}

/** La sección como PDF (páginas A4 listas para leer e imprimir). */
export async function seccionAPdfBytes(titulo: string, html: string): Promise<Uint8Array> {
  const canvas = await documentoACanvas(titulo, html)
  const ancho = canvas.width
  const altoPagina = Math.floor((ancho * ALTO_PAGINA) / ANCHO_PAGINA)
  const paginas: PaginaJpeg[] = []
  for (let y = 0; y < canvas.height; y += altoPagina) {
    const h = Math.min(altoPagina, canvas.height - y)
    const hoja = document.createElement('canvas')
    hoja.width = ancho
    hoja.height = altoPagina
    const ctx = hoja.getContext('2d')
    if (!ctx) throw new Error('Sin contexto de dibujo')
    ctx.fillStyle = '#0A1A31'
    ctx.fillRect(0, 0, ancho, altoPagina)
    ctx.drawImage(canvas, 0, y, ancho, h, 0, 0, ancho, h)
    const dataUrl = hoja.toDataURL('image/jpeg', 0.92)
    paginas.push({ datos: dataUrlABytes(dataUrl), ancho, alto: altoPagina })
  }
  return construirPdfPaginas(paginas)
}

const ANCHO_PAGINA = 595.28
const ALTO_PAGINA = 841.89

// ─── Compartir un archivo (imagen o PDF) ─────────────────────────────────────

function nombreArchivo(titulo: string, extension: string): string {
  const base = (titulo || 'seccion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `lemwriter-${base || 'seccion'}.${extension}`
}

function blobADataBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => {
      const r = String(lector.result || '')
      resolve(r.slice(r.indexOf(',') + 1))
    }
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.readAsDataURL(blob)
  })
}

function bytesADataBase64(bytes: Uint8Array): Promise<string> {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  return blobADataBase64(blob)
}

/**
 * Abre la hoja de compartir con un archivo (imagen o PDF): en el teléfono
 * usa la hoja del sistema con el archivo adjunto; en web lo descarga.
 */
export async function compartirArchivo(opts: {
  titulo: string
  extension: 'png' | 'pdf'
  blob?: Blob
  bytes?: Uint8Array
}): Promise<'compartido' | 'descargado'> {
  const nombre = nombreArchivo(opts.titulo, opts.extension)
  if (Capacitor.isNativePlatform()) {
    const data = opts.bytes
      ? await bytesADataBase64(opts.bytes)
      : await blobADataBase64(opts.blob as Blob)
    const escritura = await Filesystem.writeFile({
      path: `compartir/${nombre}`,
      data,
      directory: Directory.Cache,
      recursive: true,
    })
    await Share.share({
      title: opts.titulo || 'Sección',
      dialogTitle: 'Compartir sección',
      files: [escritura.uri],
    })
    return 'compartido'
  }
  const blob =
    opts.blob ??
    new Blob([opts.bytes?.buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'descargado'
}
