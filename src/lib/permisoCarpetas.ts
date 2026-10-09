// src/lib/permisoCarpetas.ts
//
// Permiso de acceso a las carpetas públicas (LemWriter Local).
//
// Android trata los archivos de Documentos/LemWriter como propiedad de
// la instalación que los creó: al desinstalar y reinstalar la app, los
// archivos quedan «huérfanos» y la nueva instalación no puede leerlos
// hasta que el usuario le concede acceso a los archivos (permiso de
// almacenamiento / acceso a todos los archivos). Sin ese permiso, la
// lista de proyectos se ve vacía aunque las carpetas estén perfectas —
// por eso la pantalla lo pide de frente en vez de fallar en silencio.
//
// Ojo: en Android 13+ el plugin reporta el permiso como concedido
// siempre (desde Android 13 ya no existe el permiso clásico de lectura),
// así que la pantalla no se fía solo de este estado: muestra el aviso
// cuando la lista sale vacía, y el botón pide el permiso (cuadro del
// sistema en Android 11/12) quedando el ajuste manual como respaldo.

import { Capacitor } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'

const CLAVE_AVISO_OCULTO = 'lw_local_aviso_permiso_oculto'

/** Pide el permiso de archivos al sistema. Devuelve si quedó concedido. */
export async function pedirPermisoCarpetas(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  try {
    const estado = await Filesystem.requestPermissions()
    return estado.publicStorage === 'granted'
  } catch {
    return false
  }
}

/** ¿El usuario ya cerró el aviso de permiso? (no volver a insistir) */
export function avisoPermisoOculto(): boolean {
  try {
    return localStorage.getItem(CLAVE_AVISO_OCULTO) === '1'
  } catch {
    return false
  }
}

export function ocultarAvisoPermiso(): void {
  try {
    localStorage.setItem(CLAVE_AVISO_OCULTO, '1')
  } catch {
    /* sin localStorage: el aviso simplemente sigue disponible */
  }
}
