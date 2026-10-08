// src/lib/localStore.ts
//
// Capa de datos de LemWriter Local (sabor BUILD_LOCAL, ver flavor.ts).
//
// Expone LA MISMA interfaz síncrona que `offlineStore` — la que ya usan
// Proyectos, Editor, Respaldo y demás pantallas — pero la fuente de verdad
// son las carpetas locales: Documentos/LemWriter/<tipo>/<proyecto>/
// con su proyecto.json y un .md por sección, a través de FolderStore.
// No hay nube, ni cola de sincronización, ni conflictos: esas funciones
// existen como respuestas vacías para que las pantallas no cambien.
//
// Cómo conviven lo síncrono y lo asíncrono: al arrancar, initLocalStore()
// lee todas las carpetas y deja una foto en memoria. Las lecturas sirven
// esa foto al instante (igual que offlineStore sirve su caché) y cada
// escritura actualiza la foto y encola su guardado en las carpetas por
// una única cola ordenada, sin carreras. flushLocalStore() permite
// esperar a que todo quede escrito (la migración lo usa antes de
// reportar sus conteos).

import { Capacitor } from '@capacitor/core'
import { FolderStore, carpetaRaizGuardada } from './folderStore'
import type { FolderProyecto } from './folderStore'
import { CapacitorFsAdapter } from './fsCapacitor'
import { MemoryFsAdapter } from './fsAdapter'
import type { FsAdapter } from './fsAdapter'
import { getStorageQuotaInfo, requestPersistentStorage } from './indexedDbStore'
import type {
  OfflineProyecto,
  OfflineSeccion,
  EditConflict,
  PendingSyncAction,
  SyncActionType,
  StorageQuotaInfo
} from './offlineStore'

export { getStorageQuotaInfo, requestPersistentStorage }
export type { StorageQuotaInfo }

// -------------------------------------------------------------
// Estado en memoria: la foto de las carpetas
// -------------------------------------------------------------
let store: FolderStore | null = null
let proyectosCache: OfflineProyecto[] = []
const seccionesCache = new Map<string, OfflineSeccion[]>()
let promesaInit: Promise<void> | null = null

// Cola única y ordenada de escrituras hacia las carpetas
let cadena: Promise<unknown> = Promise.resolve()
const escriturasPendientes = new Set<Promise<unknown>>()

function encolar(tarea: () => Promise<void>): void {
  const ejecucion = cadena.then(tarea, tarea)
  cadena = ejecucion.catch(() => undefined)
  escriturasPendientes.add(ejecucion)
  void ejecucion.finally(() => escriturasPendientes.delete(ejecucion))
}

/** Espera a que todas las escrituras encoladas terminen de guardarse. */
export async function flushLocalStore(): Promise<void> {
  while (escriturasPendientes.size > 0) {
    await Promise.allSettled([...escriturasPendientes])
  }
}

// -------------------------------------------------------------
// Arranque: leer las carpetas
// -------------------------------------------------------------
function crearAdaptador(): FsAdapter {
  try {
    if (Capacitor.isNativePlatform()) return new CapacitorFsAdapter()
  } catch {
    /* fuera de Capacitor (navegador o pruebas): memoria */
  }
  return new MemoryFsAdapter()
}

export async function initLocalStore(adaptador?: FsAdapter): Promise<void> {
  if (promesaInit) return promesaInit
  promesaInit = (async () => {
    store = new FolderStore(adaptador ?? crearAdaptador(), carpetaRaizGuardada())
    await store.asegurarEstructura()
    const carpetas = await store.listarProyectos()
    proyectosCache = carpetas.map(aProyectoApp)
    seccionesCache.clear()
    for (const p of carpetas) {
      const secciones = await store.listarSecciones(p.id)
      seccionesCache.set(
        p.id,
        secciones.map((s) => aSeccionApp(p, s))
      )
    }
  })()
  return promesaInit
}

function aProyectoApp(p: FolderProyecto): OfflineProyecto {
  return {
    id: p.id,
    title: p.titulo,
    type: p.tipo,
    created_at: p.fecha_creacion,
    updated_at: p.ultima_actualizacion
  }
}

function aSeccionApp(
  p: FolderProyecto,
  s: { id: string; titulo: string; orden: number; html: string }
): OfflineSeccion {
  return {
    id: s.id,
    project_id: p.id,
    title: s.titulo,
    content: s.html,
    order_index: Math.max(0, s.orden - 1),
    created_at: p.fecha_creacion,
    updated_at: p.ultima_actualizacion
  }
}

// -------------------------------------------------------------
// Persistencia hacia las carpetas (siempre dentro de la cola)
// -------------------------------------------------------------
function fechaDe(valor?: string): string {
  if (valor && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

function seccionesOrdenadas(proyectoId: string): OfflineSeccion[] {
  return [...(seccionesCache.get(proyectoId) ?? [])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  )
}

async function persistirProyecto(proyecto: OfflineProyecto): Promise<void> {
  if (!store) return
  try {
    const existente = await store.buscarProyecto(proyecto.id)
    if (!existente) {
      await store.crearProyecto(proyecto.type || 'sermon', proyecto.title || 'Sin título', 'en_progreso', {
        id: proyecto.id,
        fecha_creacion: fechaDe(proyecto.created_at),
        ultima_actualizacion: fechaDe(proyecto.updated_at)
      })
      return
    }
    const cambios: { titulo?: string; tipo?: string } = {}
    if (proyecto.title && proyecto.title !== existente.titulo) cambios.titulo = proyecto.title
    if (proyecto.type && proyecto.type !== existente.tipo) cambios.tipo = proyecto.type
    if (cambios.titulo || cambios.tipo) {
      await store.actualizarProyecto(proyecto.id, cambios)
    }
  } catch (err) {
    console.error('[LemWriter Local] No se pudo guardar el proyecto en carpetas:', err)
  }
}

async function persistirSecciones(proyectoId: string): Promise<void> {
  if (!store) return
  try {
    const proyecto = proyectosCache.find((p) => p.id === proyectoId)
    if (!proyecto) return
    if (!(await store.buscarProyecto(proyectoId))) {
      await persistirProyecto(proyecto)
    }
    const deseadas = seccionesOrdenadas(proyectoId)
    const actuales = await store.listarSecciones(proyectoId)
    const idsDeseados = new Set(deseadas.map((s) => s.id))
    for (const actual of actuales) {
      if (!idsDeseados.has(actual.id)) {
        await store.eliminarSeccion(proyectoId, actual.id)
      }
    }
    for (const s of deseadas) {
      await store.guardarSeccion(proyectoId, { id: s.id, titulo: s.title, contentHtml: s.content })
    }
    if (deseadas.length > 0) {
      await store.reordenarSecciones(
        proyectoId,
        deseadas.map((s) => s.id)
      )
    }
  } catch (err) {
    console.error('[LemWriter Local] No se pudieron guardar las secciones en carpetas:', err)
  }
}

// -------------------------------------------------------------
// Proyectos (misma interfaz que offlineStore)
// -------------------------------------------------------------
function ordenarProyectos(): void {
  proyectosCache.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
}

export function getOfflineProjects(): OfflineProyecto[] {
  return [...proyectosCache]
}

export function saveOfflineProjects(projects: OfflineProyecto[]): void {
  proyectosCache = [...projects]
  ordenarProyectos()
  for (const p of projects) {
    const copia = p
    encolar(() => persistirProyecto(copia))
  }
}

export function saveOrUpdateOfflineProject(project: OfflineProyecto): void {
  const idx = proyectosCache.findIndex((p) => p.id === project.id)
  if (idx >= 0) {
    proyectosCache[idx] = { ...proyectosCache[idx], ...project, updated_at: new Date().toISOString() }
  } else {
    proyectosCache.unshift({ ...project })
  }
  ordenarProyectos()
  const guardado = proyectosCache.find((p) => p.id === project.id) ?? project
  encolar(() => persistirProyecto(guardado))
}

export function deleteOfflineProject(projectId: string): void {
  proyectosCache = proyectosCache.filter((p) => p.id !== projectId)
  seccionesCache.delete(projectId)
  encolar(async () => {
    try {
      await store?.eliminarProyecto(projectId)
    } catch (err) {
      console.error('[LemWriter Local] No se pudo eliminar el proyecto:', err)
    }
  })
}

// -------------------------------------------------------------
// Secciones (misma interfaz que offlineStore)
// -------------------------------------------------------------
export function getOfflineSections(projectId: string): OfflineSeccion[] {
  return seccionesOrdenadas(projectId)
}

export function saveOfflineSections(projectId: string, sections: OfflineSeccion[]): void {
  seccionesCache.set(projectId, [...sections])
  encolar(() => persistirSecciones(projectId))
}

export function saveOfflineSectionContent(projectId: string, sectionId: string, content: string): void {
  const secciones = seccionesCache.get(projectId)
  if (!secciones) return
  const idx = secciones.findIndex((s) => s.id === sectionId)
  if (idx < 0) return
  const ahora = new Date().toISOString()
  secciones[idx] = { ...secciones[idx], content, updated_at: ahora }
  const pIdx = proyectosCache.findIndex((p) => p.id === projectId)
  if (pIdx >= 0) {
    proyectosCache[pIdx] = { ...proyectosCache[pIdx], updated_at: ahora }
  }
  const sec = secciones[idx]
  encolar(async () => {
    try {
      await store?.guardarSeccion(projectId, { id: sec.id, titulo: sec.title, contentHtml: sec.content })
    } catch (err) {
      console.error('[LemWriter Local] No se pudo guardar la sección:', err)
    }
  })
}

export function saveOrUpdateOfflineSection(
  projectId: string,
  section: Partial<OfflineSeccion> & { id: string }
): void {
  const secciones = [...(seccionesCache.get(projectId) ?? [])]
  const idx = secciones.findIndex((s) => s.id === section.id)
  if (idx >= 0) {
    secciones[idx] = { ...secciones[idx], ...section }
  } else {
    secciones.push({
      project_id: projectId,
      title: '',
      content: '',
      order_index: secciones.length,
      ...section
    })
  }
  seccionesCache.set(projectId, secciones)
  encolar(() => persistirSecciones(projectId))
}

export function deleteOfflineSection(projectId: string, sectionId: string): void {
  const secciones = (seccionesCache.get(projectId) ?? []).filter((s) => s.id !== sectionId)
  seccionesCache.set(projectId, secciones)
  encolar(async () => {
    try {
      await store?.eliminarSeccion(projectId, sectionId)
    } catch (err) {
      console.error('[LemWriter Local] No se pudo eliminar la sección:', err)
    }
  })
}

// -------------------------------------------------------------
// Sin nube: cola de sincronización y conflictos siempre vacíos.
// Las pantallas llaman estas funciones pero nunca hay nada que
// sincronizar ni ningún conflicto que resolver: la carpeta manda.
// -------------------------------------------------------------
export function getPendingSyncQueue(): PendingSyncAction[] {
  return []
}

export function addPendingSyncAction(_type: SyncActionType, _payload: any): void {
  /* LemWriter Local no sincroniza: la escritura ya quedó en carpetas. */
}

export function removePendingSyncAction(_actionId: string): void {}

export function clearPendingSyncQueue(): void {}

export function getPendingConflicts(): EditConflict[] {
  return []
}

export function saveConflict(_conflict: EditConflict): void {}

export function removeConflict(_conflictId: string): void {}

export async function resolveConflict(
  _conflictId: string,
  _resolution: 'keep_local' | 'keep_remote' | 'keep_both' | 'merge'
): Promise<{ success: boolean; newSectionId?: string }> {
  return { success: false }
}

export async function processOfflineSyncQueue(): Promise<{ syncedCount: number; errors: number }> {
  return { syncedCount: 0, errors: 0 }
}

// -------------------------------------------------------------
// Sesión: LemWriter Local no tiene cuentas. La app se comporta como
// un invitado permanente que nunca necesita ingresar.
// -------------------------------------------------------------
export function isOfflineGuestSession(): boolean {
  return true
}

export function setOfflineGuestSession(_enabled: boolean): void {}

export function generateLocalId(prefix: 'local_proj' | 'local_sec'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
