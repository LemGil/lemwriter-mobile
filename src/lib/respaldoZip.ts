// src/lib/respaldoZip.ts
//
// Núcleo del respaldo/restauración ZIP de las carpetas de LemWriter Local.
// Trabaja contra una interfaz de archivos mínima para poder probarse
// con un sistema de archivos falso; el componente de UI le pasa la
// implementación real de Capacitor.

import JSZip from 'jszip'

export interface ZipFs {
  /** Entradas de una carpeta: nombre y tipo ('file' | 'directory'). */
  readdir(path: string): Promise<{ name: string; type: string }[]>
  /** Lee un archivo y lo devuelve en base64. */
  readFileBase64(path: string): Promise<string>
  /** Crea una carpeta (recursivo). */
  mkdir(path: string): Promise<void>
  /** Escribe un archivo binario desde base64. */
  writeFileBase64(path: string, base64: string): Promise<void>
}

/** Limpia una ruta dentro del ZIP: sin absolutos ni «..». Devuelve '' si es peligrosa. */
export function rutaSegura(ruta: string): string {
  const limpio = ruta.replace(/^\/+/, '').trim()
  if (!limpio || limpio.includes('..')) return ''
  return limpio
}

async function agregarAlZip(
  fs: ZipFs,
  zip: JSZip,
  carpetaFs: string,
  carpetaZip: string
): Promise<number> {
  let n = 0
  for (const e of await fs.readdir(carpetaFs)) {
    const rutaFs = carpetaFs ? `${carpetaFs}/${e.name}` : e.name
    const rutaZip = carpetaZip ? `${carpetaZip}/${e.name}` : e.name
    if (e.type === 'directory') {
      n += await agregarAlZip(fs, zip, rutaFs, rutaZip)
    } else {
      zip.file(rutaZip, await fs.readFileBase64(rutaFs), { base64: true })
      n++
    }
  }
  return n
}

/**
 * Comprime toda la raíz en un ZIP (con rutas relativas a la raíz, para que
 * el respaldo sirva aunque cambie el nombre de la carpeta). Devuelve el blob
 * y cuántos archivos incluyó. Lanza si la raíz está vacía.
 */
export async function crearRespaldoZip(
  fs: ZipFs,
  raiz: string
): Promise<{ blob: Blob; archivos: number }> {
  const zip = new JSZip()
  const archivos = await agregarAlZip(fs, zip, raiz, '')
  if (archivos === 0) throw new Error('La carpeta raíz no tiene archivos que respaldar.')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { blob, archivos }
}

/**
 * Restaura un ZIP de respaldo sobre la raíz (los archivos del ZIP
 * sobrescriben los actuales). Devuelve cuántos archivos escribió.
 */
export async function restaurarRespaldoZip(
  fs: ZipFs,
  raiz: string,
  datos: Blob | ArrayBuffer | Uint8Array
): Promise<number> {
  const zip = await JSZip.loadAsync(datos)
  const entradas = Object.values(zip.files).filter((f) => !f.dir)
  if (entradas.length === 0) throw new Error('El ZIP no trae archivos.')
  let n = 0
  for (const entry of entradas) {
    const limpio = rutaSegura(entry.name)
    if (!limpio) continue
    const destino = `${raiz}/${limpio}`
    const carpeta = destino.split('/').slice(0, -1).join('/')
    if (carpeta) await fs.mkdir(carpeta)
    await fs.writeFileBase64(destino, await entry.async('base64'))
    n++
  }
  return n
}
