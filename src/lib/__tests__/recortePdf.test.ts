// src/lib/__tests__/recortePdf.test.ts
//
// Pruebas del recorte del fondo vacío al final del lienzo: la última fila
// con contenido manda; el sobrante de puro fondo no llega al PDF.

import { describe, it, expect } from 'vitest'
import { ultimaFilaConContenido } from '../compartirImagen'

const FONDO: [number, number, number] = [10, 26, 49] // #0A1A31

function lienzoDe(ancho: number, alto: number): Uint8ClampedArray {
  const datos = new Uint8ClampedArray(ancho * alto * 4)
  for (let i = 0; i < datos.length; i += 4) {
    datos[i] = FONDO[0]
    datos[i + 1] = FONDO[1]
    datos[i + 2] = FONDO[2]
    datos[i + 3] = 255
  }
  return datos
}

function pintar(datos: Uint8ClampedArray, ancho: number, x: number, y: number) {
  const i = (y * ancho + x) * 4
  datos[i] = 245
  datos[i + 1] = 241
  datos[i + 2] = 232
  datos[i + 3] = 255
}

describe('compartirImagen: recorte del fondo vacío', () => {
  it('todo fondo: no hay contenido', () => {
    expect(ultimaFilaConContenido(lienzoDe(4, 5), 4, 5, FONDO)).toBe(-1)
  })

  it('contenido en la última fila: esa es la última', () => {
    const datos = lienzoDe(4, 5)
    pintar(datos, 4, 0, 4)
    expect(ultimaFilaConContenido(datos, 4, 5, FONDO)).toBe(4)
  })

  it('cola de fondo tras el contenido: se detecta la fila real', () => {
    const datos = lienzoDe(6, 9)
    pintar(datos, 6, 2, 3)
    expect(ultimaFilaConContenido(datos, 6, 9, FONDO)).toBe(3)
  })

  it('ruido dentro de la tolerancia no cuenta como contenido', () => {
    const datos = lienzoDe(4, 5)
    const i = (4 * 4 + 0) * 4
    datos[i] = FONDO[0] + 8
    datos[i + 1] = FONDO[1] + 8
    expect(ultimaFilaConContenido(datos, 4, 5, FONDO)).toBe(-1)
  })
})
