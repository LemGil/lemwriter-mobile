import React, { useState } from 'react'
import { resolveConflict } from '../lib/dataStore'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Conflicto {
  id: string
  projectId: string
  projectTitle?: string
  sectionId: string
  sectionTitle: string
  localContent: string
  remoteContent: string
  localUpdatedAt: string
  remoteUpdatedAt: string
}

type Vista = 'lado-a-lado' | 'solo-local' | 'solo-nube'
type Estrategia = 'keep_local' | 'keep_remote' | 'keep_both' | 'merge'

interface Props {
  conflicto: Conflicto
  onClose: () => void
  onResolved: (estrategia: Estrategia, newSectionId?: string) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function contarPalabras(html: string): number {
  const texto = stripHtml(html)
  return texto ? texto.split(/\s+/).length : 0
}

// ── Componente ───────────────────────────────────────────────────────────────

export function ConflictoResolucionModal({ conflicto, onClose, onResolved }: Props) {
  const [vista, setVista] = useState<Vista>('lado-a-lado')
  const [resolviendo, setResolviendo] = useState(false)

  const palabrasLocal = contarPalabras(conflicto.localContent)
  const palabrasRemote = contarPalabras(conflicto.remoteContent)

  async function manejarResolucion(estrategia: Estrategia) {
    setResolviendo(true)
    try {
      const resultado = await resolveConflict(conflicto.id, estrategia)
      if (resultado?.success) {
        onResolved(estrategia, resultado.newSectionId)
      }
    } finally {
      setResolviendo(false)
    }
  }

  const textoLocal = stripHtml(conflicto.localContent)
  const textoRemote = stripHtml(conflicto.remoteContent)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#1E3D4F', border: '1px solid #C9A24A', borderRadius: 16, padding: 24, width: '90%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: '#C9A24A', fontFamily: 'Cinzel, serif', margin: 0, fontSize: 18 }}>
            Conflicto de edición — {conflicto.sectionTitle}
          </h2>
          <button onClick={onClose} style={{ background: 'none', color: '#8E9EA7', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Selector de vista */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['lado-a-lado', 'solo-local', 'solo-nube'] as Vista[]).map((v) => {
            const etiqueta = v === 'lado-a-lado' ? 'Lado a lado' : v === 'solo-local' ? 'Solo Local' : 'Solo Nube'
            return (
              <button
                key={v}
                onClick={() => setVista(v)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid #C9A24A',
                  background: vista === v ? '#C9A24A' : 'transparent',
                  color: vista === v ? '#122834' : '#C9A24A',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 12,
                }}
              >
                {etiqueta}
              </button>
            )
          })}
        </div>

        {/* Comparación */}
        <div style={{ display: 'grid', gridTemplateColumns: vista === 'lado-a-lado' ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 20 }}>
          {(vista === 'lado-a-lado' || vista === 'solo-local') && (
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
              <div style={{ color: '#DFBE72', fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Tu Versión en este dispositivo</div>
              <div style={{ color: '#9BB0BD', fontSize: 11, marginBottom: 8 }}>{palabrasLocal} palabras</div>
              <div style={{ color: '#F5F1E8', fontSize: 13, lineHeight: 1.5 }}>{textoLocal}</div>
              <div style={{ color: '#9BB0BD', fontSize: 11, marginTop: 8 }}>{palabrasLocal} palabras</div>
            </div>
          )}
          {(vista === 'lado-a-lado' || vista === 'solo-nube') && (
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
              <div style={{ color: '#DFBE72', fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Versión en la Nube / Otro Dispositivo</div>
              <div style={{ color: '#9BB0BD', fontSize: 11, marginBottom: 8 }}>{palabrasRemote} palabras</div>
              <div style={{ color: '#F5F1E8', fontSize: 13, lineHeight: 1.5 }}>{textoRemote}</div>
              <div style={{ color: '#9BB0BD', fontSize: 11, marginTop: 8 }}>{palabrasRemote} palabras</div>
            </div>
          )}
        </div>

        {/* Botones de resolución */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([
            { estrategia: 'keep_both' as Estrategia, label: 'Conservar Ambas Versiones' },
            { estrategia: 'merge'     as Estrategia, label: 'Combinar Ambas en una' },
            { estrategia: 'keep_local'  as Estrategia, label: 'Conservar Solo Mi Versión Local' },
            { estrategia: 'keep_remote' as Estrategia, label: 'Aceptar Versión de la Nube' },
          ]).map(({ estrategia, label }) => (
            <button
              key={estrategia}
              disabled={resolviendo}
              onClick={() => manejarResolucion(estrategia)}
              style={{
                padding: '10px 16px',
                background: resolviendo ? 'rgba(201,162,74,0.3)' : 'rgba(201,162,74,0.15)',
                border: '1px solid rgba(201,162,74,0.5)',
                color: '#DFBE72',
                borderRadius: 8,
                cursor: resolviendo ? 'not-allowed' : 'pointer',
                fontFamily: 'Inter, sans-serif',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'left',
              }}
            >
              {label}
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
