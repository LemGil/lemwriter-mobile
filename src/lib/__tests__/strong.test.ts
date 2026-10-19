import { describe, it, expect } from 'vitest'
import {
  tokenizarVersiculo,
  partirVersiculo,
  fuertesDelVersiculo,
  buscarStrong,
  idiomaStrong,
} from '../../biblia/strongService'
import diccionario from '../../biblia/datos/strong/diccionario-es.json'
import palabras from '../../biblia/datos/strong/rvg-palabras.json'

describe('Concordancia Strong (RVG)', () => {
  it('el tokenizador parte igual que el script de construcción (incluye guiones)', () => {
    const toks = tokenizarVersiculo('Fue a Padan-aram, y vio el cielo.')
    expect(toks).toEqual(['Fue', 'a', 'Padan-aram', 'y', 'vio', 'el', 'cielo'])
    // partirVersiculo conserva el texto exacto y los índices coinciden
    const frags = partirVersiculo('Fue a Padan-aram, y vio el cielo.')
    expect(frags.map((f) => f.texto).join('')).toBe('Fue a Padan-aram, y vio el cielo.')
    const palabrasFrag = frags.filter((f) => f.esPalabra)
    expect(palabrasFrag.map((f) => f.texto)).toEqual(toks)
    expect(palabrasFrag.map((f) => f.indicePalabra)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('los índices de rvg-palabras apuntan a la palabra correcta (Gn 1:1)', async () => {
    const mapa = await fuertesDelVersiculo('GEN', 1, 1)
    expect(mapa.get(2)).toBe('H7225')
    expect(mapa.get(6)).toBe('H8064')
    const toks = tokenizarVersiculo('En el principio creó Dios el cielo y la tierra.')
    expect(toks[2]).toBe('principio')
    expect(toks[6]).toBe('cielo')
  })

  it('todo código usado en rvg-palabras existe en el diccionario', () => {
    const dic = diccionario as Record<string, unknown>
    const faltan = new Set<string>()
    for (const caps of Object.values(palabras)) {
      for (const vers of Object.values(caps as unknown as Record<string, Record<string, [number, string][]>>)) {
        for (const pares of Object.values(vers)) {
          for (const [, codigo] of pares) {
            if (!dic[codigo]) faltan.add(codigo)
          }
        }
      }
    }
    expect([...faltan]).toEqual([])
  })

  it('buscarStrong devuelve español cuando hay (H7225)', async () => {
    const e = await buscarStrong('H7225')
    expect(e).toBeDefined()
    expect(e!.l.normalize('NFC')).toBe('רֵאשִׁית'.normalize('NFC'))
    expect(e!.x).toBeTruthy()
    expect(e!.g).toContain('principio')
    expect(e!.d).toBeTruthy()
    expect(e!.en).toBeUndefined()
  })

  it('buscarStrong usa el inglés como respaldo cuando no hay español (G1510)', async () => {
    const e = await buscarStrong('G1510')
    expect(e).toBeDefined()
    expect(e!.l).toBe('εἰμί')
    expect(e!.d).toBeFalsy()
    expect(e!.en).toBeTruthy()
  })

  it('buscarStrong es insensible a mayúsculas y ceros', async () => {
    const e = await buscarStrong('h7225')
    expect(e?.l.normalize('NFC')).toBe('רֵאשִׁית'.normalize('NFC'))
  })

  it('idiomaStrong distingue hebreo y griego', () => {
    expect(idiomaStrong('H7225')).toBe('hebreo')
    expect(idiomaStrong('G3056')).toBe('griego')
  })

  it('versículos sin etiquetas devuelven mapa vacío', async () => {
    const mapa = await fuertesDelVersiculo('GEN', 1, 999)
    expect(mapa.size).toBe(0)
  })
})
