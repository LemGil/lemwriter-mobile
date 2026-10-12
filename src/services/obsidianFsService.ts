// src/services/obsidianFsService.ts
//
// Gestiona acceso al vault de Obsidian.
//
// - En escritorio: vía File System Access API (showDirectoryPicker); el
//   handle se persiste en IndexedDB entre sesiones.
// - En la APK (Android): vía @capacitor/filesystem sobre la carpeta que el
//   usuario elige con el explorador (por defecto Almacenamiento/MinisterioWiki/raw,
//   que llega sola por Syncthing); la ruta se guarda en localStorage.
//   Requiere el permiso «Acceso a todos los archivos».
//
// Flujo de uso:
//   1. El usuario toca "Conectar carpeta" en Respaldo (una sola vez)
//   2. En escritorio se abre el picker nativo del OS; en la APK el
//      explorador de carpetas de la app
//   3. En cada autosave, writeObsidianFile() escribe el .md correspondiente
//
// LIMITACIÓN (solo escritorio):
//   - iOS Safari: no soportado (window.showDirectoryPicker no existe)
//   - Firefox: soportado desde v111 pero con algunas restricciones

import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'

const IDB_NAME   = 'lemwriter-mobile-fs';
const IDB_STORE  = 'fs-handles';
const HANDLE_KEY = 'obsidian-root';

// ─── Ruta del vault en la APK ─────────────────────────────────────────────────

const CLAVE_RUTA_VAULT = 'lw_obsidian_vault'

export type BaseVault = 'external' | 'documents'

const VAULT_DEFECTO: { base: BaseVault; ruta: string } = { base: 'external', ruta: 'MinisterioWiki/raw' }

/** true cuando corre dentro de la APK (Android). */
export function esNativo(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Carpeta del vault elegida en la APK, formato "base:ruta". */
export function rutaVaultNativa(): { base: BaseVault; ruta: string } {
  try {
    const crudo = localStorage.getItem(CLAVE_RUTA_VAULT)
    if (crudo) {
      const idx = crudo.indexOf(':')
      const base = crudo.slice(0, idx)
      const ruta = crudo.slice(idx + 1)
      if ((base === 'external' || base === 'documents') && ruta) {
        return { base, ruta }
      }
    }
  } catch {
    /* sin localStorage: valor por defecto */
  }
  return { ...VAULT_DEFECTO }
}

/** Guarda la carpeta del vault elegida con el explorador. */
export function guardarRutaVaultNativa(base: BaseVault, ruta: string): void {
  try {
    localStorage.setItem(CLAVE_RUTA_VAULT, `${base}:${ruta}`)
  } catch {
    /* sin localStorage: no se persiste */
  }
}

/** Etiqueta legible de la ruta, p. ej. «Almacenamiento/MinisterioWiki/raw». */
export function etiquetaRutaVault(v?: { base: BaseVault; ruta: string }): string {
  const actual = v ?? rutaVaultNativa()
  return `${actual.base === 'external' ? 'Almacenamiento' : 'Documentos'}/${actual.ruta}`
}

function directorioVault(base: BaseVault): Directory {
  return base === 'documents' ? Directory.Documents : Directory.ExternalStorage
}

// queryPermission() aún no está en los tipos DOM de TypeScript
interface FileSystemDirectoryHandleConPermisos extends FileSystemDirectoryHandle {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

// ─── IndexedDB: persistencia del handle entre sesiones ────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror   = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}

// ─── Escritura en disco ───────────────────────────────────────────────────────

/**
 * Escribe content en relativePath dentro de la carpeta raíz autorizada.
 *
 * relativePath puede incluir subcarpetas:
 *   "sermones/sermon-la-gracia-2026.md"
 * Las subcarpetas se crean automáticamente si no existen.
 *
 * @returns true si escribió con éxito, false en cualquier otro caso.
 *
 * NUNCA lanza excepción — el autosave de Supabase no debe verse afectado
 * por fallos de la exportación Obsidian (disco desconectado, permiso revocado, etc.)
 */
export async function writeObsidianFile(
  relativePath: string,
  content: string
): Promise<boolean> {
  // ── En la APK: escritura directa con la carpeta elegida ──
  if (esNativo()) {
    try {
      const v = rutaVaultNativa()
      const destino = v.ruta ? `${v.ruta}/${relativePath}` : relativePath
      await Filesystem.writeFile({
        path: destino,
        data: content,
        directory: directorioVault(v.base),
        encoding: Encoding.UTF8,
        recursive: true,
      })
      return true
    } catch (err) {
      console.error('[Obsidian FS] Error al escribir en la APK:', (err as Error).message)
      return false
    }
  }

  try {
    const root = await loadRootHandle();
    if (!root) {
      console.warn('[Obsidian FS] Sin carpeta autorizada. Conecta el vault en Configuración.');
      return false;
    }

    // Verificar que el permiso sigue vigente (puede haberse revocado entre sesiones)
    const perm = await (root as FileSystemDirectoryHandleConPermisos).queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      console.warn('[Obsidian FS] Permiso revocado o expirado — re-autoriza en Configuración');
      return false;
    }

    // Navegar / crear subcarpetas según relativePath
    const parts    = relativePath.split('/');
    const filename = parts.pop()!;
    let   dir: FileSystemDirectoryHandle = root;

    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }

    // Escribir archivo — sobreescribe si ya existe (mismo comportamiento que writeFileSync)
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable   = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    console.log(`[Obsidian FS] ✓ ${relativePath}`);
    return true;

  } catch (err) {
    console.error('[Obsidian FS] Error al escribir:', (err as Error).message);
    return false;
  }
}

// ─── Detección de soporte y autorización ─────────────────────────────────────

/**
 * Devuelve true si el browser soporta File System Access API.
 * Usar para mostrar/ocultar el botón de conexión en Configuración.
 */
export function isFileSystemAccessSupported(): boolean {
  if (esNativo()) return true
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Verifica si ya hay una carpeta autorizada y el permiso sigue vigente.
 * Útil para mostrar el estado actual en Configuración al cargar la pantalla.
 *
 * @returns 'connected' | 'disconnected' | 'unsupported'
 */
export async function getVaultStatus(): Promise<'connected' | 'disconnected' | 'unsupported'> {
  if (esNativo()) {
    try {
      return localStorage.getItem(CLAVE_RUTA_VAULT) ? 'connected' : 'disconnected'
    } catch {
      return 'disconnected'
    }
  }
  if (!isFileSystemAccessSupported()) return 'unsupported';
  try {
    const root = await loadRootHandle();
    if (!root) return 'disconnected';
    const perm = await (root as FileSystemDirectoryHandleConPermisos).queryPermission({ mode: 'readwrite' });
    return perm === 'granted' ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}

/**
 * Abre el selector nativo de carpeta del OS y guarda el handle.
 *
 * IMPORTANTE: debe llamarse desde un evento de click del usuario.
 * El browser bloquea showDirectoryPicker() si no hay gesto previo del usuario.
 *
 * @returns true si el usuario autorizó, false si canceló o no es soportado.
 */
export async function requestAndSaveVaultFolder(): Promise<boolean> {
  if (!isFileSystemAccessSupported()) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    await saveRootHandle(handle);
    console.log('[Obsidian FS] Carpeta autorizada:', handle.name);
    return true;
  } catch (err: unknown) {
    // AbortError = el usuario cerró el picker — no es error real
    if ((err as { name?: string })?.name !== 'AbortError') {
      console.error('[Obsidian FS] Error al solicitar carpeta:', err);
    }
    return false;
  }
}

// ─── Creación guiada de la estructura de carpetas ─────────────────────────────

/**
 * Crea en el vault autorizado todas las carpetas de categoría de Obsidian.
 * Las que ya existan se dejan intactas.
 *
 * @param carpetas - Nombres de las carpetas a crear (OBSIDIAN_CARPETAS).
 * @returns { creadas, ok } — creadas: carpetas que no existían y se crearon.
 */
export async function ensureVaultStructure(
  carpetas: readonly string[]
): Promise<{ creadas: string[]; ok: boolean }> {
  try {
    const root = await loadRootHandle();
    if (!root) return { creadas: [], ok: false };

    const perm = await (root as FileSystemDirectoryHandleConPermisos).queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return { creadas: [], ok: false };

    const creadas: string[] = [];
    for (const nombre of carpetas) {
      try {
        // Si existe, no hace nada; si no existe lanza y la creamos
        await root.getDirectoryHandle(nombre, { create: false });
      } catch {
        await root.getDirectoryHandle(nombre, { create: true });
        creadas.push(nombre);
      }
    }
    console.log('[Obsidian FS] Estructura verificada:', creadas.length === 0 ? 'ya existía' : `creadas: ${creadas.join(', ')}`);
    return { creadas, ok: true };
  } catch (err) {
    console.error('[Obsidian FS] Error al crear estructura:', (err as Error).message);
    return { creadas: [], ok: false };
  }
}
