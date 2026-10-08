// Progreso de lectura bíblica de LemWriter Mobile.
// Guarda los capítulos marcados como leídos en el dispositivo (localStorage),
// con clave «CODIGO:capitulo» (p. ej. «JHN:3»). Es un solo registro por capítulo,
// sin importar en qué versión se leyó. Con sesión iniciada, las marcas también
// se respaldan en la cuenta (Supabase) para seguir al usuario entre teléfonos.

import { supabase } from '../lib/supabase'
import { isOfflineGuestSession } from '../lib/dataStore'

const CLAVE_LEIDOS = 'lw_biblia_leidos_v1'

export function claveCapitulo(codigo: string, capitulo: number): string {
  return `${codigo}:${capitulo}`
}

export function cargarLeidos(): Set<string> {
  try {
    const crudo = localStorage.getItem(CLAVE_LEIDOS)
    if (crudo) {
      const datos = JSON.parse(crudo)
      if (Array.isArray(datos)) {
        return new Set(datos.filter((x) => typeof x === 'string'))
      }
    }
  } catch {
    /* registro no válido: se empieza de cero */
  }
  return new Set<string>()
}

export function guardarLeidos(leidos: Set<string>): void {
  try {
    localStorage.setItem(CLAVE_LEIDOS, JSON.stringify([...leidos]))
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Borra todas las marcas de lectura (para empezar la Biblia de nuevo). */
export function reiniciarLeidos(): Set<string> {
  try {
    localStorage.removeItem(CLAVE_LEIDOS)
  } catch {
    /* almacenamiento no disponible */
  }
  return new Set<string>()
}

/** Devuelve un Set nuevo con el capítulo marcado o desmarcado. */
export function alternarLeido(leidos: Set<string>, codigo: string, capitulo: number): Set<string> {
  const nuevo = new Set(leidos)
  const clave = claveCapitulo(codigo, capitulo)
  if (nuevo.has(clave)) {
    nuevo.delete(clave)
  } else {
    nuevo.add(clave)
  }
  guardarLeidos(nuevo)
  return nuevo
}

export function conteoPorLibro(leidos: Set<string>): Map<string, number> {
  const conteo = new Map<string, number>()
  for (const clave of leidos) {
    const codigo = clave.split(':')[0]
    conteo.set(codigo, (conteo.get(codigo) || 0) + 1)
  }
  return conteo
}

// ---------------------------------------------------------------------------
// Respaldo en la cuenta (Supabase, tabla lw_biblia_progreso)
// ---------------------------------------------------------------------------
// El localStorage sigue siendo la fuente inmediata en pantalla; la nube es un
// espejo por usuario para que las marcas viajen entre teléfonos. Todas las
// funciones son tolerantes a fallos: sin sesión (invitado), sin conexión o sin
// la tabla creada, la lectura sigue funcionando solo en el dispositivo.

const TABLA_PROGRESO = 'lw_biblia_progreso'

async function usuarioActualId(): Promise<string | null> {
  try {
    if (isOfflineGuestSession()) return null
    const { data } = await supabase.auth.getUser()
    return data?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Al abrir la vista: baja las marcas de la cuenta, las une con las locales
 * (nunca se pierde una marca hecha en ningún teléfono) y sube las que la
 * cuenta aún no tenga. Devuelve el conjunto unido ya guardado en local.
 */
export async function sincronizarLeidosDesdeNube(): Promise<Set<string>> {
  const locales = cargarLeidos()
  const userId = await usuarioActualId()
  if (!userId) return locales
  try {
    const { data, error } = await supabase
      .from(TABLA_PROGRESO)
      .select('capitulo')
      .eq('user_id', userId)
    if (error || !data) return locales
    const enNube = new Set<string>(
      data.map((f: { capitulo: unknown }) => f.capitulo).filter((c): c is string => typeof c === 'string')
    )
    const unidos = new Set<string>([...locales, ...enNube])
    guardarLeidos(unidos)
    const faltantes = [...locales].filter((c) => !enNube.has(c))
    if (faltantes.length > 0) {
      await supabase
        .from(TABLA_PROGRESO)
        .upsert(
          faltantes.map((capitulo) => ({ user_id: userId, capitulo })),
          { onConflict: 'user_id,capitulo' }
        )
    }
    return unidos
  } catch {
    return locales
  }
}

/** Refleja en la cuenta una marca recién puesta o quitada (sin bloquear la UI). */
export async function respaldarCambioEnNube(clave: string, marcado: boolean): Promise<void> {
  const userId = await usuarioActualId()
  if (!userId) return
  try {
    if (marcado) {
      await supabase
        .from(TABLA_PROGRESO)
        .upsert([{ user_id: userId, capitulo: clave }], { onConflict: 'user_id,capitulo' })
    } else {
      await supabase.from(TABLA_PROGRESO).delete().eq('user_id', userId).eq('capitulo', clave)
    }
  } catch {
    /* sin conexión o sin tabla: la marca queda local y se unirá en la próxima sincronización */
  }
}

/** Al reiniciar la lectura: borra también las marcas de la cuenta. */
export async function borrarProgresoEnNube(): Promise<void> {
  const userId = await usuarioActualId()
  if (!userId) return
  try {
    await supabase.from(TABLA_PROGRESO).delete().eq('user_id', userId)
  } catch {
    /* tolerante a fallos, igual que el resto del respaldo */
  }
}
