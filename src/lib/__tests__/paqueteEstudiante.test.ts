import { describe, it, expect } from 'vitest'
import {
  normalizarIdentificador,
  esIdentificadorValido,
  numeroVisibleDesdeId,
  validarDatosPaquete,
  construirPaquete,
  nombreArchivoPaquete,
  type SeccionParaPaquete
} from '../paqueteEstudiante'

const secciones: SeccionParaPaquete[] = [
  { title: 'Código 2', content: '<p>Segundo <strong>importante</strong></p>', order_index: 1 },
  { title: 'Código 1', content: '<p>Primero</p>', order_index: 0 },
  { title: 'Vacía', content: '<p>   </p>', order_index: 2 }
]

describe('Identificador manual de la academia', () => {
  it('normaliza lo que escribe el maestro', () => {
    expect(normalizarIdentificador('LemGil 14')).toBe('lemgil-14')
    expect(normalizarIdentificador('  Mi Academia_2 ')).toBe('mi-academia-2')
    expect(normalizarIdentificador('Álef 3')).toBe('alef-3')
    expect(normalizarIdentificador('lemgil--14')).toBe('lemgil-14')
    expect(normalizarIdentificador('')).toBe('')
  })

  it('valida el formato autor-número', () => {
    expect(esIdentificadorValido('lemgil-14')).toBe(true)
    expect(esIdentificadorValido('a1')).toBe(true)
    expect(esIdentificadorValido('LemGil-14')).toBe(false)
    expect(esIdentificadorValido('lemgil 14')).toBe(false)
    expect(esIdentificadorValido('-lemgil')).toBe(false)
    expect(esIdentificadorValido('')).toBe(false)
  })

  it('deriva el número visible que ordena la lista del estudiante', () => {
    expect(numeroVisibleDesdeId('lemgil-14')).toBe('Nº 14')
    expect(numeroVisibleDesdeId('lemgil-007')).toBe('Nº 7')
    expect(numeroVisibleDesdeId('camino-fe')).toBe('')
  })
})

describe('Validación antes de generar', () => {
  it('exige identificador, título y secciones con texto', () => {
    expect(validarDatosPaquete({ identificador: '', titulo: 'X', secciones })).toMatch(/identificador/i)
    expect(
      validarDatosPaquete({ identificador: 'Con Espacios', titulo: 'X', secciones })
    ).toMatch(/minúsculas/)
    expect(
      validarDatosPaquete({ identificador: 'lemgil-14', titulo: ' ', secciones })
    ).toMatch(/título/i)
    expect(
      validarDatosPaquete({
        identificador: 'lemgil-14',
        titulo: 'X',
        secciones: [{ title: 'S', content: '<p> </p>', order_index: 0 }]
      })
    ).toMatch(/secciones con texto/i)
    expect(validarDatosPaquete({ identificador: 'lemgil-14', titulo: 'X', secciones })).toBeNull()
  })

  it('bloquea un identificador repetido en otro proyecto', () => {
    const err = validarDatosPaquete({
      identificador: 'lemgil-14',
      titulo: 'X',
      secciones,
      idEnOtroProyecto: 'Descodificando la Fe'
    })
    expect(err).toMatch(/Descodificando la Fe/)
  })
})

describe('Construcción del paquete (formato de la app del estudiante)', () => {
  const { paquete, omitidas } = construirPaquete({
    identificador: 'lemgil-14',
    titulo: 'Descodificando el Reposo',
    autor: ' LemGil Apóstol ',
    secciones,
    fecha: '2026-10-31'
  })

  it('lleva la envoltura y la identidad que la app reconoce', () => {
    expect(paquete.tipo).toBe('paquete-academia')
    expect(paquete.formato).toBe(1)
    expect(paquete.generada).toBe('2026-10-31')
    expect(paquete.academia.id).toBe('lemgil-14')
    expect(paquete.academia.numero).toBe('Nº 14')
    expect(paquete.academia.autor).toBe('LemGil Apóstol')
    expect(nombreArchivoPaquete(paquete)).toBe('lemgil-14.json')
  })

  it('un código por sección, en orden, con ids por posición y cuerpo markdown', () => {
    expect(omitidas).toBe(1)
    expect(paquete.academia.codigos.map((c) => c.id)).toEqual(['lemgil-14-c1', 'lemgil-14-c2'])
    expect(paquete.academia.codigos[0].titulo).toBe('Código 1')
    expect(paquete.academia.codigos[1].cuerpo).toContain('**importante**')
    for (const c of paquete.academia.codigos) {
      expect(c.id.startsWith('lemgil-14-')).toBe(true)
      expect(typeof c.subtitulo).toBe('string')
      expect(c.cuerpo.length).toBeGreaterThan(0)
    }
  })

  it('sin autor no incluye el campo', () => {
    const { paquete: sinAutor } = construirPaquete({
      identificador: 'otro-1',
      titulo: 'X',
      secciones
    })
    expect('autor' in sinAutor.academia).toBe(false)
  })
})
