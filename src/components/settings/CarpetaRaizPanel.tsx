// src/components/settings/CarpetaRaizPanel.tsx
//
// Ajuste de la carpeta raíz de LemWriter Local: muestra dónde viven los
// proyectos y permite cambiarla con el explorador de carpetas del teléfono.
// Al cambiarla, la app se reinicia para releer todo desde la nueva raíz.

import React, { useState } from 'react'
import { carpetaRaizGuardada, guardarCarpetaRaiz } from '../../lib/folderStore'
import { flushDataStore } from '../../lib/dataStore'
import { ExploradorCarpetas, type BaseCarpeta } from './ExploradorCarpetas'

export const CarpetaRaizPanel: React.FC = () => {
  const [raiz, setRaiz] = useState(carpetaRaizGuardada())
  const [explorador, setExplorador] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  const elegir = async (_base: BaseCarpeta, ruta: string) => {
    const nueva = ruta.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!nueva || nueva === raiz) {
      setExplorador(false)
      return
    }
    setAplicando(true)
    try {
      // Guardar lo pendiente antes de cambiar de carpeta
      await flushDataStore().catch(() => {})
      guardarCarpetaRaiz(nueva)
      setRaiz(nueva)
      setExplorador(false)
      // Reiniciar para que el almacén relea todo desde la nueva raíz
      window.location.reload()
    } finally {
      setAplicando(false)
    }
  }

  return (
    <div
      style={{
        marginTop: '16px',
        padding: '14px',
        border: '1px solid rgba(201, 162, 74, 0.3)',
        borderRadius: '12px',
        background: 'rgba(201, 162, 74, 0.06)',
      }}
    >
      <div style={{ color: '#DFBE72', fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>
        📁 Carpeta raíz de LemWriter Local
      </div>
      <div style={{ color: '#BDC7CC', fontSize: '13px', marginBottom: '10px', lineHeight: 1.45 }}>
        Tus proyectos viven en <strong style={{ color: '#F5F1E8' }}>Documentos/{raiz}</strong>.
        Al cambiarla, la app se reinicia y lee los proyectos de la nueva carpeta.
      </div>
      <button
        type="button"
        onClick={() => setExplorador(true)}
        disabled={aplicando}
        style={{
          padding: '9px 16px',
          borderRadius: '8px',
          border: '1px solid #C9A24A',
          background: 'rgba(201, 162, 74, 0.15)',
          color: '#DFBE72',
          fontWeight: 700,
          fontSize: '13px',
          cursor: aplicando ? 'default' : 'pointer',
        }}
      >
        {aplicando ? 'Aplicando…' : '🔍 Cambiar carpeta…'}
      </button>

      {explorador && (
        <ExploradorCarpetas
          titulo="Elegir carpeta raíz"
          baseInicial="documents"
          rutaInicial={raiz}
          permitirCambiarBase={false}
          onElegir={elegir}
          onCerrar={() => setExplorador(false)}
        />
      )}
    </div>
  )
}
