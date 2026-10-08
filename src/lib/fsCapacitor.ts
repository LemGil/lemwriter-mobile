// src/lib/fsCapacitor.ts
//
// Implementación real de FsAdapter sobre @capacitor/filesystem.
// Las rutas son relativas a Directory.Documents del teléfono, de modo que
// la raíz (por defecto "LemWriter") queda en Documentos/LemWriter: visible
// en el administrador de archivos y a salvo de desinstalaciones.
//
// SOLO debe importarse en la app (Capacitor); en pruebas se usa
// MemoryFsAdapter (fsAdapter.ts).

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { FsAdapter } from './fsAdapter'

const ROOT_DIRECTORY = Directory.Documents

export class CapacitorFsAdapter implements FsAdapter {
  async mkdir(path: string): Promise<void> {
    try {
      await Filesystem.mkdir({ path, directory: ROOT_DIRECTORY, recursive: true })
    } catch (e: any) {
      // Ya existe: no es un error para nosotros
      if (!/exist/i.test(String(e?.message ?? e))) throw e
    }
  }

  async readdir(path: string): Promise<string[]> {
    const res = await Filesystem.readdir({ path, directory: ROOT_DIRECTORY })
    return res.files.map((f: any) => (typeof f === 'string' ? f : f.name))
  }

  async readFile(path: string): Promise<string> {
    const res = await Filesystem.readFile({
      path,
      directory: ROOT_DIRECTORY,
      encoding: Encoding.UTF8,
    })
    return typeof res.data === 'string' ? res.data : await (res.data as Blob).text()
  }

  async writeFile(path: string, data: string): Promise<void> {
    const parent = path.split('/').slice(0, -1).join('/')
    if (parent) await this.mkdir(parent)
    await Filesystem.writeFile({
      path,
      data,
      directory: ROOT_DIRECTORY,
      encoding: Encoding.UTF8,
    })
  }

  async rename(from: string, to: string): Promise<void> {
    await Filesystem.rename({ from, to, directory: ROOT_DIRECTORY, toDirectory: ROOT_DIRECTORY })
  }

  async removeFile(path: string): Promise<void> {
    await Filesystem.deleteFile({ path, directory: ROOT_DIRECTORY })
  }

  async removeDir(path: string): Promise<void> {
    await Filesystem.rmdir({ path, directory: ROOT_DIRECTORY, recursive: true })
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path, directory: ROOT_DIRECTORY })
      return true
    } catch {
      return false
    }
  }
}
