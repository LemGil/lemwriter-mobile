// src/lib/fsAdapter.ts
//
// Abstracción de sistema de archivos para LemWriter Local.
// folderStore trabaja contra esta interfaz; la implementación real en el
// teléfono es CapacitorFsAdapter (fsCapacitor.ts) y en pruebas se usa
// MemoryFsAdapter. Todas las rutas son relativas a la raíz elegida.

export interface FsAdapter {
  mkdir(path: string): Promise<void>
  readdir(path: string): Promise<string[]>
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  removeFile(path: string): Promise<void>
  removeDir(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

// ─── Implementación en memoria (pruebas) ─────────────────────────────────────

export class MemoryFsAdapter implements FsAdapter {
  private files = new Map<string, string>()
  private dirs = new Set<string>([''])

  private norm(p: string): string {
    return p.split('/').filter(Boolean).join('/')
  }

  private parent(p: string): string {
    const n = this.norm(p)
    const i = n.lastIndexOf('/')
    return i === -1 ? '' : n.slice(0, i)
  }

  async mkdir(path: string): Promise<void> {
    const parts = this.norm(path).split('/').filter(Boolean)
    let cur = ''
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part
      this.dirs.add(cur)
    }
  }

  async readdir(path: string): Promise<string[]> {
    const base = this.norm(path)
    if (!this.dirs.has(base)) throw new Error(`ENOENT: ${path}`)
    const out = new Set<string>()
    for (const d of this.dirs) {
      if (d && this.parent(d) === base) out.add(d.slice(base ? base.length + 1 : 0))
    }
    for (const f of this.files.keys()) {
      if (this.parent(f) === base) out.add(f.slice(base ? base.length + 1 : 0))
    }
    return [...out]
  }

  async readFile(path: string): Promise<string> {
    const n = this.norm(path)
    const v = this.files.get(n)
    if (v === undefined) throw new Error(`ENOENT: ${path}`)
    return v
  }

  async writeFile(path: string, data: string): Promise<void> {
    const n = this.norm(path)
    const parent = this.parent(n)
    if (parent) await this.mkdir(parent)
    this.files.set(n, data)
    this.dirs.add(parent)
  }

  async rename(from: string, to: string): Promise<void> {
    const f = this.norm(from)
    const t = this.norm(to)
    if (this.files.has(f)) {
      this.files.set(t, this.files.get(f)!)
      this.files.delete(f)
      return
    }
    if (this.dirs.has(f)) {
      const remap = (p: string) => (p === f ? t : p.startsWith(f + '/') ? t + p.slice(f.length) : p)
      const newDirs = new Set<string>()
      for (const d of this.dirs) newDirs.add(remap(d))
      this.dirs = newDirs
      const newFiles = new Map<string, string>()
      for (const [k, v] of this.files) newFiles.set(remap(k), v)
      this.files = newFiles
      return
    }
    throw new Error(`ENOENT: ${from}`)
  }

  async removeFile(path: string): Promise<void> {
    this.files.delete(this.norm(path))
  }

  async removeDir(path: string): Promise<void> {
    const n = this.norm(path)
    for (const f of [...this.files.keys()]) {
      if (f === n || f.startsWith(n + '/')) this.files.delete(f)
    }
    for (const d of [...this.dirs]) {
      if (d === n || d.startsWith(n + '/')) this.dirs.delete(d)
    }
  }

  async exists(path: string): Promise<boolean> {
    const n = this.norm(path)
    return this.files.has(n) || this.dirs.has(n)
  }
}
