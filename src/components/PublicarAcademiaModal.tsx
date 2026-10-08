import { useEffect, useState } from 'react'
import {
  cargarNivelesAcademia,
  buscarCursoEnlazado,
  publicarProyectoEnAcademia,
  type NivelAcademia,
  type CursoEnlazado,
  type SeccionAPublicar
} from '../lib/publicarAcademia'

interface PublicarAcademiaModalProps {
  proyectoId: string
  titulo: string
  secciones: SeccionAPublicar[]
  onClose: () => void
  onPublicado?: (curso: CursoEnlazado) => void
}

function traducirError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  if (/texto|lemwriter_seccion_id|lemwriter_id/.test(msg)) {
    return 'La Academia todavía no está preparada: falta correr la migración 013_enlace_lemwriter.sql en Supabase.'
  }
  if (/row-level security|permission denied|42501/i.test(msg)) {
    return 'La Academia no te dejó escribir: tu usuario necesita el rol de administrador (archivo marcar-admin-lemwriter.sql, una sola vez).'
  }
  return msg || 'No se pudo publicar.'
}

export function PublicarAcademiaModal({ proyectoId, titulo, secciones, onClose, onPublicado }: PublicarAcademiaModalProps) {
  const [niveles, setNiveles] = useState<NivelAcademia[]>([])
  const [nivelId, setNivelId] = useState<number | ''>('')
  const [enlazado, setEnlazado] = useState<CursoEnlazado | null>(null)
  const [cargando, setCargando] = useState(true)
  const [publicando, setPublicando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const [listaNiveles, curso] = await Promise.all([
          cargarNivelesAcademia(),
          buscarCursoEnlazado(proyectoId)
        ])
        if (!vivo) return
        setNiveles(listaNiveles)
        setEnlazado(curso)
        setNivelId(curso ? curso.nivel_id : (listaNiveles[0]?.id ?? ''))
      } catch (e) {
        if (vivo) setError(traducirError(e))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [proyectoId])

  const publicar = async () => {
    if (nivelId === '') return
    setPublicando(true)
    setError('')
    try {
      const r = await publicarProyectoEnAcademia({
        proyectoId,
        titulo,
        nivelId,
        secciones
      })
      setListo(
        `✅ Publicado: el curso «${r.cursoTitulo}» quedó en la Academia con ${r.temasNuevos + r.temasActualizados} temas (${r.temasNuevos} nuevos, ${r.temasActualizados} actualizados). Los estudiantes ya pueden leer la enseñanza; los videos y el PDF se adjuntan en el panel de la Academia como siempre.`
      )
      const cursoPublicado: CursoEnlazado = {
        id: r.cursoId,
        titulo: r.cursoTitulo,
        nivel_id: nivelId,
        orden: null,
        created_at: r.fechaPublicacion,
        updated_at: r.fechaPublicacion
      }
      setEnlazado(cursoPublicado)
      onPublicado?.(cursoPublicado)
    } catch (e) {
      setError(traducirError(e))
    } finally {
      setPublicando(false)
    }
  }

  const nombreNivel = (id: number) => niveles.find(n => n.id === id)?.nombre || ''

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
          🎓 Publicar en Academia
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: '13.5px', color: '#C8D2D8', lineHeight: 1.5 }}>
          «{titulo}» se publica como <strong>un curso</strong> con <strong>{secciones.length} temas</strong> (uno por sección, en tu orden), cada uno con el texto completo de la enseñanza para leer en la Academia.
        </p>

        {cargando ? (
          <p style={{ fontSize: '14px', color: '#C8D2D8' }}>Conectando con la Academia…</p>
        ) : (
          <>
            {enlazado && (
              <div style={{
                background: 'rgba(201, 162, 74, 0.12)', border: '1px solid rgba(201, 162, 74, 0.35)',
                borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', fontSize: '13.5px', lineHeight: 1.5
              }}>
                Ya está publicado como el curso «{enlazado.titulo}»
                {nombreNivel(enlazado.nivel_id) ? ` en el nivel ${nombreNivel(enlazado.nivel_id)}` : ''}.
                Al publicar de nuevo se <strong>actualiza en el mismo lugar</strong>, sin duplicar y sin perder el avance de los estudiantes.
              </div>
            )}

            <label style={{ display: 'block', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', color: '#9FB3BC', marginBottom: '6px', fontFamily: "'Cinzel', serif" }}>
              Nivel en la Academia
            </label>
            <select
              value={nivelId}
              onChange={e => setNivelId(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={publicando}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px', marginBottom: '14px',
                background: '#0E1E28', color: '#F4EFE3', border: '1px solid rgba(201, 162, 74, 0.4)',
                fontFamily: "'EB Garamond', Georgia, serif", fontSize: '15px'
              }}
            >
              {niveles.length === 0 && <option value="">— Sin niveles —</option>}
              {niveles.map(n => (
                <option key={n.id} value={n.id}>{n.nombre}</option>
              ))}
            </select>

            {error && (
              <div style={{
                background: 'rgba(180, 60, 50, 0.15)', border: '1px solid rgba(220, 110, 95, 0.5)',
                borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', fontSize: '13.5px', lineHeight: 1.5, color: '#F2C4BC'
              }}>
                {error}
              </div>
            )}
            {listo && (
              <div style={{
                background: 'rgba(48, 164, 108, 0.14)', border: '1px solid rgba(74, 224, 152, 0.45)',
                borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', fontSize: '13.5px', lineHeight: 1.55
              }}>
                {listo}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={onClose}
                disabled={publicando}
                style={{
                  flex: 1, padding: '11px', borderRadius: '8px', cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(200, 210, 216, 0.4)', color: '#C8D2D8',
                  fontFamily: "'Cinzel', serif", fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px'
                }}
              >
                {listo ? 'Cerrar' : 'Cancelar'}
              </button>
              <button
                onClick={publicar}
                disabled={publicando || nivelId === '' || secciones.length === 0}
                style={{
                  flex: 2, padding: '11px', borderRadius: '8px',
                  cursor: publicando || nivelId === '' ? 'default' : 'pointer',
                  background: 'linear-gradient(135deg, #C9A24A 0%, #9C7B2D 100%)',
                  border: '1px solid #C9A24A', color: '#142B37',
                  fontFamily: "'Cinzel', serif", fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px',
                  opacity: publicando || nivelId === '' ? 0.6 : 1
                }}
              >
                {publicando ? 'Publicando…' : enlazado ? 'Actualizar en Academia' : 'Publicar en Academia'}
              </button>
            </div>
            {secciones.length === 0 && (
              <p style={{ margin: '10px 0 0', fontSize: '12.5px', color: '#F2C4BC' }}>
                Este proyecto no tiene secciones todavía: agrega al menos una para publicar.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
