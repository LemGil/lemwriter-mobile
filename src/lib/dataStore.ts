// src/lib/dataStore.ts
//
// Fachada de datos de LemWriter. Las pantallas importan desde aquí y
// reciben exactamente las mismas funciones que siempre usaron de
// `offlineStore`; lo único que cambia es quién responde:
//
// - App de siempre (web/PWA/APK actual): responde `offlineStore`
//   (IndexedDB + sincronización con Supabase), como hasta ahora.
// - LemWriter Local (BUILD_LOCAL=1): responde `localStore`
//   (las carpetas de Documentos/LemWriter son la base de datos).
//
// La delegación es perezosa (se resuelve en cada llamada, no al cargar
// el módulo): así el sabor se decide por compilación sin tocar los
// módulos de datos hasta que una pantalla pide algo de verdad.

import { ES_LOCAL } from './flavor'
import * as offline from './offlineStore'
import * as local from './localStore'
import type {
  OfflineProyecto,
  OfflineSeccion,
  EditConflict,
  PendingSyncAction,
  SyncActionType
} from './offlineStore'

export type {
  OfflineProyecto,
  OfflineSeccion,
  EditConflict,
  PendingSyncAction,
  SyncActionType,
  StorageQuotaInfo
} from './offlineStore'

// -------------------------------------------------------------
// Proyectos
// -------------------------------------------------------------
export function getOfflineProjects(): OfflineProyecto[] {
  return ES_LOCAL ? local.getOfflineProjects() : offline.getOfflineProjects()
}

export function saveOfflineProjects(projects: OfflineProyecto[]): void {
  if (ES_LOCAL) local.saveOfflineProjects(projects)
  else offline.saveOfflineProjects(projects)
}

export function saveOrUpdateOfflineProject(project: OfflineProyecto): void {
  if (ES_LOCAL) local.saveOrUpdateOfflineProject(project)
  else offline.saveOrUpdateOfflineProject(project)
}

export function deleteOfflineProject(projectId: string): void {
  if (ES_LOCAL) local.deleteOfflineProject(projectId)
  else offline.deleteOfflineProject(projectId)
}

// -------------------------------------------------------------
// Secciones
// -------------------------------------------------------------
export function getOfflineSections(projectId: string): OfflineSeccion[] {
  return ES_LOCAL ? local.getOfflineSections(projectId) : offline.getOfflineSections(projectId)
}

export function saveOfflineSections(projectId: string, sections: OfflineSeccion[]): void {
  if (ES_LOCAL) local.saveOfflineSections(projectId, sections)
  else offline.saveOfflineSections(projectId, sections)
}

export function saveOfflineSectionContent(projectId: string, sectionId: string, content: string): void {
  if (ES_LOCAL) local.saveOfflineSectionContent(projectId, sectionId, content)
  else offline.saveOfflineSectionContent(projectId, sectionId, content)
}

export function saveOrUpdateOfflineSection(
  projectId: string,
  section: Partial<OfflineSeccion> & { id: string }
): void {
  if (ES_LOCAL) local.saveOrUpdateOfflineSection(projectId, section)
  else offline.saveOrUpdateOfflineSection(projectId, section)
}

export function deleteOfflineSection(projectId: string, sectionId: string): void {
  if (ES_LOCAL) local.deleteOfflineSection(projectId, sectionId)
  else offline.deleteOfflineSection(projectId, sectionId)
}

// -------------------------------------------------------------
// Cola de sincronización y conflictos (en Local siempre vacíos)
// -------------------------------------------------------------
export function getPendingSyncQueue(): PendingSyncAction[] {
  return ES_LOCAL ? local.getPendingSyncQueue() : offline.getPendingSyncQueue()
}

export function addPendingSyncAction(type: SyncActionType, payload: any): void {
  if (ES_LOCAL) local.addPendingSyncAction(type, payload)
  else offline.addPendingSyncAction(type, payload)
}

export function removePendingSyncAction(actionId: string): void {
  if (ES_LOCAL) local.removePendingSyncAction(actionId)
  else offline.removePendingSyncAction(actionId)
}

export function clearPendingSyncQueue(): void {
  if (ES_LOCAL) local.clearPendingSyncQueue()
  else offline.clearPendingSyncQueue()
}

export function processOfflineSyncQueue(): Promise<{ syncedCount: number; errors: number }> {
  return ES_LOCAL ? local.processOfflineSyncQueue() : offline.processOfflineSyncQueue()
}

export function getPendingConflicts(): EditConflict[] {
  return ES_LOCAL ? local.getPendingConflicts() : offline.getPendingConflicts()
}

export function saveConflict(conflict: EditConflict): void {
  if (ES_LOCAL) local.saveConflict(conflict)
  else offline.saveConflict(conflict)
}

export function removeConflict(conflictId: string): void {
  if (ES_LOCAL) local.removeConflict(conflictId)
  else offline.removeConflict(conflictId)
}

export function resolveConflict(
  conflictId: string,
  resolution: 'keep_local' | 'keep_remote' | 'keep_both' | 'merge'
): Promise<{ success: boolean; newSectionId?: string }> {
  return ES_LOCAL
    ? local.resolveConflict(conflictId, resolution)
    : offline.resolveConflict(conflictId, resolution)
}

// -------------------------------------------------------------
// Sesión y utilidades
// -------------------------------------------------------------
export function isOfflineGuestSession(): boolean {
  return ES_LOCAL ? local.isOfflineGuestSession() : offline.isOfflineGuestSession()
}

export function setOfflineGuestSession(enabled: boolean): void {
  if (ES_LOCAL) local.setOfflineGuestSession(enabled)
  else offline.setOfflineGuestSession(enabled)
}

export function generateLocalId(prefix: 'local_proj' | 'local_sec'): string {
  return ES_LOCAL ? local.generateLocalId(prefix) : offline.generateLocalId(prefix)
}

export function getStorageQuotaInfo() {
  return ES_LOCAL ? local.getStorageQuotaInfo() : offline.getStorageQuotaInfo()
}

export function requestPersistentStorage() {
  return ES_LOCAL ? local.requestPersistentStorage() : offline.requestPersistentStorage()
}

/**
 * Prepara la capa de datos al arrancar. En LemWriter Local lee todas las
 * carpetas antes de mostrar Proyectos; en la app de siempre no hace nada
 * (offlineStore se inicializa solo, como hasta ahora).
 */
export async function initDataStore(): Promise<void> {
  if (ES_LOCAL) {
    await local.initLocalStore()
  }
}

/** Espera a que todo lo escrito quede guardado (solo aplica en Local). */
export async function flushDataStore(): Promise<void> {
  if (ES_LOCAL) {
    await local.flushLocalStore()
  }
}
