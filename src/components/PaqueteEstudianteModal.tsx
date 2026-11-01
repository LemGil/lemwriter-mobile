import { useMemo, useState } from 'react'
import { getOfflineProjects, saveOrUpdateOfflineProject } from '../lib/dataStore'
import {
  AUTOR_POR_DEFECTO,
  normalizarIdentificador,
  numeroVisibleDesdeId,
  validarDatosPaquete,
  construirPaquete,
  compartirPaqueteEstudiante,
  type SeccionParaPaquete
} from '../lib/paqueteEstudiante'

interface PaqueteEstudianteModalProps {
  /** El Editor trabaja con una vista reducida del proyecto. */
  proyecto: {
    id: string
    title: string
    type?: string
    academia_id?: string
    academia_autor?: string
  }
  secciones: SeccionParaPaquete[]
  onClose: () => void
  onGuardado?: (cambios: { academia_id?: string; academia_autor?: string }) => void
}

/**
 * Genera el paquete de la academia para la app del estudiante.
 *
 * El maestro asigna a mano el IDENTIFICADOR (autor + número, ej.
 * «lemgil-14»): queda guardado en el proyecto (proyecto.json) y viaja
 * dentro del paquete. La app del estudiante reconoce la academia por
 * ese identificador: mismo identificador → actualiza el contenido y
 * conserva el progreso; identificador nuevo → academia nueva.
 */
export function PaqueteEstudianteModal({ proyecto, secciones, onClose, onGuardado }: PaqueteEstudianteModalProps) {
  const [identificador, setIdentificador] = useState(proyecto.academia_id ?? '')
  const [autor, setAutor] = useState(proyecto.academia_autor ?? AUTOR_POR_DEFECTO)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState('')

  const idNorm = useMemo(() => normalizarIdentificador(identificador), [identificador])
  const numeroVisible = useMemo(() => numeroVisibleDesdeId(idNorm), [idNorm])
  const conTexto = useMemo(
    () => secciones.filter((s) => (s.content ?? '').replace(/<[^>]*>/g, '').trim().length > 0).length,
    [secciones]
  )

  const generar = async () => {
    setError('')
    setListo('')
    const duplicado = getOfflineProjects().find(
      (p) =>
        p.id !== proyecto.id &&
        (p.type || '').toLowerCase() === 'academia' &&
        (p.academia_id ?? '') !== '' &&
        p.academia_id === idNorm
    )
    const errorValidacion = validarDatosPaquete({
      identificador: idNorm,
      titulo: proyecto.title,
      secciones,
      idEnOtroProyecto: duplicado ? duplicado.title : null
    })
    if (errorValidacion) {
      setError(errorValidacion)
      return
    }
    setGenerando(true)
    try {
      // El identificador y el autor quedan guardados en el proyecto:
      // la próxima vez ya vienen puestos. Se parte del proyecto completo
      // de la capa de datos (el Editor solo trae una vista reducida).
      const autorLimpio = autor.trim()
      const completo = getOfflineProjects().find((p) => p.id === proyecto.id)
      saveOrUpdateOfflineProject({
        ...(completo ?? {
          id: proyecto.id,
          title: proyecto.title,
          type: proyecto.type ?? 'academia',
          updated_at: new Date().toISOString()
        }),
        academia_id: idNorm,
        academia_autor: autorLimpio || undefined
      })
      onGuardado?.({ academia_id: idNorm, academia_autor: autorLimpio || undefined })

      const { paquete, omitidas } = construirPaquete({
        identificador: idNorm,
        titulo: proyecto.title,
        autor: autorLimpio,
        secciones
      })
      const { nombre, rutaLocal } = await compartirPaqueteEstudiante(paquete)
      setListo(
        `✅ Paquete «${nombre}» creado con ${paquete.academia.codigos.length} códigos` +
          (omitidas > 0 ? ` (se omitieron ${omitidas} secciones vacías)` : '') +
          `. Compártelo por WhatsApp, Bluetooth o USB: el estudiante lo importa en la app Academia del Espíritu y la academia aparece en su lista como ${paquete.academia.numero || 'academia nueva'}.` +
          (rutaLocal
            ? ` También quedó guardado en este teléfono, en Documentos/${rutaLocal}: desde ahí lo puedes importar tú mismo sin buscarlo en ningún chat.`
            : '') +
          ` Si mañana corriges el texto, genera el paquete otra vez con el MISMO identificador: la app actualiza el contenido y el progreso del estudiante se conserva.`
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? '')
      if (/cancel/i.test(msg)) {
        setError('El paquete se creó, pero se canceló el compartir. Toca «Generar y compartir» de nuevo para enviarlo.')
      } else {
        setError(msg || 'No se pudo generar el paquete.')
      }
    } finally {
      setGenerando(false)
    }
  }

  const estiloInput: React.CSSProperties = {
    width: '100%', padding: '10px', borderRadius: '8px', marginBottom: '6px',
    background: '#0E1E28', color: '#F4EFE3', border: '1px solid rgba(201, 162, 74, 0.4)',
    fontFamily: "'EB Garamond', Georgia, serif", fontSize: '15px', boxSizing: 'border-box'
  }
  const estiloEtiqueta: React.CSSProperties = {
    display: 'block', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase',
    color: '#9FB3BC', marginBottom: '6px', marginTop: '12px', fontFamily: "'Cinzel', serif"
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(5, 15, 20, 0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '430px', maxHeight: '88vh', overflowY: 'auto',
          background: '#142B37', border: '1px solid rgba(201, 162, 74, 0.45)',
          borderRadius: '12px', padding: '20px', color: '#F4EFE3',
          fontFamily: "'EB Garamond', Georgia, serif"
        }}
      >
        <h3 style={{ margin: '0 0 4px', fontFamily: "'Cinzel', serif", fontSize: '16px', color: '#DFBE72', fontWeight: 700 }}>
          📦 Paquete para la app del estudiante
        </h3>
        <p style={{ margin: '0 0 6px', fontSize: '13.5px', color: '#C8D2D8', lineHeight: 1.5 }}>
          «{proyecto.title}» se convierte en un archivo de paquete con sus{' '}
          <strong>{conTexto} secciones como códigos</strong>, en tu orden, listo para
          enviar al estudiante. Él lo importa en la app <strong>Academia del Espíritu</strong>,
          que se instala sin academias: cada quien importa las que desee o las que le asignes.
        </p>

        <label style={estiloEtiqueta}>Identificador de la academia (lo asignas tú)</label>
        <input
          style={estiloInput}
          value={identificador}
          onChange={e => setIdentificador(e.target.value)}
          placeholder="lemgil-14"
          autoCapitalize="none"
          autoCorrect="off"
          disabled={generando}
        />
        <p style={{ margin: '0 0 4px', fontSize: '12.5px', color: '#9FB3BC', lineHeight: 1.5 }}>
          Autor + número, ej. <strong>lemgil-14</strong>. Con ese identificador la app
          reconoce la academia{numeroVisible ? <> y la muestra como <strong>{numeroVisible}</strong>, en ese orden de la lista</> : ''}.
          {identificador.trim() && idNorm !== identificador.trim()
            ? <> Se guardará como <strong>{idNorm || '—'}</strong> (minúsculas, sin espacios).</>
            : ''}
        </p>

        <label style={estiloEtiqueta}>Autor (lo verá el estudiante)</label>
        <input
          style={estiloInput}
          value={autor}
          onChange={e => setAutor(e.target.value)}
          placeholder={AUTOR_POR_DEFECTO}
          disabled={generando}
        />

        {error && (
          <div style={{
            background: 'rgba(180, 60, 50, 0.15)', border: '1px solid rgba(220, 110, 95, 0.5)',
            borderRadius: '8px', padding: '10px 12px', margin: '12px 0', fontSize: '13.5px', lineHeight: 1.5, color: '#F2C4BC'
          }}>
            {error}
          </div>
        )}
        {listo && (
          <div style={{
            background: 'rgba(48, 164, 108, 0.14)', border: '1px solid rgba(74, 224, 152, 0.45)',
            borderRadius: '8px', padding: '10px 12px', margin: '12px 0', fontSize: '13.5px', lineHeight: 1.55
          }}>
            {listo}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button
            onClick={onClose}
            disabled={generando}
            style={{
              flex: 1, padding: '11px', borderRadius: '8px', cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(200, 210, 216, 0.4)', color: '#C8D2D8',
              fontFamily: "'Cinzel', serif", fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px'
            }}
          >
            {listo ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            onClick={generar}
            disabled={generando || secciones.length === 0}
            style={{
              flex: 2, padding: '11px', borderRadius: '8px',
              cursor: generando ? 'default' : 'pointer',
              background: 'linear-gradient(135deg, #C9A24A 0%, #9C7B2D 100%)',
              border: '1px solid #C9A24A', color: '#142B37',
              fontFamily: "'Cinzel', serif", fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px',
              opacity: generando || secciones.length === 0 ? 0.6 : 1
            }}
          >
            {generando ? 'Generando…' : '📦 Generar y compartir'}
          </button>
        </div>
        {secciones.length === 0 && (
          <p style={{ margin: '10px 0 0', fontSize: '12.5px', color: '#F2C4BC' }}>
            Este proyecto no tiene secciones todavía: agrega al menos una para generar el paquete.
          </p>
        )}
      </div>
    </div>
  )
}
