// src/lib/__tests__/obsidianVaultNativa.test.ts
//
// Ruta del vault de Obsidian en la APK: se guarda como "base:ruta"
// (p. ej. "external:MinisterioWiki/raw") y tiene un valor por defecto.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  rutaVaultNativa,
  guardarRutaVaultNativa,
  etiquetaRutaVault,
} from '../../services/obsidianFsService'

const CLAVE = 'lw_obsidian_vault'

beforeEach(() => {
  localStorage.removeItem(CLAVE)
})

describe('obsidianFsService: ruta del vault en la APK', () => {
  it('por defecto apunta a Almacenamiento/MinisterioWiki/raw', () => {
    expect(rutaVaultNativa()).toEqual({ base: 'external', ruta: 'MinisterioWiki/raw' })
    expect(etiquetaRutaVault()).toBe('Almacenamiento/MinisterioWiki/raw')
  })

  it('guarda y lee la ruta elegida', () => {
    guardarRutaVaultNativa('documents', 'MisVaults/raw')
    expect(rutaVaultNativa()).toEqual({ base: 'documents', ruta: 'MisVaults/raw' })
    expect(etiquetaRutaVault()).toBe('Documentos/MisVaults/raw')
  })

  it('un valor corrupto vuelve al defecto sin romper', () => {
    localStorage.setItem(CLAVE, 'basura-sin-formato')
    expect(rutaVaultNativa()).toEqual({ base: 'external', ruta: 'MinisterioWiki/raw' })
    localStorage.setItem(CLAVE, 'otro:MinisterioWiki/raw')
    expect(rutaVaultNativa()).toEqual({ base: 'external', ruta: 'MinisterioWiki/raw' })
  })

  it('la ruta puede contener dos puntos (se respeta todo tras el primero)', () => {
    guardarRutaVaultNativa('external', 'Mis cosas/raw')
    expect(rutaVaultNativa()).toEqual({ base: 'external', ruta: 'Mis cosas/raw' })
  })
})
