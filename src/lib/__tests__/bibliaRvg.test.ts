import { describe, it, expect } from 'vitest'
import {
  VERSIONES_BIBLIA,
  librosDe,
  obtenerCapitulo,
  buscarTexto,
  etiquetaReferencia,
  type VersionBiblia,
} from '../../biblia/bibliaService'

describe('RVG (Reina-Valera Gómez) en la app', () => {
  it('está registrada como tercera versión', () => {
    const ids = VERSIONES_BIBLIA.map((v) => v.id)
    expect(ids).toEqual(['rv1909', 'vbl', 'rvg'])
    expect(VERSIONES_BIBLIA.find((v) => v.id === 'rvg')?.corta).toBe('RVG')
  })

  it('tiene los 66 libros', () => {
    const libros = librosDe('rvg')
    expect(libros.length).toBe(66)
    expect(libros[0].codigo).toBe('GEN')
    expect(libros[65].codigo).toBe('REV')
  })

  it('Génesis 1 tiene 31 versículos y texto limpio', async () => {
    const vers = await obtenerCapitulo('rvg', 'GEN', 1)
    expect(vers.length).toBe(31)
    expect(vers[0]).toBe('En el principio creó Dios el cielo y la tierra.')
    for (const v of vers) {
      expect(v).not.toMatch(/\\[a-z]/)
      expect(v).not.toContain('strong=')
    }
  })

  it('la búsqueda funciona en RVG', async () => {
    const { resultados } = await buscarTexto('rvg', 'amó Dios al mundo', undefined)
    const juan316 = resultados.find((r) => r.codigo === 'JHN' && r.capitulo === 3 && r.versiculo === 16)
    expect(juan316).toBeDefined()
  })

  it('la etiqueta de referencia usa RVG', () => {
    expect(etiquetaReferencia('rvg', 'JHN', 3, 16)).toBe('Juan 3:16')
  })

  it('todas las versiones cargan el mismo capítulo sin errores', async () => {
    for (const v of ['rv1909', 'vbl', 'rvg'] as VersionBiblia[]) {
      const vers = await obtenerCapitulo(v, 'PSA', 23)
      expect(vers.length).toBeGreaterThan(0)
    }
  })
})
