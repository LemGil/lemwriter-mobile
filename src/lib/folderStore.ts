// src/lib/folderStore.ts
//
// LemWriter Local — la carpeta ES la base de datos.
// Formato acordado con LemGil (2026-10-07, diseno-lemwriter-local.md):
//   <raíz>/<carpeta-por-tipo>/<proyecto>/proyecto.json
//   <raíz>/<carpeta-por-tipo>/<proyecto>/01-<seccion>.md   (uno por sección)
//   <raíz>/<carpeta-por-tipo>/<proyecto>/imagenes/
// Raíz por defecto: "LemWriter" (Documentos/LemWriter en el teléfono),
// cambiable por el usuario; si la carpeta ya tiene esta estructura, se lee.

import type { FsAdapter } from './fsAdapter'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export const TIPO_A_CARPETA: Record<string, string> = {
  sermon: 'sermones',
  ensenanza: 'ensenanzas',
  devocional: 'devocionales',
  estudio: 'estudios',
  video: 'videos',
  libro: 'libros',
  academia: 'academia',
}

export interface FolderProyecto {
  id: string
  titulo: string
  tipo: string
  estado: string
  fecha_creacion: string
  ultima_actualizacion: string
  carpeta: string // ruta relativa: "<carpetaTipo>/<carpetaProyecto>"
}

export interface FolderSeccion {
  id: string
  titulo: string
  orden: number
  markdown: string
  html: string
  archivo: string // nombre de archivo dentro de la carpeta del proyecto
}

const CLAVE_RAIZ = 'lw_local_carpeta_raiz'
export const RAIZ_POR_DEFECTO = 'LemWriter'

export function carpetaRaizGuardada(): string {
  try {
    return localStorage.getItem(CLAVE_RAIZ) || RAIZ_POR_DEFECTO
  } catch {
    return RAIZ_POR_DEFECTO
  }
}

export function guardarCarpetaRaiz(nombre: string): void {
  try {
    localStorage.setItem(CLAVE_RAIZ, nombre)
  } catch {
    /* sin localStorage (pruebas): la raíz va en el constructor */
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

export function toSlug(text: string | undefined | null): string {
  if (!text) return 'sin-titulo'
  const s = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80)
  return s || 'sin-titulo'
}

function nuevoId(prefijo: string): string {
  const c: any = (globalThis as any).crypto
  const uuid: string =
    c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefijo}_${uuid}`
}

function hoy(): string {
  return new Date().toISOString().split('T')[0]
}

function num2(n: number): string {
  return n.toString().padStart(2, '0')
}

// ─── Conversión HTML ⇄ Markdown ──────────────────────────────────────────────
// Cubre lo que genera el editor (Tiptap): h1-h4, p, strong, em, u, ol, ul,
// blockquote/callouts, enlaces, hr. Color y resaltado (span con style) se
// conservan como HTML en línea dentro del .md (Obsidian lo muestra y el
// editor lo recupera al abrir).

const CALLOUT_A_TIPO: Record<string, string> = {
  quote: 'biblia',
  idea: 'idea',
  tip: 'aplicacion',
  note: 'nota',
}
const TIPO_A_CALLOUT: Record<string, string> = {
  biblia: 'quote',
  idea: 'idea',
  aplicacion: 'tip',
  nota: 'note',
}
const CALLOUT_TITULO: Record<string, string> = {
  biblia: 'Pasaje Bíblico',
  idea: 'Idea / Ilustración',
  aplicacion: 'Aplicación Práctica',
  nota: 'Nota Ministerial',
}

// ─── Numeración de listas (ida y vuelta HTML ⇄ Markdown) ────────────────────
// El estilo de la lista viaja en el .md con su propio marcador
// (I. / i. / A. / a.), para que al reabrir la sección se vea igual
// que en el editor y el archivo se lea bien en cualquier editor de texto.

function romano(n: number): string {
  const tabla: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let r = ''
  for (const [v, s] of tabla) {
    while (n >= v) {
      r += s
      n -= v
    }
  }
  return r
}

function letras(n: number): string {
  // 1→A, 26→Z, 27→AA
  let r = ''
  while (n > 0) {
    r = String.fromCharCode(65 + ((n - 1) % 26)) + r
    n = Math.floor((n - 1) / 26)
  }
  return r
}

function marcadorNumeracion(estilo: string, i: number): string {
  switch (estilo) {
    case 'upper-roman':
      return `${romano(i)}.`
    case 'lower-roman':
      return `${romano(i).toLowerCase()}.`
    case 'upper-alpha':
      return `${letras(i)}.`
    case 'lower-alpha':
      return `${letras(i).toLowerCase()}.`
    default:
      return `${i}.`
  }
}

const ESTILOS_LISTA_MD = ['upper-roman', 'lower-roman', 'upper-alpha', 'lower-alpha']

// Si la línea abre una lista con estilo («A. », «I. », «a. », «i. »), devuelve
// el estilo; si no, null. La corrida completa se valida al consumirla.
function estiloDeLineaLista(trim: string): string | null {
  for (const estilo of ESTILOS_LISTA_MD) {
    if (trim.startsWith(marcadorNumeracion(estilo, 1) + ' ')) return estilo
  }
  return null
}

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, '')
}

export function htmlToMarkdown(html: string | undefined | null): string {
  if (!html) return ''
  // Proteger spans con style (color/resaltado) antes de quitar etiquetas
  const spans: string[] = []
  let md = html.replace(/<span([^>]*)>([\s\S]*?)<\/span>/gi, (m, attrs, inner) => {
    if (/style=/i.test(attrs)) {
      spans.push(m)
      return `\u0001${spans.length - 1}\u0002`
    }
    return inner
  })

  md = md.replace(/<blockquote([^>]*)>([\s\S]*?)<\/blockquote>/gi, (_m, attrs, inner) => {
    const texto = htmlToMarkdown(inner).trim()
    const tipo =
      (/data-callout-type=["'](\w+)["']/i.exec(attrs) || [])[1] ||
      (/callout-(\w+)/i.exec(attrs) || [])[1]
    const callout = tipo ? TIPO_A_CALLOUT[tipo] : undefined
    const header = callout ? `> [!${callout}] ${CALLOUT_TITULO[tipo]}\n` : ''
    return header + texto.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n'
  })

  md = md.replace(/<hr\s*\/?>/gi, '\n---\n\n')
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t) => `# ${stripTags(t).trim()}\n\n`)
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t) => `## ${stripTags(t).trim()}\n\n`)
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t) => `### ${stripTags(t).trim()}\n\n`)
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, t) => `#### ${stripTags(t).trim()}\n\n`)

  md = md.replace(/<ol([^>]*)>([\s\S]*?)<\/ol>/gi, (_m, attrs, inner) => {
    const estilo = (/data-list-style=["']([\w-]+)["']/i.exec(attrs) || [])[1] || 'decimal'
    let i = 0
    return (
      inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_2: string, item: string) => {
        i++
        return `${marcadorNumeracion(estilo, i)} ${stripTags(htmlToMarkdown(item)).trim()}\n`
      }) + '\n'
    )
  })
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner) => {
    return (
      inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_2: string, item: string) => {
        return `- ${stripTags(htmlToMarkdown(item)).trim()}\n`
      }) + '\n'
    )
  })

  md = md.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, t) => `[${stripTags(t)}](${href})`)
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_m, t) => `**${stripTags(t)}**`)
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_m, t) => `**${stripTags(t)}**`)
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_m, t) => `*${stripTags(t)}*`)
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (_m, t) => `*${stripTags(t)}*`)
  md = md.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, (_m, t) => `<u>${stripTags(t)}</u>`)
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, t) => {
    const texto = t.trim()
    return texto ? texto + '\n\n' : ''
  })
  md = md.replace(/<br\s*\/?>/gi, '\n')
  md = md.replace(/<[^>]+>/g, '')
  md = md
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  // Restaurar spans protegidos
  md = md.replace(/\u0001(\d+)\u0002/g, (_m, i) => spans[Number(i)] || '')
  md = md.replace(/\n{3,}/g, '\n\n')
  return md.trim()
}

function inlineMdAHtml(texto: string): string {
  return texto
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

export function markdownToHtml(md: string | undefined | null): string {
  if (!md) return ''
  const lineas = md.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lineas.length) {
    const linea = lineas[i]
    const trim = linea.trim()
    if (!trim) {
      i++
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(trim)
    if (h) {
      const nivel = h[1].length
      out.push(`<h${nivel}>${inlineMdAHtml(h[2])}</h${nivel}>`)
      i++
      continue
    }
    if (trim === '---') {
      out.push('<hr>')
      i++
      continue
    }
    if (trim.startsWith('>')) {
      const bloque: string[] = []
      let callout: string | undefined
      while (i < lineas.length && lineas[i].trim().startsWith('>')) {
        let l = lineas[i].trim().replace(/^>\s?/, '')
        const cm = /^\[!(\w+)\]\s*(.*)$/.exec(l)
        if (cm) {
          callout = CALLOUT_A_TIPO[cm[1]]
          l = cm[2] || ''
          if (!l) {
            i++
            continue
          }
        }
        bloque.push(l)
        i++
      }
      const inner = bloque.map((l) => `<p>${inlineMdAHtml(l)}</p>`).join('')
      out.push(
        callout
          ? `<blockquote data-callout-type="${callout}">${inner}</blockquote>`
          : `<blockquote>${inner}</blockquote>`
      )
      continue
    }
    if (/^- /.test(trim) || /^\d+\. /.test(trim)) {
      const ordenada = /^\d+\. /.test(trim)
      const items: string[] = []
      while (i < lineas.length) {
        const l = lineas[i].trim()
        if (ordenada ? /^\d+\. /.test(l) : /^- /.test(l)) {
          items.push(`<li>${inlineMdAHtml(l.replace(/^(-|\d+\.) /, ''))}</li>`)
          i++
        } else break
      }
      out.push(ordenada ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`)
      continue
    }
    const estiloLista = estiloDeLineaLista(trim)
    if (estiloLista) {
      // Lista con estilo (I. / A. / a. / i.): se consume la corrida validando
      // la secuencia; con un solo renglón suelto no es lista, es párrafo.
      const items: string[] = []
      let j = i
      let n = 0
      while (j < lineas.length) {
        const l = lineas[j].trim()
        const esperado = marcadorNumeracion(estiloLista, n + 1) + ' '
        if (!l.startsWith(esperado)) break
        items.push(`<li>${inlineMdAHtml(l.slice(esperado.length).trim())}</li>`)
        n++
        j++
      }
      if (items.length >= 2) {
        out.push(`<ol data-list-style="${estiloLista}">${items.join('')}</ol>`)
        i = j
        continue
      }
    }
    // Párrafo: líneas consecutivas no especiales
    const par: string[] = []
    while (i < lineas.length) {
      const l = lineas[i].trim()
      if (!l || /^(#{1,4})\s/.test(l) || l === '---' || l.startsWith('>') || /^- /.test(l) || /^\d+\. /.test(l) || (par.length > 0 && estiloDeLineaLista(l))) break
      par.push(l)
      i++
    }
    out.push(`<p>${inlineMdAHtml(par.join(' '))}</p>`)
  }
  return out.join('\n')
}

// ─── Fichas (frontmatter) ────────────────────────────────────────────────────

function fichaDeSeccion(p: FolderProyecto, s: { id: string; titulo: string; orden: number }, cuerpoMd: string): string {
  const fm = [
    '---',
    `tipo: ${p.tipo}`,
    `titulo: "${(p.titulo || '').replace(/"/g, '\\"')}"`,
    `seccion: "${(s.titulo || '').replace(/"/g, '\\"')}"`,
    `seccion_id: "${s.id}"`,
    `orden: ${s.orden}`,
    '---',
    '',
  ].join('\n')
  const encabezado = s.titulo.trim() ? `## ${s.titulo.trim()}\n\n` : ''
  return fm + encabezado + (cuerpoMd || '').trim() + '\n'
}

interface FichaParseada {
  datos: Record<string, string>
  cuerpo: string
}

function parseFicha(contenido: string): FichaParseada {
  const datos: Record<string, string> = {}
  if (!contenido.startsWith('---')) return { datos, cuerpo: contenido }
  const fin = contenido.indexOf('\n---', 3)
  if (fin === -1) return { datos, cuerpo: contenido }
  const cabecera = contenido.slice(3, fin)
  for (const linea of cabecera.split('\n')) {
    const m = /^([^:]+):\s*(.*)$/.exec(linea.trim())
    if (m) datos[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '').replace(/\\"/g, '"')
  }
  let cuerpo = contenido.slice(fin + 4)
  cuerpo = cuerpo.replace(/^\n+/, '')
  // Quitar el encabezado ## repetido (el título vive en la ficha)
  const tituloSeccion = datos['seccion']
  if (tituloSeccion) {
    const primera = cuerpo.split('\n')[0]?.trim()
    if (primera === `## ${tituloSeccion}`) cuerpo = cuerpo.split('\n').slice(1).join('\n').replace(/^\n+/, '')
  }
  return { datos, cuerpo: cuerpo.trim() }
}

// ─── La tienda de carpetas ───────────────────────────────────────────────────

export class FolderStore {
  constructor(
    private fs: FsAdapter,
    private raiz: string = carpetaRaizGuardada()
  ) {}

  get carpetaRaiz(): string {
    return this.raiz
  }

  async asegurarEstructura(): Promise<void> {
    await this.fs.mkdir(this.raiz)
    for (const carpeta of Object.values(TIPO_A_CARPETA)) {
      await this.fs.mkdir(`${this.raiz}/${carpeta}`)
    }
    await this.fs.mkdir(`${this.raiz}/respaldos`)
    await this.fs.mkdir(`${this.raiz}/academia-pendientes`)
  }

  private async carpetaLibre(carpetaTipo: string, base: string): Promise<string> {
    let nombre = base
    let n = 2
    while (await this.fs.exists(`${this.raiz}/${carpetaTipo}/${nombre}`)) {
      nombre = `${base}-${n}`
      n++
    }
    return nombre
  }

  async crearProyecto(
    tipo: string,
    titulo: string,
    estado = 'en_progreso',
    opciones?: { id?: string; fecha_creacion?: string; ultima_actualizacion?: string }
  ): Promise<FolderProyecto> {
    const carpetaTipo = TIPO_A_CARPETA[tipo]
    if (!carpetaTipo) throw new Error(`Tipo desconocido: ${tipo}`)
    await this.asegurarEstructura()
    if (opciones?.id) {
      // Idempotente: si el proyecto ya existe en carpetas, se devuelve tal cual
      const existente = await this.buscarProyecto(opciones.id)
      if (existente) return existente
    }
    const nombre = await this.carpetaLibre(carpetaTipo, toSlug(titulo))
    const proyecto: FolderProyecto = {
      id: opciones?.id ?? nuevoId('local_proj'),
      titulo,
      tipo,
      estado,
      fecha_creacion: opciones?.fecha_creacion ?? hoy(),
      ultima_actualizacion: opciones?.ultima_actualizacion ?? hoy(),
      carpeta: `${carpetaTipo}/${nombre}`,
    }
    await this.fs.mkdir(`${this.raiz}/${proyecto.carpeta}/imagenes`)
    await this.escribirProyecto(proyecto)
    return proyecto
  }

  private async escribirProyecto(p: FolderProyecto): Promise<void> {
    const datos = {
      id: p.id,
      titulo: p.titulo,
      tipo: p.tipo,
      estado: p.estado,
      fecha_creacion: p.fecha_creacion,
      ultima_actualizacion: p.ultima_actualizacion,
      formato: 1,
    }
    await this.fs.writeFile(`${this.raiz}/${p.carpeta}/proyecto.json`, JSON.stringify(datos, null, 2))
  }

  async listarProyectos(): Promise<FolderProyecto[]> {
    await this.asegurarEstructura()
    const proyectos: FolderProyecto[] = []
    for (const carpetaTipo of Object.values(TIPO_A_CARPETA)) {
      let entradas: string[] = []
      try {
        entradas = await this.fs.readdir(`${this.raiz}/${carpetaTipo}`)
      } catch {
        continue
      }
      for (const nombre of entradas) {
        try {
          const crudo = await this.fs.readFile(`${this.raiz}/${carpetaTipo}/${nombre}/proyecto.json`)
          const d = JSON.parse(crudo)
          proyectos.push({
            id: String(d.id),
            titulo: String(d.titulo ?? 'Sin título'),
            tipo: String(d.tipo ?? ''),
            estado: String(d.estado ?? 'en_progreso'),
            fecha_creacion: String(d.fecha_creacion ?? hoy()),
            ultima_actualizacion: String(d.ultima_actualizacion ?? hoy()),
            carpeta: `${carpetaTipo}/${nombre}`,
          })
        } catch {
          /* carpeta sin proyecto.json válido: se ignora */
        }
      }
    }
    proyectos.sort((a, b) => b.ultima_actualizacion.localeCompare(a.ultima_actualizacion))
    return proyectos
  }

  async buscarProyecto(id: string): Promise<FolderProyecto | null> {
    const todos = await this.listarProyectos()
    return todos.find((p) => p.id === id) ?? null
  }

  async renombrarProyecto(id: string, nuevoTitulo: string): Promise<FolderProyecto> {
    const p = await this.buscarProyecto(id)
    if (!p) throw new Error(`Proyecto no encontrado: ${id}`)
    const carpetaTipo = p.carpeta.split('/')[0]
    const base = toSlug(nuevoTitulo)
    const actual = p.carpeta.split('/')[1]
    let destino = actual
    if (base !== actual) {
      destino = await this.carpetaLibre(carpetaTipo, base)
      await this.fs.rename(`${this.raiz}/${p.carpeta}`, `${this.raiz}/${carpetaTipo}/${destino}`)
    }
    const actualizado: FolderProyecto = {
      ...p,
      titulo: nuevoTitulo,
      carpeta: `${carpetaTipo}/${destino}`,
      ultima_actualizacion: hoy(),
    }
    await this.escribirProyecto(actualizado)
    return actualizado
  }

  // Cambia título, tipo y/o estado del proyecto. Si cambian el título o el
  // tipo, la carpeta se renombra o se mueve a la carpeta del nuevo tipo, y
  // las fichas de los .md se reescriben con los datos nuevos.
  async actualizarProyecto(
    id: string,
    cambios: { titulo?: string; tipo?: string; estado?: string }
  ): Promise<FolderProyecto> {
    const p = await this.buscarProyecto(id)
    if (!p) throw new Error(`Proyecto no encontrado: ${id}`)
    const nuevoTitulo = cambios.titulo ?? p.titulo
    const nuevoTipo = cambios.tipo && TIPO_A_CARPETA[cambios.tipo] ? cambios.tipo : p.tipo
    const carpetaTipoDestino = TIPO_A_CARPETA[nuevoTipo]
    const carpetaTipoActual = p.carpeta.split('/')[0]
    let carpetaDestino = p.carpeta
    if (nuevoTitulo !== p.titulo || carpetaTipoDestino !== carpetaTipoActual) {
      const base = toSlug(nuevoTitulo) || p.carpeta.split('/')[1]
      if (`${carpetaTipoDestino}/${base}` !== p.carpeta) {
        const nombre = await this.carpetaLibre(carpetaTipoDestino, base)
        carpetaDestino = `${carpetaTipoDestino}/${nombre}`
        await this.fs.rename(`${this.raiz}/${p.carpeta}`, `${this.raiz}/${carpetaDestino}`)
      }
    }
    const actualizado: FolderProyecto = {
      ...p,
      titulo: nuevoTitulo,
      tipo: nuevoTipo,
      estado: cambios.estado ?? p.estado,
      carpeta: carpetaDestino,
      ultima_actualizacion: hoy(),
    }
    await this.escribirProyecto(actualizado)
    if (nuevoTitulo !== p.titulo || nuevoTipo !== p.tipo) {
      await this.refrescarFichas(actualizado)
    }
    return actualizado
  }

  // Reescribe `tipo:` y `titulo:` en la ficha (frontmatter) de cada .md del
  // proyecto, sin tocar el cuerpo.
  private async refrescarFichas(p: FolderProyecto): Promise<void> {
    let nombres: string[] = []
    try {
      nombres = await this.fs.readdir(`${this.raiz}/${p.carpeta}`)
    } catch {
      return
    }
    for (const nombre of nombres) {
      if (!/^\d{2}-.+\.md$/.test(nombre)) continue
      const ruta = `${this.raiz}/${p.carpeta}/${nombre}`
      const crudo = await this.fs.readFile(ruta)
      if (!crudo.startsWith('---')) continue
      const cierre = crudo.indexOf('\n---', 3)
      if (cierre < 0) continue
      const cabeza = crudo
        .slice(0, cierre)
        .replace(/^tipo:.*$/m, `tipo: ${p.tipo}`)
        .replace(/^titulo:.*$/m, `titulo: ${JSON.stringify(p.titulo)}`)
      await this.fs.writeFile(ruta, cabeza + crudo.slice(cierre))
    }
  }

  async eliminarProyecto(id: string): Promise<void> {
    const p = await this.buscarProyecto(id)
    if (!p) return
    await this.fs.removeDir(`${this.raiz}/${p.carpeta}`)
  }

  async listarSecciones(proyectoId: string): Promise<FolderSeccion[]> {
    const p = await this.buscarProyecto(proyectoId)
    if (!p) return []
    let nombres: string[] = []
    try {
      nombres = await this.fs.readdir(`${this.raiz}/${p.carpeta}`)
    } catch {
      return []
    }
    const secciones: FolderSeccion[] = []
    for (const nombre of nombres) {
      if (!/^\d{2}-.+\.md$/.test(nombre)) continue
      const contenido = await this.fs.readFile(`${this.raiz}/${p.carpeta}/${nombre}`)
      const { datos, cuerpo } = parseFicha(contenido)
      const orden = Number(datos['orden'] ?? nombre.slice(0, 2))
      secciones.push({
        id: datos['seccion_id'] || `sec-${nombre}`,
        titulo: datos['seccion'] || '',
        orden,
        markdown: cuerpo,
        html: markdownToHtml(cuerpo),
        archivo: nombre,
      })
    }
    secciones.sort((a, b) => a.orden - b.orden)
    return secciones
  }

  async guardarSeccion(
    proyectoId: string,
    seccion: { id?: string; titulo: string; contentHtml: string }
  ): Promise<FolderSeccion> {
    const p = await this.buscarProyecto(proyectoId)
    if (!p) throw new Error(`Proyecto no encontrado: ${proyectoId}`)
    const existentes = await this.listarSecciones(proyectoId)
    const previa = seccion.id ? existentes.find((s) => s.id === seccion.id) : undefined
    const id = previa?.id ?? seccion.id ?? nuevoId('local_sec')
    const orden = previa?.orden ?? existentes.length + 1
    const cuerpoMd = htmlToMarkdown(seccion.contentHtml)
    const archivo = `${num2(orden)}-${toSlug(seccion.titulo) || 'seccion'}.md`
    const contenido = fichaDeSeccion(p, { id, titulo: seccion.titulo, orden }, cuerpoMd)
    if (previa && previa.archivo !== archivo) {
      await this.fs.removeFile(`${this.raiz}/${p.carpeta}/${previa.archivo}`)
    }
    await this.fs.writeFile(`${this.raiz}/${p.carpeta}/${archivo}`, contenido)
    await this.escribirProyecto({ ...p, ultima_actualizacion: hoy() })
    return { id, titulo: seccion.titulo, orden, markdown: cuerpoMd, html: seccion.contentHtml, archivo }
  }

  async reordenarSecciones(proyectoId: string, idsEnOrden: string[]): Promise<FolderSeccion[]> {
    const p = await this.buscarProyecto(proyectoId)
    if (!p) throw new Error(`Proyecto no encontrado: ${proyectoId}`)
    const secciones = await this.listarSecciones(proyectoId)
    const porId = new Map(secciones.map((s) => [s.id, s]))
    // Renombrar primero a nombres temporales para no chocar
    for (const s of secciones) {
      await this.fs.rename(`${this.raiz}/${p.carpeta}/${s.archivo}`, `${this.raiz}/${p.carpeta}/.tmp-${s.id}.md`)
    }
    const resultado: FolderSeccion[] = []
    let n = 0
    for (const id of idsEnOrden) {
      const s = porId.get(id)
      if (!s) continue
      n++
      const archivo = `${num2(n)}-${toSlug(s.titulo) || 'seccion'}.md`
      const contenidoCrudo = await this.fs.readFile(`${this.raiz}/${p.carpeta}/.tmp-${s.id}.md`)
      const contenido = contenidoCrudo.replace(/orden: \d+/, `orden: ${n}`)
      await this.fs.writeFile(`${this.raiz}/${p.carpeta}/${archivo}`, contenido)
      await this.fs.removeFile(`${this.raiz}/${p.carpeta}/.tmp-${s.id}.md`)
      resultado.push({ ...s, orden: n, archivo })
    }
    return resultado
  }

  async eliminarSeccion(proyectoId: string, seccionId: string): Promise<void> {
    const p = await this.buscarProyecto(proyectoId)
    if (!p) return
    const secciones = await this.listarSecciones(proyectoId)
    const s = secciones.find((x) => x.id === seccionId)
    if (!s) return
    await this.fs.removeFile(`${this.raiz}/${p.carpeta}/${s.archivo}`)
    const restantes = secciones.filter((x) => x.id !== seccionId).map((x) => x.id)
    if (restantes.length) await this.reordenarSecciones(proyectoId, restantes)
  }
}
