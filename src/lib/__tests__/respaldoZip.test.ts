import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import {
  crearRespaldoZip,
  restaurarRespaldoZip,
  rutaSegura,
  type ZipFs,
} from '../respaldoZip'

/** ZipFs falso en memoria: carpetas y archivos binarios en base64. */
function fsFalso(arbol: Record<string, string | null>): ZipFs {
  const archivos = new Map<string, string>()
  const carpetas = new Set<string>([''])
  for (const [ruta, contenido] of Object.entries(arbol)) {
    if (contenido === null) {
      carpetas.add(ruta)
    } else {
      archivos.set(ruta, Buffer.from(contenido, 'utf8').toString('base64'))
      let p = ruta
      while (p.includes('/')) {
        p = p.split('/').slice(0, -1).join('/')
        carpetas.add(p)
      }
    }
  }
  return {
    async readdir(path) {
      const prefijo = path ? `${path}/` : ''
      const vistos = new Map<string, string>()
      for (const c of carpetas) {
        if (c.startsWith(prefijo) && c !== path) {
          const resto = c.slice(prefijo.length)
          if (!resto.includes('/')) vistos.set(resto, 'directory')
        }
      }
      for (const a of archivos.keys()) {
        if (a.startsWith(prefijo)) {
          const resto = a.slice(prefijo.length)
          if (!resto.includes('/')) vistos.set(resto, 'file')
        }
      }
      return [...vistos.entries()].map(([name, type]) => ({ name, type }))
    },
    async readFileBase64(path) {
      const v = archivos.get(path)
      if (v === undefined) throw new Error(`ENOENT: ${path}`)
      return v
    },
    async mkdir(path) {
      carpetas.add(path)
    },
    async writeFileBase64(path, base64) {
      archivos.set(path, base64)
      let p = path
      while (p.includes('/')) {
        p = p.split('/').slice(0, -1).join('/')
        carpetas.add(p)
      }
    },
  }
}

async function contenidoZip(blob: Blob, ruta: string): Promise<string> {
  const zip = await JSZip.loadAsync(blob)
  const f = zip.file(ruta)
  if (!f) throw new Error(`Falta ${ruta} en el ZIP`)
  return f.async('string')
}

describe('respaldoZip (LemWriter Local — respaldo/restauración de carpetas)', () => {
  it('el respaldo incluye todos los archivos con su estructura', async () => {
    const fs = fsFalso({
      'LemWriter/estudios/romanos/proyecto.json': '{"titulo":"Romanos"}',
      'LemWriter/estudios/romanos/001-fe.md': '# La fe',
      'LemWriter/sermones/gracia/proyecto.json': '{"titulo":"Gracia"}',
      'LemWriter/sermones/gracia/imagenes/portada.png': 'BINARIO',
    })
    const { blob, archivos } = await crearRespaldoZip(fs, 'LemWriter')
    expect(archivos).toBe(4)
    // Las rutas dentro del ZIP son relativas a la raíz
    expect(await contenidoZip(blob, 'estudios/romanos/001-fe.md')).toBe('# La fe')
    expect(await contenidoZip(blob, 'sermones/gracia/imagenes/portada.png')).toBe('BINARIO')
  })

  it('respaldar una raíz vacía lanza error', async () => {
    const fs = fsFalso({})
    await expect(crearRespaldoZip(fs, 'LemWriter')).rejects.toThrow()
  })

  it('la restauración escribe cada archivo en su lugar', async () => {
    const origen = fsFalso({
      'LemWriter/estudios/romanos/proyecto.json': '{"titulo":"Romanos"}',
      'LemWriter/estudios/romanos/001-fe.md': '# La fe',
    })
    const { blob } = await crearRespaldoZip(origen, 'LemWriter')
    const destino = fsFalso({ 'LemWriter/sermones/viejo/proyecto.json': '{}' })
    const n = await restaurarRespaldoZip(destino, 'LemWriter', blob)
    expect(n).toBe(2)
    const leido = await destino.readFileBase64('LemWriter/estudios/romanos/001-fe.md')
    expect(Buffer.from(leido, 'base64').toString('utf8')).toBe('# La fe')
  })

  it('restaurar un ZIP vacío lanza error', async () => {
    const zip = new JSZip()
    const blob = await zip.generateAsync({ type: 'blob' })
    const fs = fsFalso({})
    await expect(restaurarRespaldoZip(fs, 'LemWriter', blob)).rejects.toThrow()
  })

  it('la restauración neutraliza rutas con «..» dentro de la raíz', async () => {
    const zip = new JSZip()
    zip.file('../../fuera.txt', 'neutralizado')
    zip.file('/absoluto.txt', 'relativo')
    zip.file('LemWriter/ok.md', 'bien')
    const blob = await zip.generateAsync({ type: 'blob' })
    const fs = fsFalso({})
    const n = await restaurarRespaldoZip(fs, 'LemWriter', blob)
    // JSZip convierte '../../fuera.txt' en 'fuera.txt': todo queda bajo la raíz
    expect(n).toBe(3)
    const leido = await fs.readFileBase64('LemWriter/fuera.txt')
    expect(Buffer.from(leido, 'base64').toString('utf8')).toBe('neutralizado')
    await expect(fs.readFileBase64('fuera.txt')).rejects.toThrow()
  })

  it('rutaSegura limpia rutas del ZIP', () => {
    expect(rutaSegura('LemWriter/a.md')).toBe('LemWriter/a.md')
    expect(rutaSegura('/LemWriter/a.md')).toBe('LemWriter/a.md')
    expect(rutaSegura('../a.md')).toBe('')
    expect(rutaSegura('a/../../b.md')).toBe('')
    expect(rutaSegura('')).toBe('')
  })
})
