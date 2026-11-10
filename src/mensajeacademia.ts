// MensajeAcademia para LemWriter — Fase D (v3, navegador).
//
// Publica en el canal TEMAS APOSTÓLICOS de la app del estudiante
// directamente desde LemWriter: construye las filas del buzón (tabla
// `lc_mensajes` de Supabase) firmadas con la llave del maestro y las
// inserta por REST, con los formatos EXACTOS que la app verifica
// (src/lemchat/buzon.ts, entrega.ts, servicio.ts de la app):
//
//   - Firma de fila: Ed25519 sobre
//     `lemchat-buzon-v1|<de>|<para>|<tipo>|<sha256hex(cuerpo)>`
//   - Sobre de paquete: { tipo:'paquete-lemchat', formato:1, academiaId,
//     paqueteTexto, claveMaestro, firma, emitido }, con firma sobre
//     `lemchat-paquete-v1|<academiaId>|<paqueteTexto>`
//   - Aviso: el cuerpo de la fila es el TEXTO PLANO del aviso.
//   - Dirección del canal: para = 'canal'.
//   - Llaves y firmas viajan en base64url, como en la app.
//
// La firma es Ed25519 con @noble/ed25519 + @noble/hashes — las mismas
// librerías de la app del estudiante — porque LemWriter se sirve en el
// navegador, donde `node:crypto` no existe. (La v2 de este módulo usaba
// `node:crypto` y tumbaba la app servida con «Module "node:crypto" has
// been externalized for browser compatibility».)

import * as ed from '@noble/ed25519'
import { sha256, sha512 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

// noble ed25519 en modo síncrono (igual que la app del estudiante):
// sin esto, firmar y derivar la llave pública serían asíncronos.
ed.etc.sha512Sync = (...mensajes: Uint8Array[]) => sha512(ed.etc.concatBytes(...mensajes))

// ---------------------------------------------------------------------------
// Utilidades puras (texto y base64url, como en la app)

const codificador = new TextEncoder()
const decodificador = new TextDecoder()

export function textoABytes(texto: string): Uint8Array {
  return codificador.encode(texto)
}

export function bytesATexto(bytes: Uint8Array): string {
  return decodificador.decode(bytes)
}

export function bytesABase64Url(bytes: Uint8Array): string {
  let binario = ''
  const trozo = 0x8000
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo))
  }
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlABytes(texto: string): Uint8Array {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/')
  const conRelleno = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binario = atob(conRelleno)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

// ---------------------------------------------------------------------------
// Ed25519 y SHA-256

/** SHA-256 de un texto (UTF-8) en hexadecimal minúscula. */
export function sha256Hex(texto: string): string {
  return bytesToHex(sha256(textoABytes(texto)))
}

/** Deriva la llave pública (base64url) desde la privada: para validar el archivo de llaves. */
export function clavePublicaDe(clavePrivadaB64: string): string {
  return bytesABase64Url(ed.getPublicKey(base64UrlABytes(clavePrivadaB64)))
}

/** Firma un texto (UTF-8) y devuelve la firma en base64url. */
export function firmarTexto(clavePrivadaB64: string, texto: string): string {
  return bytesABase64Url(ed.sign(textoABytes(texto), base64UrlABytes(clavePrivadaB64)))
}

/** Verifica una firma de texto; cualquier dato dañado devuelve false. */
export function verificarTexto(clavePublicaB64: string, firmaB64: string, texto: string): boolean {
  try {
    return ed.verify(base64UrlABytes(firmaB64), textoABytes(texto), base64UrlABytes(clavePublicaB64))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Llave del maestro (el JSON que crea scripts/lemchat-claves-maestro.mjs)

export interface LlaveMaestro {
  nombre: string
  clavePublica: string
  clavePrivada: string
}

/** Lee y VALIDA el archivo de llaves: la privada debe corresponder a la pública. */
export function cargarLlaveMaestro(textoJson: string): LlaveMaestro {
  let datos: Partial<LlaveMaestro>
  try {
    datos = JSON.parse(textoJson) as Partial<LlaveMaestro>
  } catch {
    throw new Error('el archivo de llaves del maestro no es un JSON válido')
  }
  if (!datos.clavePublica || !datos.clavePrivada) {
    throw new Error('al archivo de llaves le faltan clavePublica o clavePrivada')
  }
  let derivada: string
  try {
    derivada = clavePublicaDe(datos.clavePrivada)
  } catch {
    throw new Error('la llave privada del maestro no se pudo leer')
  }
  if (derivada !== datos.clavePublica) {
    throw new Error('la llave privada no corresponde a la pública: archivo de llaves dañado')
  }
  return {
    nombre: datos.nombre ?? 'LemGil Apóstol',
    clavePublica: datos.clavePublica,
    clavePrivada: datos.clavePrivada,
  }
}

// ---------------------------------------------------------------------------
// Filas del buzón, idénticas a las de la app (buzon.ts / entrega.ts)

export const DIRECCION_CANAL = 'canal'

export interface FilaBuzon {
  de: string
  para: string
  tipo: 'aviso' | 'paquete'
  cuerpo: string
  firma: string
}

export function textoFirmadoBuzon(de: string, para: string, tipo: string, cuerpo: string): string {
  return `lemchat-buzon-v1|${de}|${para}|${tipo}|${sha256Hex(cuerpo)}`
}

/** Firma una fila del buzón { de, para, tipo, cuerpo } y la devuelve completa. */
export function firmarFila(llave: LlaveMaestro, fila: Omit<FilaBuzon, 'firma'>): FilaBuzon {
  return {
    ...fila,
    firma: firmarTexto(
      llave.clavePrivada,
      textoFirmadoBuzon(fila.de, fila.para, fila.tipo, fila.cuerpo),
    ),
  }
}

export function textoFirmadoPaquete(academiaId: string, paqueteTexto: string): string {
  return `lemchat-paquete-v1|${academiaId}|${paqueteTexto}`
}

export interface SobrePaquete {
  tipo: 'paquete-lemchat'
  formato: 1
  academiaId: string
  paqueteTexto: string
  claveMaestro: string
  firma: string
  emitido: string
}

/** El sobre firmado que la app verifica antes de archivar la enseñanza sola. */
export function crearSobrePaquete(
  llave: LlaveMaestro,
  paqueteTexto: string,
  academiaId: string,
): SobrePaquete {
  return {
    tipo: 'paquete-lemchat',
    formato: 1,
    academiaId,
    paqueteTexto,
    claveMaestro: llave.clavePublica,
    firma: firmarTexto(llave.clavePrivada, textoFirmadoPaquete(academiaId, paqueteTexto)),
    emitido: new Date().toISOString(),
  }
}

/** Fila de aviso al canal: el cuerpo es el texto plano del aviso. */
export function filaAvisoCanal(llave: LlaveMaestro, texto: string): FilaBuzon {
  return firmarFila(llave, {
    de: llave.clavePublica,
    para: DIRECCION_CANAL,
    tipo: 'aviso',
    cuerpo: texto,
  })
}

/** Fila de enseñanza al canal: el cuerpo es el sobre firmado en JSON. */
export function filaPaqueteCanal(
  llave: LlaveMaestro,
  academiaId: string,
  paqueteTexto: string,
): FilaBuzon {
  const sobre = crearSobrePaquete(llave, paqueteTexto, academiaId)
  return firmarFila(llave, {
    de: llave.clavePublica,
    para: DIRECCION_CANAL,
    tipo: 'paquete',
    cuerpo: JSON.stringify(sobre),
  })
}

// ---------------------------------------------------------------------------
// Envío al buzón por REST (mismo proyecto Supabase de LemWriter/Academia)

export interface ConfigBuzon {
  /** URL del proyecto Supabase, p. ej. https://xyz.supabase.co */
  url: string
  /** Llave anónima pública (la misma que usa la app). */
  anonKey: string
}

type FetchFn = (url: string, init: Record<string, unknown>) => Promise<{ ok: boolean; status: number }>

export async function publicarEnBuzon(
  cfg: ConfigBuzon,
  filas: FilaBuzon[],
  fetchFn: FetchFn = fetch as unknown as FetchFn,
): Promise<void> {
  const base = cfg.url.replace(/\/+$/, '')
  for (const fila of filas) {
    const res = await fetchFn(`${base}/rest/v1/lc_mensajes`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(fila),
    })
    if (!res.ok) throw new Error(`el buzón rechazó la publicación (${res.status})`)
  }
}

/**
 * La publicación completa de una enseñanza: aviso + paquete, en ese orden.
 * Devuelve las filas enviadas (para registro en LemWriter).
 */
export async function publicarEnsenanzaPorMensajeAcademia(
  cfg: ConfigBuzon,
  llave: LlaveMaestro,
  datos: { academiaId: string; paqueteTexto: string; tituloAviso: string },
  fetchFn?: FetchFn,
): Promise<FilaBuzon[]> {
  const filas = [
    filaAvisoCanal(llave, datos.tituloAviso),
    filaPaqueteCanal(llave, datos.academiaId, datos.paqueteTexto),
  ]
  await publicarEnBuzon(cfg, filas, fetchFn)
  return filas
}
