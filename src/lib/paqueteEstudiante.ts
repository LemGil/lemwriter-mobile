// src/lib/paqueteEstudiante.ts
//
// Paquete de academia para la app del estudiante (Academia del Espíritu).
//
// El maestro genera el paquete DESDE LemWriter: el proyecto tipo Academia
// lleva un IDENTIFICADOR MANUAL (autor + número, ej. «lemgil-14») que él
// asigna para darle el orden que desee. Ese identificador viaja dentro
// del paquete y es la identidad con la que la app del estudiante reconoce
// la academia: mismo identificador → la app ACTUALIZA el contenido y
// conserva el progreso del estudiante; identificador nuevo → academia
// nueva en su lista. Como el identificador incluye al autor, academias
// de pastores distintos no se pisan en un mismo teléfono.
//
// Formato del paquete (el mismo que la app del estudiante importa):
//   { "tipo": "paquete-academia", "formato": 1, "generada": "2026-10-31",
//     "academia": { "id": "lemgil-14", "numero": "Nº 14", "titulo": "...",
//                   "autor": "LemGil Apóstol",
//                   "codigos": [{ "id": "lemgil-14-c1", "titulo": "...",
//                                 "subtitulo": "", "cuerpo": "markdown" }],
//                   "cierre": "" } }
//
// Cada sección del proyecto se vuelve un código, en el orden del
// proyecto; el cuerpo es el markdown de la sección (htmlToMarkdown, el
// mismo que guardan las carpetas locales), que es lo que el lector de
// la app del estudiante sabe mostrar.

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { htmlToMarkdown } from './folderStore'

export interface SeccionParaPaquete {
  title: string
  content: string
  order_index: number
}

export interface CodigoPaquete {
  id: string
  titulo: string
  subtitulo: string
  cuerpo: string
}

export interface AcademiaPaquete {
  id: string
  numero: string
  titulo: string
  autor?: string
  codigos: CodigoPaquete[]
  cierre: string
}

export interface PaqueteEstudiante {
  tipo: 'paquete-academia'
  formato: 1
  generada: string
  academia: AcademiaPaquete
}

/** Autor sugerido por defecto (el maestro puede cambiarlo en el modal). */
export const AUTOR_POR_DEFECTO = 'LemGil Apóstol'

/**
 * Normaliza lo que el maestro escribió como identificador: minúsculas,
 * sin acentos, espacios y guiones bajos → «-», solo letras/números/«-».
 * Ej.: «LemGil 14» → «lemgil-14»; « Mi Academia 2 » → «mi-academia-2».
 */
export function normalizarIdentificador(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Un identificador válido: grupos de letras/números unidos por «-». */
export function esIdentificadorValido(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id ?? '')
}

/**
 * Número visible de la academia, derivado del identificador:
 * «lemgil-14» → «Nº 14». Sin número al final → '' (la app del estudiante
 * la ordena al final de la lista).
 */
export function numeroVisibleDesdeId(id: string): string {
  const m = /(\d+)$/.exec(id ?? '')
  return m ? `Nº ${parseInt(m[1], 10)}` : ''
}

/**
 * Revisa los datos antes de generar el paquete. Devuelve el mensaje de
 * error listo para mostrar, o null si todo está bien.
 */
export function validarDatosPaquete(opts: {
  identificador: string
  titulo: string
  secciones: SeccionParaPaquete[]
  idEnOtroProyecto?: string | null
}): string | null {
  const id = (opts.identificador ?? '').trim()
  if (!id) {
    return 'Escribe el identificador de la academia (autor + número, ej. lemgil-14). Tú lo asignas a mano: con él la app del estudiante reconoce la academia y la ordena.'
  }
  if (!esIdentificadorValido(id)) {
    return 'El identificador solo puede llevar letras minúsculas, números y guiones (ej. lemgil-14). Sin espacios ni acentos.'
  }
  if (opts.idEnOtroProyecto) {
    return `Ese identificador ya lo usa el proyecto «${opts.idEnOtroProyecto}». Si dos academias comparten identificador, en el teléfono la una sobrescribe a la otra: dale un número distinto.`
  }
  if (!(opts.titulo ?? '').trim()) {
    return 'El proyecto necesita un título: será el nombre de la academia en la app del estudiante.'
  }
  const conTexto = opts.secciones.filter((s) => htmlToMarkdown(s.content ?? '').trim().length > 0)
  if (conTexto.length === 0) {
    return 'Este proyecto no tiene secciones con texto todavía: escribe al menos una para generar el paquete.'
  }
  return null
}

/**
 * Construye el paquete listo para serializar. Las secciones vacías se
 * omiten (se avisa en `omitidas`); los códigos quedan en el orden del
 * proyecto y con ids «<identificador>-c1», «-c2», ... — la posición es
 * la que conserva el progreso del estudiante al actualizar.
 */
export function construirPaquete(opts: {
  identificador: string
  titulo: string
  autor?: string
  secciones: SeccionParaPaquete[]
  fecha?: string
}): { paquete: PaqueteEstudiante; omitidas: number } {
  const id = (opts.identificador ?? '').trim()
  const ordenadas = [...opts.secciones].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  const codigos: CodigoPaquete[] = []
  let omitidas = 0
  for (const s of ordenadas) {
    const cuerpo = htmlToMarkdown(s.content ?? '').trim()
    if (!cuerpo) {
      omitidas++
      continue
    }
    codigos.push({
      id: `${id}-c${codigos.length + 1}`,
      titulo: (s.title ?? '').trim() || `Código ${codigos.length + 1}`,
      subtitulo: '',
      cuerpo,
    })
  }
  const autor = (opts.autor ?? '').trim()
  const paquete: PaqueteEstudiante = {
    tipo: 'paquete-academia',
    formato: 1,
    generada: opts.fecha ?? new Date().toISOString().slice(0, 10),
    academia: {
      id,
      numero: numeroVisibleDesdeId(id),
      titulo: (opts.titulo ?? '').trim(),
      ...(autor ? { autor } : {}),
      codigos,
      cierre: '',
    },
  }
  return { paquete, omitidas }
}

export function serializarPaquete(paquete: PaqueteEstudiante): string {
  return JSON.stringify(paquete, null, 1)
}

/** Nombre del archivo del paquete: «lemgil-14.json». */
export function nombreArchivoPaquete(paquete: PaqueteEstudiante): string {
  return `${paquete.academia.id}.json`
}

/**
 * Ruta visible de la copia local del paquete: la carpeta pública de
 * documentos del teléfono, junto a las carpetas de LemWriter
 * (Documentos/LemWriter/Paquetes/<id>.json). Se puede buscar con la
 * app de Archivos e importar desde ahí, sin pasar por ningún chat.
 */
export function rutaLocalPaquete(paquete: PaqueteEstudiante): string {
  return `LemWriter/Paquetes/${nombreArchivoPaquete(paquete)}`
}

/**
 * Guarda una copia del paquete en Documentos/LemWriter/Paquetes/ y
 * devuelve su ruta; si no se puede (web, permisos), devuelve null y el
 * compartir sigue funcionando igual.
 */
export async function guardarPaqueteEnLocal(paquete: PaqueteEstudiante): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const ruta = rutaLocalPaquete(paquete)
    await Filesystem.writeFile({
      path: ruta,
      data: serializarPaquete(paquete),
      directory: Directory.Documents,
      recursive: true,
      encoding: Encoding.UTF8,
    })
    return ruta
  } catch {
    return null
  }
}

/**
 * Guarda el paquete como archivo y abre la hoja de compartir del
 * teléfono (WhatsApp, Bluetooth, USB…), igual que el respaldo ZIP.
 * Antes de compartir deja una copia en Documentos/LemWriter/Paquetes/
 * (ver guardarPaqueteEnLocal). En web descarga el archivo.
 * Devuelve el nombre del archivo y la ruta local (o null).
 */
export async function compartirPaqueteEstudiante(
  paquete: PaqueteEstudiante
): Promise<{ nombre: string; rutaLocal: string | null }> {
  const nombre = nombreArchivoPaquete(paquete)
  const json = serializarPaquete(paquete)
  const rutaLocal = await guardarPaqueteEnLocal(paquete)
  if (Capacitor.isNativePlatform()) {
    const escritura = await Filesystem.writeFile({
      path: `paquetes/${nombre}`,
      data: json,
      directory: Directory.Cache,
      recursive: true,
      encoding: Encoding.UTF8,
    })
    await Share.share({
      title: `Paquete de academia: ${paquete.academia.titulo}`,
      dialogTitle: 'Compartir paquete de academia',
      files: [escritura.uri],
    })
    return { nombre, rutaLocal }
  }
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return { nombre, rutaLocal }
}
