// Publicar también por MensajeAcademia — integración de la Fase D.
//
// Puente entre el modal «🎓 Publicar en Academia» y el módulo
// `src/mensajeacademia.ts` (el que firma e inserta en el buzón):
// construye el paquete de estudiante con la MISMA función del botón
// «📦 Paquete» (construirPaquete), lo serializa igual, y lo publica
// con aviso mediante la llave del maestro.
//
// Configuración: la conexión (URL y llave anónima) es la de la PROPIA
// app, compilada en ella — las mismas con las que publica en la
// Academia. En el dispositivo solo se guarda la llave del maestro (se
// pega una vez; se valida al guardar: la privada debe corresponder a
// la pública). Nunca va al repo.

import {
  construirPaquete,
  serializarPaquete,
  validarDatosPaquete,
  type SeccionParaPaquete,
} from './paqueteEstudiante'
import {
  cargarLlaveMaestro,
  publicarEnsenanzaPorMensajeAcademia,
} from '../mensajeacademia'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'

const CLAVE_CONFIG_VIEJA = 'lw-mensajeacademia-config-v1'
const CLAVE_LLAVE = 'lw-mensajeacademia-llave-v1'

export interface ConfigMensajeAcademia {
  url: string
  anonKey: string
  llaveJson: string
}

export function cargarLlaveDelMaestro(): string | null {
  try {
    const directa = localStorage.getItem(CLAVE_LLAVE)
    if (directa?.trim()) return directa
    // Migración suave: la config vieja guardaba también URL y anónima
    // pegadas a mano; se aprovecha solo su llave y el resto se ignora.
    const crudo = localStorage.getItem(CLAVE_CONFIG_VIEJA)
    if (!crudo) return null
    const cfg = JSON.parse(crudo) as Partial<ConfigMensajeAcademia>
    return cfg.llaveJson?.trim() ? cfg.llaveJson : null
  } catch {
    return null
  }
}

export function guardarLlaveDelMaestro(llaveJson: string): void {
  // Validar ANTES de guardar: que la llave del maestro sea íntegra.
  cargarLlaveMaestro(llaveJson)
  localStorage.setItem(CLAVE_LLAVE, llaveJson)
}

export async function publicarPorMensajeAcademia(opts: {
  identificador: string
  titulo: string
  secciones: SeccionParaPaquete[]
  /** Nivel elegido en el diálogo (v1.7): el paquete nace con su nivel
   *  para que la app del estudiante organice por niveles. */
  nivel?: { nombre: string; orden: number }
}): Promise<string> {
  const llaveJson = cargarLlaveDelMaestro()
  if (!llaveJson) {
    throw new Error(
      'falta tu llave del maestro para firmar el envío por MensajeAcademia: pégala en el mismo diálogo, abajo de la casilla.',
    )
  }
  if (SUPABASE_URL.includes('placeholder')) {
    throw new Error(
      'esta copia de la app no trae la conexión de la Academia (se compiló sin las variables de Supabase).',
    )
  }
  const errorDatos = validarDatosPaquete({
    identificador: opts.identificador,
    titulo: opts.titulo,
    secciones: opts.secciones,
  })
  if (errorDatos) throw new Error(errorDatos)

  const { paquete, omitidas } = construirPaquete({
    identificador: opts.identificador,
    titulo: opts.titulo,
    secciones: opts.secciones,
    nivel: opts.nivel,
  })
  const llave = cargarLlaveMaestro(llaveJson)
  await publicarEnsenanzaPorMensajeAcademia(
    { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY },
    llave,
    {
      academiaId: paquete.academia.id,
      paqueteTexto: serializarPaquete(paquete),
      tituloAviso: `Nueva enseñanza: ${opts.titulo}`,
    },
  )
  return (
    `📣 También salió por MensajeAcademia: el paquete ${paquete.academia.id} va firmado al canal` +
    (omitidas > 0 ? ` (${omitidas} secciones vacías quedaron fuera)` : '') +
    ' y se archivará solo en los teléfonos de los estudiantes.'
  )
}
