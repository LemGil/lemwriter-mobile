// Servicio de Biblia offline para LemWriter Mobile.
// Textos incluidos en la app (sin conexión):
//  - Reina-Valera 1909 (dominio público), eBible.org spaRV1909
//  - Versión Biblia Libre (CC BY-SA 4.0 — atribución a eBible.org / Free Bible Ministry), eBible.org spavbl
// Cada libro es un JSON que Vite separa en su propio chunk y se carga bajo demanda.

import indiceRv1909 from './datos/rv1909/index.json'
import indiceVbl from './datos/vbl/index.json'

export type VersionBiblia = 'rv1909' | 'vbl'

export interface LibroMeta {
  codigo: string
  nombre: string
  testamento: 'AT' | 'NT'
  capitulos: number
}

export interface LibroBiblia {
  codigo: string
  nombre: string
  capitulos: string[][]
}

interface IndiceBiblia {
  version: string
  nombre: string
  libros: LibroMeta[]
}

const INDICES: Record<VersionBiblia, IndiceBiblia> = {
  rv1909: indiceRv1909 as IndiceBiblia,
  vbl: indiceVbl as IndiceBiblia,
}

export const VERSIONES_BIBLIA: { id: VersionBiblia; nombre: string; corta: string }[] = [
  { id: 'rv1909', nombre: 'Reina-Valera 1909', corta: 'RV1909' },
  { id: 'vbl', nombre: 'Versión Biblia Libre', corta: 'VBL' },
]

export function librosDe(version: VersionBiblia): LibroMeta[] {
  return INDICES[version].libros
}

export function nombreLibro(version: VersionBiblia, codigo: string): string {
  return INDICES[version].libros.find((l) => l.codigo === codigo)?.nombre || codigo
}

export function totalCapitulos(version: VersionBiblia, codigo: string): number {
  return INDICES[version].libros.find((l) => l.codigo === codigo)?.capitulos || 1
}

const cargadores = import.meta.glob<{ default: LibroBiblia }>('./datos/*/*.json')
const cacheLibros = new Map<string, Promise<LibroBiblia>>()

export function cargarLibro(version: VersionBiblia, codigo: string): Promise<LibroBiblia> {
  const clave = `${version}/${codigo}`
  let promesa = cacheLibros.get(clave)
  if (!promesa) {
    const fn = cargadores[`./datos/${version}/${codigo}.json`]
    if (!fn) {
      return Promise.reject(new Error(`Libro no encontrado: ${clave}`))
    }
    promesa = fn().then((m) => m.default)
    cacheLibros.set(clave, promesa)
  }
  return promesa
}

export async function obtenerCapitulo(
  version: VersionBiblia,
  codigo: string,
  capitulo: number
): Promise<string[]> {
  const libro = await cargarLibro(version, codigo)
  return libro.capitulos[capitulo - 1] || []
}

export function etiquetaReferencia(
  version: VersionBiblia,
  codigo: string,
  capitulo: number,
  versiculo?: number,
  versiculoFin?: number
): string {
  const nombre = nombreLibro(version, codigo)
  if (!versiculo) return `${nombre} ${capitulo}`
  if (versiculoFin && versiculoFin !== versiculo) return `${nombre} ${capitulo}:${versiculo}-${versiculoFin}`
  return `${nombre} ${capitulo}:${versiculo}`
}

// ---------- Búsqueda ----------

export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const ABREVIATURAS: Record<string, string> = {
  gn: 'GEN', genesis: 'GEN', ex: 'EXO', exodo: 'EXO', lv: 'LEV', levitico: 'LEV',
  nm: 'NUM', numeros: 'NUM', dt: 'DEU', deuteronomio: 'DEU', jos: 'JOS', josue: 'JOS',
  jue: 'JDG', jueces: 'JDG', rt: 'RUT', rut: 'RUT', samuel: '1SA', reyes: '1KI',
  cronicas: '1CH', esdras: 'EZR', neh: 'NEH', nehemias: 'NEH', est: 'EST', ester: 'EST',
  job: 'JOB', sal: 'PSA', salmos: 'PSA', salmo: 'PSA', pr: 'PRO', proverbios: 'PRO',
  ec: 'ECC', eclesiastes: 'ECC', cant: 'SNG', cantares: 'SNG', is: 'ISA', isaias: 'ISA',
  jer: 'JER', jeremias: 'JER', lam: 'LAM', lamentaciones: 'LAM', ez: 'EZK', ezequiel: 'EZK',
  dn: 'DAN', daniel: 'DAN', os: 'HOS', oseas: 'HOS', jl: 'JOL', joel: 'JOL', am: 'AMO', amos: 'AMO',
  abd: 'OBA', abdias: 'OBA', jon: 'JON', jonas: 'JON', miq: 'MIC', miqueas: 'MIC', nah: 'NAM', nahum: 'NAM',
  hab: 'HAB', habacuc: 'HAB', sof: 'ZEP', sofonias: 'ZEP', hag: 'HAG', hageo: 'HAG',
  zac: 'ZEC', zacarias: 'ZEC', mal: 'MAL', malaquias: 'MAL',
  mt: 'MAT', mateo: 'MAT', mr: 'MRK', marcos: 'MRK', lc: 'LUK', lucas: 'LUK',
  jn: 'JHN', juan: 'JHN', hch: 'ACT', hechos: 'ACT', ro: 'ROM', romanos: 'ROM',
  corintios: '1CO', gal: 'GAL', galatas: 'GAL', ef: 'EPH', efesios: 'EPH', fil: 'PHP', filipenses: 'PHP',
  col: 'COL', colosenses: 'COL', tesalonicenses: '1TH', timoteo: '1TI', tit: 'TIT', tito: 'TIT',
  filemon: 'PHM', heb: 'HEB', hebreos: 'HEB', stg: 'JAS', santiago: 'JAS', pedro: '1PE',
  judas: 'JUD', ap: 'REV', apocalipsis: 'REV',
}
// Algunos códigos apuntan al primer libro de una serie (Samuel, Reyes, Corintios...):
// si la consulta trae "1"/"2"/"3" delante, se respeta ese número.
const SERIES: Record<string, string[]> = {
  samuel: ['1SA', '2SA'], reyes: ['1KI', '2KI'], cronicas: ['1CH', '2CH'],
  corintios: ['1CO', '2CO'], tesalonicenses: ['1TH', '2TH'], timoteo: ['1TI', '2TI'], pedro: ['1PE', '2PE'],
}

const mapaNombres = new Map<string, string>()
for (const meta of INDICES.rv1909.libros) {
  mapaNombres.set(normalizarTexto(meta.nombre), meta.codigo)
}
for (const [alias, codigo] of Object.entries(ABREVIATURAS)) {
  if (!mapaNombres.has(alias)) mapaNombres.set(alias, codigo)
}

export interface ReferenciaParseada {
  codigo: string
  capitulo: number
  versiculo?: number
  versiculoFin?: number
}

/** Interpreta consultas tipo «Juan 3:16», «Gn 1», «1 Corintios 13:4-7», «Salmos 23». */
export function parsearReferencia(consulta: string): ReferenciaParseada | null {
  const texto = normalizarTexto(consulta)
  const m = texto.match(/^(.+?)\s+(\d+)(?:\s*[:.]\s*(\d+)(?:\s*-\s*(\d+))?)?$/)
  if (!m) return null
  const nombreCrudo = m[1]
  const capitulo = parseInt(m[2], 10)
  const versiculo = m[3] ? parseInt(m[3], 10) : undefined
  const versiculoFin = m[4] ? parseInt(m[4], 10) : undefined

  // ¿Trae número de serie? p. ej. «1 corintios», «2 samuel», «1 juan»
  const conNumero = nombreCrudo.match(/^([123])\s+(.+)$/)
  if (conNumero) {
    const base = conNumero[2]
    const idx = parseInt(conNumero[1], 10) - 1
    if (SERIES[base] && SERIES[base][idx]) {
      return { codigo: SERIES[base][idx], capitulo, versiculo, versiculoFin }
    }
    if (base === 'juan' && idx >= 0 && idx <= 2) {
      return { codigo: ['1JN', '2JN', '3JN'][idx], capitulo, versiculo, versiculoFin }
    }
  }

  const codigoDirecto = mapaNombres.get(nombreCrudo)
  if (codigoDirecto) return { codigo: codigoDirecto, capitulo, versiculo, versiculoFin }
  return null
}

export interface ResultadoBusqueda {
  codigo: string
  nombre: string
  capitulo: number
  versiculo: number
  texto: string
}

const MAX_RESULTADOS = 200

/** Busca una palabra o frase en toda la Biblia de la versión indicada (offline). */
export async function buscarTexto(
  version: VersionBiblia,
  consulta: string,
  alProgresar?: (revisados: number, total: number) => void
): Promise<{ resultados: ResultadoBusqueda[]; completa: boolean }> {
  const palabras = normalizarTexto(consulta).split(' ').filter(Boolean)
  if (palabras.length === 0) return { resultados: [], completa: true }
  const metas = librosDe(version)
  const resultados: ResultadoBusqueda[] = []
  let completa = true

  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i]
    const libro = await cargarLibro(version, meta.codigo)
    for (let c = 0; c < libro.capitulos.length; c++) {
      const versos = libro.capitulos[c]
      for (let v = 0; v < versos.length; v++) {
        const normalizado = normalizarTexto(versos[v])
        if (palabras.every((p) => normalizado.includes(p))) {
          resultados.push({
            codigo: meta.codigo,
            nombre: meta.nombre,
            capitulo: c + 1,
            versiculo: v + 1,
            texto: versos[v],
          })
          if (resultados.length >= MAX_RESULTADOS) {
            completa = false
            if (alProgresar) alProgresar(i + 1, metas.length)
            return { resultados, completa }
          }
        }
      }
    }
    if (alProgresar) alProgresar(i + 1, metas.length)
  }
  return { resultados, completa }
}
