import { describe, it, expect } from 'vitest'
import {
  VERSIONES_BIBLIA,
  librosDe,
  obtenerCapitulo,
  buscarTexto,
} from '../../biblia/bibliaService'

describe('BLT (Biblia Latinoamericana Textual) en la app', () => {
  it('está registrada como cuarta versión', () => {
    const ids = VERSIONES_BIBLIA.map((v) => v.id)
    expect(ids).toEqual(['rv1909', 'vbl', 'rvg', 'blt'])
    expect(VERSIONES_BIBLIA.find((v) => v.id === 'blt')?.corta).toBe('BLT')
    expect(VERSIONES_BIBLIA.find((v) => v.id === 'blt')?.nombre).toBe(
      'Biblia Latinoamericana Textual'
    )
  })

  it('tiene los 66 libros', () => {
    const libros = librosDe('blt')
    expect(libros.length).toBe(66)
    expect(libros[0].codigo).toBe('GEN')
    expect(libros[65].codigo).toBe('REV')
  })

  it('Génesis 1 tiene 31 versículos, conserva ʼElohim y el texto viene limpio', async () => {
    const vers = await obtenerCapitulo('blt', 'GEN', 1)
    expect(vers.length).toBe(31)
    expect(vers[0]).toContain('Elohim creó los cielos y la tierra')
    expect(vers[1]).toContain('desolada y vacía')
    for (const v of vers) {
      expect(v).not.toMatch(/\\[a-z]/)
    }
  })

  it('Juan 1:18 trae la lectura de los textos críticos («Unigénito Dios»)', async () => {
    const vers = await obtenerCapitulo('blt', 'JHN', 1)
    expect(vers.length).toBe(51)
    expect(vers[17]).toContain('Unigénito Dios')
  })

  it('la búsqueda encuentra texto en la BLT', async () => {
    const { resultados } = await buscarTexto('blt', 'Yavé es mi Pastor')
    expect(resultados.length).toBeGreaterThan(0)
    expect(resultados.some((r) => r.codigo === 'PSA' && r.capitulo === 23)).toBe(true)
  })
})
