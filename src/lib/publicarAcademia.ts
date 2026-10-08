import { supabase } from './supabase'
import { isOfflineGuestSession } from './dataStore'

/**
 * Publicación directa LemWriter → Academia del Espíritu.
 *
 * Las dos aplicaciones comparten la MISMA base de datos de Supabase:
 * las tablas de la Academia (niveles, cursos, temas, pasos) viven junto
 * a las de LemWriter (lw_proyectos, lw_secciones), así que publicar es
 * escribir filas en esas tablas con la sesión actual del usuario.
 *
 * Requiere la migración 013 de la Academia (temas.texto,
 * cursos.lemwriter_id, temas.lemwriter_seccion_id). Al republicar, el
 * curso y los temas se ACTUALIZAN en el mismo lugar — el progreso de los
 * estudiantes (progreso_pasos / progreso_temas) no se pierde.
 */

export interface NivelAcademia {
  id: number
  nombre: string
  orden: number | null
}

export interface CursoEnlazado {
  id: number
  titulo: string
  nivel_id: number
  orden: number | null
  created_at?: string | null
  updated_at?: string | null
}

export interface EstadoPublicacionAcademia {
  publicado: boolean
  fechaPublicacion: string | null
  cursoId: number | null
  cursoTitulo: string | null
}

const CLAVE_ESTADOS_PUBLICACION = 'lw_publicacion_academia_v1'

function fechaDeCurso(curso: Pick<CursoEnlazado, 'created_at' | 'updated_at'>): string | null {
  return curso.updated_at || curso.created_at || null
}

export function leerEstadosPublicacionGuardados(): Record<string, EstadoPublicacionAcademia> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const guardados = JSON.parse(localStorage.getItem(CLAVE_ESTADOS_PUBLICACION) || '{}')
    return guardados && typeof guardados === 'object' && !Array.isArray(guardados)
      ? (guardados as Record<string, EstadoPublicacionAcademia>)
      : {}
  } catch {
    return {}
  }
}

export function guardarEstadosPublicacion(estados: Record<string, EstadoPublicacionAcademia>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      CLAVE_ESTADOS_PUBLICACION,
      JSON.stringify({ ...leerEstadosPublicacionGuardados(), ...estados })
    )
  } catch {
    // La marca visual es auxiliar: si no se puede guardar, la app sigue igual.
  }
}

export function guardarEstadoPublicacion(proyectoId: string, estado: EstadoPublicacionAcademia): void {
  guardarEstadosPublicacion({ [proyectoId]: estado })
}

export interface SeccionAPublicar {
  id: string
  title: string
  content: string
  order_index: number
}

export interface ResultadoPublicacion {
  cursoId: number
  cursoTitulo: string
  temasNuevos: number
  temasActualizados: number
  fechaPublicacion: string
}

interface FilaId {
  id: number
}

export async function cargarNivelesAcademia(): Promise<NivelAcademia[]> {
  const { data, error } = await supabase
    .from('niveles')
    .select('id, nombre, orden')
    .order('orden', { ascending: true })
  if (error) throw error
  return (data ?? []) as NivelAcademia[]
}

export async function buscarCursoEnlazado(lemwriterId: string): Promise<CursoEnlazado | null> {
  const { data, error } = await supabase
    .from('cursos')
    .select('id, titulo, nivel_id, orden, created_at, updated_at')
    .eq('lemwriter_id', lemwriterId)
    .maybeSingle()
  if (error) throw error
  return (data as CursoEnlazado | null) ?? null
}

export async function cargarEstadosPublicacion(
  proyectoIds: string[]
): Promise<Record<string, EstadoPublicacionAcademia>> {
  const ids = Array.from(new Set(proyectoIds.filter(Boolean)))
  const estados: Record<string, EstadoPublicacionAcademia> = {}
  for (const id of ids) {
    estados[id] = { publicado: false, fechaPublicacion: null, cursoId: null, cursoTitulo: null }
  }
  if (ids.length === 0) return estados

  const { data, error } = await supabase
    .from('cursos')
    .select('id, titulo, lemwriter_id, created_at, updated_at')
    .in('lemwriter_id', ids)
  if (error) throw error

  for (const curso of (data ?? []) as Array<CursoEnlazado & { lemwriter_id?: string | null }>) {
    if (!curso.lemwriter_id || !(curso.lemwriter_id in estados)) continue
    estados[curso.lemwriter_id] = {
      publicado: true,
      fechaPublicacion: fechaDeCurso(curso),
      cursoId: curso.id,
      cursoTitulo: curso.titulo
    }
  }
  return estados
}

export async function publicarProyectoEnAcademia(opciones: {
  proyectoId: string
  titulo: string
  nivelId: number
  secciones: SeccionAPublicar[]
}): Promise<ResultadoPublicacion> {
  const { proyectoId, titulo, nivelId, secciones } = opciones
  if (isOfflineGuestSession()) {
    throw new Error('Estás como invitado sin sesión: publicar en la Academia necesita que hayas iniciado sesión.')
  }
  const ordenadas = [...secciones].sort((a, b) => a.order_index - b.order_index)

  // 1. El curso: se crea o se actualiza en el mismo lugar (lemwriter_id).
  const existente = await buscarCursoEnlazado(proyectoId)
  let ordenCurso = existente?.orden ?? null
  if (ordenCurso == null) {
    const { data: ultimo } = await supabase
      .from('cursos')
      .select('orden')
      .eq('nivel_id', nivelId)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle()
    ordenCurso = ((ultimo as { orden: number | null } | null)?.orden ?? 0) + 1
  }
  const fechaPublicacion = new Date().toISOString()
  const { data: curso, error: errorCurso } = await supabase
    .from('cursos')
    .upsert(
      {
        titulo,
        nivel_id: nivelId,
        orden: ordenCurso,
        lemwriter_id: proyectoId,
        updated_at: fechaPublicacion
      },
      { onConflict: 'lemwriter_id' }
    )
    .select('id, titulo, created_at, updated_at')
    .single()
  if (errorCurso) throw errorCurso
  const cursoId = (curso as FilaId).id
  const fechaCurso = fechaDeCurso(curso as CursoEnlazado) || fechaPublicacion

  // 2. Un tema por sección, en orden, con el texto completo de la enseñanza.
  let temasNuevos = 0
  let temasActualizados = 0
  const temaIds: number[] = []
  for (let i = 0; i < ordenadas.length; i++) {
    const s = ordenadas[i]
    const { data: previo } = await supabase
      .from('temas')
      .select('id')
      .eq('lemwriter_seccion_id', s.id)
      .maybeSingle()
    const { data: tema, error: errorTema } = await supabase
      .from('temas')
      .upsert(
        {
          curso_id: cursoId,
          titulo: s.title?.trim() || `Tema ${i + 1}`,
          orden: i + 1,
          texto: s.content || '',
          lemwriter_seccion_id: s.id
        },
        { onConflict: 'lemwriter_seccion_id' }
      )
      .select('id')
      .single()
    if (errorTema) throw errorTema
    temaIds.push((tema as FilaId).id)
    if (previo) temasActualizados++
    else temasNuevos++
  }

  // 3. Cada tema publicado lleva su paso «Confirmar que leí» (leer_texto).
  if (temaIds.length > 0) {
    const { data: pasosLectura } = await supabase
      .from('pasos')
      .select('tema_id')
      .in('tema_id', temaIds)
      .eq('tipo', 'leer_texto')
    const conPaso = new Set(((pasosLectura ?? []) as { tema_id: number }[]).map(p => p.tema_id))
    const faltantes = temaIds
      .filter(id => !conPaso.has(id))
      .map(tema_id => ({
        tema_id,
        titulo: 'Lectura de la enseñanza',
        descripcion: 'Lee el texto completo de la enseñanza y confírmalo aquí.',
        tipo: 'leer_texto',
        orden: 1
      }))
    if (faltantes.length > 0) {
      const { error: errorPasos } = await supabase.from('pasos').insert(faltantes)
      if (errorPasos) throw errorPasos
    }

    // 4. Temas de ESTE curso que ya no están en el proyecto → se quitan
    //    (solo los publicados desde LemWriter; los creados a mano quedan).
    const { data: temasDelCurso } = await supabase
      .from('temas')
      .select('id, lemwriter_seccion_id')
      .eq('curso_id', cursoId)
      .not('lemwriter_seccion_id', 'is', null)
    const vigentes = new Set(ordenadas.map(s => s.id))
    const viejos = ((temasDelCurso ?? []) as { id: number; lemwriter_seccion_id: string }[]).filter(
      t => !vigentes.has(t.lemwriter_seccion_id)
    )
    if (viejos.length > 0) {
      const { error: errorViejos } = await supabase
        .from('temas')
        .delete()
        .in('id', viejos.map(t => t.id))
      if (errorViejos) {
        throw new Error('Se publicó, pero no se pudieron quitar los temas que ya no están en el proyecto.')
      }
    }
  }

  const resultado: ResultadoPublicacion = {
    cursoId,
    cursoTitulo: (curso as { titulo: string }).titulo,
    temasNuevos,
    temasActualizados,
    fechaPublicacion: fechaCurso
  }
  guardarEstadoPublicacion(proyectoId, {
    publicado: true,
    fechaPublicacion: resultado.fechaPublicacion,
    cursoId: resultado.cursoId,
    cursoTitulo: resultado.cursoTitulo
  })
  return resultado
}
