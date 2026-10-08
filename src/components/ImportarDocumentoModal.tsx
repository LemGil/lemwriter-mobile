// src/components/ImportarDocumentoModal.tsx
//
// «Importar documento» (LemWriter Local, diseño §4.2): elige un archivo
// .docx, .pdf, .txt o .md del teléfono y nace como proyecto nuevo en las
// carpetas, listo para leer y editar. Tú eliges el tipo (Estudio por
// defecto). Todo ocurre en el teléfono, sin Internet.

import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  saveOrUpdateOfflineProject,
  saveOfflineSections,
  generateLocalId,
  flushDataStore
} from '../lib/dataStore'
import {
  convertirDocumento,
  esDocumentoSoportado,
  type DocumentoImportado
} from '../lib/importarDocumento'
import type { Proyecto } from '../types'

interface Props {
  onClose: () => void
  onImportado: (proyecto: Proyecto) => void
}

const TIPOS: { valor: string; etiqueta: string }[] = [
  { valor: 'estudio', etiqueta: '🔬 Estudio' },
  { valor: 'ensenanza', etiqueta: '📖 Enseñanza' },
  { valor: 'sermon', etiqueta: '🎤 Sermón' },
  { valor: 'devocional', etiqueta: '🕊️ Devocional' },
  { valor: 'video', etiqueta: '🎬 Video' },
  { valor: 'academia', etiqueta: '🎓 Academia' },
  { valor: 'libro', etiqueta: '📚 Libro' }
]

export const ImportarDocumentoModal: React.FC<Props> = ({ onClose, onImportado }) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [paso, setPaso] = useState<'elegir' | 'vista'>('elegir')
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [documento, setDocumento] = useState<DocumentoImportado | null>(null)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState('estudio')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alElegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    if (!esDocumentoSoportado(archivo.name)) {
      setError(`Formato no soportado: «${archivo.name}». Usa .docx, .pdf, .txt o .md.`)
      return
    }
    setError(null)
    setOcupado(true)
    setNombreArchivo(archivo.name)
    try {
      const doc = await convertirDocumento({ name: archivo.name, data: archivo })
      setDocumento(doc)
      setTitulo(doc.titulo)
      setPaso('vista')
    } catch (err: any) {
      setError(err?.message || 'No se pudo leer el documento.')
    } finally {
      setOcupado(false)
    }
  }

  const crearProyecto = async () => {
    if (!documento) return
    setOcupado(true)
    setError(null)
    try {
      const ahora = new Date().toISOString()
      const proyecto: Proyecto = {
        id: generateLocalId('local_proj'),
        title: titulo.trim() || documento.titulo,
        type: tipo,
        created_at: ahora,
        updated_at: ahora
      }
      saveOrUpdateOfflineProject(proyecto)
      saveOfflineSections(
        proyecto.id,
        documento.secciones.map((s, i) => ({
          id: generateLocalId('local_sec'),
          project_id: proyecto.id,
          title: s.titulo,
          content: s.html,
          order_index: i
        }))
      )
      await flushDataStore()
      toast.success(`Documento importado: ${documento.secciones.length} sección(es)`)
      onImportado(proyecto)
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear el proyecto.')
    } finally {
      setOcupado(false)
    }
  }

  const campo: React.CSSProperties = {
    width: '100%',
    background: 'rgba(10, 25, 33, 0.85)',
    border: '1px solid rgba(201, 162, 74, 0.35)',
    borderRadius: '8px',
    color: '#EDE6D6',
    padding: '9px 10px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box'
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4, 10, 14, 0.78)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '12px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, #1A3A4A 0%, #122834 100%)',
          border: '1px solid rgba(201, 162, 74, 0.45)',
          borderRadius: '14px',
          padding: '18px 16px',
          color: '#EDE6D6',
          fontFamily: "'Inter', sans-serif",
          boxShadow: '0 12px 40px rgba(0,0,0,0.55)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <h3 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: '#DFBE72', fontSize: '16px' }}>
            📥 Importar documento
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#9BB0BD', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#B9CBD4', lineHeight: 1.5 }}>
          Elige un <strong>.docx</strong>, <strong>.pdf</strong>, <strong>.txt</strong> o <strong>.md</strong> de tu
          teléfono: nace como proyecto nuevo en tus carpetas, listo para leer y editar. Sin Internet.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf,.txt,.md"
          onChange={alElegir}
          style={{ display: 'none' }}
        />

        {paso === 'elegir' && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={ocupado}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
              color: '#122834',
              border: 'none',
              borderRadius: '8px',
              padding: '11px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: ocupado ? 'wait' : 'pointer',
              fontFamily: "'Cinzel', serif",
              opacity: ocupado ? 0.7 : 1
            }}
          >
            {ocupado ? `Leyendo ${nombreArchivo || 'documento'}…` : 'Elegir documento'}
          </button>
        )}

        {error && (
          <div
            style={{
              marginTop: '12px',
              background: 'rgba(150, 40, 40, 0.18)',
              border: '1px solid rgba(255, 120, 120, 0.45)',
              borderRadius: '8px',
              padding: '9px 10px',
              fontSize: '12px',
              lineHeight: 1.5
            }}
          >
            ❌ {error}
          </div>
        )}

        {paso === 'vista' && documento && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#9BB0BD', margin: '4px 0 5px' }}>
              Título del proyecto
            </label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} style={campo} />

            <label style={{ display: 'block', fontSize: '11px', color: '#9BB0BD', margin: '12px 0 5px' }}>
              Guardar como tipo
            </label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={campo}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>

            <div
              style={{
                marginTop: '12px',
                background: 'rgba(10, 25, 33, 0.6)',
                border: '1px solid rgba(155, 176, 189, 0.25)',
                borderRadius: '8px',
                padding: '9px 10px'
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#DFBE72' }}>
                {documento.secciones.length} sección(es) de «{nombreArchivo}»
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '11.5px', color: '#B9CBD4', lineHeight: 1.6 }}>
                {documento.secciones.slice(0, 6).map((s, i) => (
                  <li key={i}>{s.titulo}</li>
                ))}
                {documento.secciones.length > 6 && <li>…y {documento.secciones.length - 6} más</li>}
              </ul>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <button
                onClick={() => {
                  setPaso('elegir')
                  setDocumento(null)
                }}
                disabled={ocupado}
                style={{
                  flex: 1,
                  background: 'rgba(20, 43, 55, 0.8)',
                  border: '1px solid rgba(201, 162, 74, 0.35)',
                  color: '#DFBE72',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Elegir otro
              </button>
              <button
                onClick={crearProyecto}
                disabled={ocupado}
                style={{
                  flex: 2,
                  background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                  color: '#122834',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: ocupado ? 'wait' : 'pointer',
                  fontFamily: "'Cinzel', serif",
                  opacity: ocupado ? 0.7 : 1
                }}
              >
                {ocupado ? 'Creando proyecto…' : 'Crear proyecto'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
