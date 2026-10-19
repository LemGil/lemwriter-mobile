// Concordancia Strong (español) para la RVG — offline.
// Al tocar una palabra etiquetada se muestra su número Strong, la palabra en
// hebreo/griego, la transliteración y el significado en español.
//
// Datos (chunks que se cargan bajo demanda):
//  - datos/strong/diccionario-es.json: { "H7225": {l, x, p, g?, d?, en?} }
//    Fuentes: Sociedades Bíblicas Unidas, diccionarios de hebreo bíblico y griego
//    del NT en español (CC BY-SA 4.0) + Open Scriptures (CC BY-SA):
//    transliteración y definición en inglés como respaldo.
//  - datos/strong/rvg-palabras.json: { GEN: { "1": { "1": [[idxPalabra, "H7225"]] } } }
//    Alineación palabra->Strong generada del USFM de la RVG (eBible sparvg).
//    idxPalabra es el índice en el tokenizado del versículo con REGEX_PALABRA,
//    el MISMO que usa el script construir-strong.py — no cambiarlo sin
//    regenerar los datos.

export interface EntradaStrong {
  /** Lema en hebreo/griego */
  l: string
  /** Transliteración */
  x: string
  /** Parte del discurso, en español */
  p: string
  /** Glosas en español */
  g?: string[]
  /** Definición corta en español */
  d?: string
  /** Definición en inglés (respaldo, solo cuando no hay español) */
  en?: string
}

export const CREDITOS_STRONG =
  'Diccionario hebreo/griego: © Sociedades Bíblicas Unidas (CC BY-SA 4.0) · ' +
  'Transliteración: Open Scriptures (CC BY-SA)'

const REGEX_PALABRA = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:-[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*/g

/** Parte el versículo en palabras según el tokenizador oficial. */
export function tokenizarVersiculo(texto: string): string[] {
  return texto.match(REGEX_PALABRA) ?? []
}

export interface FragmentoVersiculo {
  texto: string
  esPalabra: boolean
  /** Índice de la palabra (coincide con rvg-palabras.json); -1 si no es palabra */
  indicePalabra: number
}

/** Parte el versículo en fragmentos (palabras y separadores) conservando el texto exacto. */
export function partirVersiculo(texto: string): FragmentoVersiculo[] {
  const out: FragmentoVersiculo[] = []
  const re = new RegExp(REGEX_PALABRA.source, 'g')
  let ultimo = 0
  let idx = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) {
      out.push({ texto: texto.slice(ultimo, m.index), esPalabra: false, indicePalabra: -1 })
    }
    out.push({ texto: m[0], esPalabra: true, indicePalabra: idx++ })
    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) {
    out.push({ texto: texto.slice(ultimo), esPalabra: false, indicePalabra: -1 })
  }
  return out
}

type MapaFuertes = Record<string, Record<string, Record<string, [number, string][]>>>

let cacheDiccionario: Promise<Record<string, EntradaStrong>> | null = null
let cachePalabras: Promise<MapaFuertes> | null = null

export function cargarDiccionarioStrong(): Promise<Record<string, EntradaStrong>> {
  if (!cacheDiccionario) {
    cacheDiccionario = import('./datos/strong/diccionario-es.json').then(
      (mod) => mod.default as Record<string, EntradaStrong>
    )
  }
  return cacheDiccionario
}

export function cargarPalabrasStrong(): Promise<MapaFuertes> {
  if (!cachePalabras) {
    cachePalabras = import('./datos/strong/rvg-palabras.json').then(
      (mod) => mod.default as unknown as MapaFuertes
    )
  }
  return cachePalabras
}

/** Devuelve el mapa índice-de-palabra -> código Strong del versículo (vacío si no hay). */
export async function fuertesDelVersiculo(
  libro: string,
  capitulo: number,
  versiculo: number
): Promise<Map<number, string>> {
  try {
    const todo = await cargarPalabrasStrong()
    const arr = todo?.[libro]?.[String(capitulo)]?.[String(versiculo)] ?? []
    return new Map(arr)
  } catch {
    return new Map()
  }
}

export async function buscarStrong(codigo: string): Promise<EntradaStrong | undefined> {
  try {
    const dic = await cargarDiccionarioStrong()
    return dic[codigo.toUpperCase()]
  } catch {
    return undefined
  }
}

/** ¿Es hebreo (AT) o griego (NT) según el prefijo del código? */
export function idiomaStrong(codigo: string): 'hebreo' | 'griego' {
  return codigo.toUpperCase().startsWith('H') ? 'hebreo' : 'griego'
}
