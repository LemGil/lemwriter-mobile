// Publicar también por MensajeAcademia — integración de la Fase D.
//
// Puente entre el modal «🎓 Publicar en Academia» y el módulo
// `src/mensajeacademia.ts` (el que firma e inserta en el buzón):
// construye el paquete de estudiante con la MISMA función del botón
// «📦 Paquete» (construirPaquete), lo serializa igual, y lo publica
// con aviso mediante la llave del maestro.
//
// Configuración (una sola vez, queda en ESTA PC, en el almacenamiento
// local de LemWriter; nunca sale de la máquina ni va al repo):
//   - URL y llave anónima del proyecto Supabase (las mismas de la app).
//   - El contenido del archivo de llaves del maestro (se pega una vez;
//     se valida al guardar: la privada debe corresponder a la pública).

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

const CLAVE_CONFIG = 'lw-mensajeacademia-config-v1'

export interface ConfigMensajeAcademia {
  url: string
  anonKey: string
  llaveJson: string
}

export function cargarConfigMensajeAcademia(): ConfigMensajeAcademia | null {
  try {
    const crudo = localStorage.getItem(CLAVE_CONFIG)
    if (!crudo) return null
    const cfg = JSON.parse(crudo) as Partial<ConfigMensajeAcademia>
    if (!cfg.url?.trim() || !cfg.anonKey?.trim() || !cfg.llaveJson?.trim()) return null
    return { url: cfg.url.trim(), anonKey: cfg.anonKey.trim(), llaveJson: cfg.llaveJson }
  } catch {
    return null
  }
}

export function guardarConfigMensajeAcademia(cfg: ConfigMensajeAcademia): void {
  // Validar ANTES de guardar: que la llave del maestro sea íntegra.
  cargarLlaveMaestro(cfg.llaveJson)
  localStorage.setItem(CLAVE_CONFIG, JSON.stringify(cfg))
}

export async function publicarPorMensajeAcademia(opts: {
  identificador: string
  titulo: string
  secciones: SeccionParaPaquete[]
  /** Nivel elegido en el diálogo (v1.7): el paquete nace con su nivel
   *  para que la app del estudiante organice por niveles. */
  nivel?: { nombre: string; orden: number }
}): Promise<string> {
  const cfg = cargarConfigMensajeAcademia()
  if (!cfg) {
    throw new Error(
      'falta la configuración de MensajeAcademia (URL, llave anónima y llave del maestro): márcala en el mismo diálogo, abajo de la casilla.',
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
  const llave = cargarLlaveMaestro(cfg.llaveJson)
  await publicarEnsenanzaPorMensajeAcademia(
    { url: cfg.url, anonKey: cfg.anonKey },
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
