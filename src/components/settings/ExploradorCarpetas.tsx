// src/components/settings/ExploradorCarpetas.tsx
//
// Explorador de carpetas del teléfono (solo APK): permite navegar por
// Documentos o el Almacenamiento interno, crear subcarpetas y elegir una.
// Se usa para cambiar la carpeta raíz de LemWriter Local y para conectar
// la carpeta del vault de Obsidian.

import React, { useCallback, useEffect, useState } from 'react'
import { Filesystem, Directory } from '@capacitor/filesystem'

export type BaseCarpeta = 'documents' | 'external'

interface Props {
  titulo: string
  baseInicial?: BaseCarpeta
  rutaInicial?: string
  /** Si es false, no se puede cambiar de base (p. ej. la raíz siempre vive en Documentos). */
  permitirCambiarBase?: boolean
  onElegir: (base: BaseCarpeta, ruta: string) => void
  onCerrar: () => void
}

function directorioDe(base: BaseCarpeta): Directory {
  return base === 'documents' ? Directory.Documents : Directory.ExternalStorage
}

function etiquetaBase(base: BaseCarpeta): string {
  return base === 'documents' ? 'Documentos' : 'Almacenamiento'
}

export const ExploradorCarpetas: React.FC<Props> = ({
  titulo,
  baseInicial = 'documents',
  rutaInicial = '',
  permitirCambiarBase = true,
  onElegir,
  onCerrar,
}) => {
  const [base, setBase] = useState<BaseCarpeta>(baseInicial)
  const [ruta, setRuta] = useState(rutaInicial)
  const [carpetas, setCarpetas] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)
  const [nombreNueva, setNombreNueva] = useState('')

  const cargar = useCallback(async (b: BaseCarpeta, r: string) => {
    setCargando(true)
    setError('')
    try {
      const dir = directorioDe(b)
      const res = await Filesystem.readdir({ path: r, directory: dir })
      const nombres: string[] = []
      for (const f of res.files as any[]) {
        if (typeof f === 'string') {
          try {
            const st: any = await Filesystem.stat({
              path: r ? `${r}/${f}` : f,
              directory: dir,
            })
            if (st.type === 'directory') nombres.push(f)
          } catch {
            /* se ignora */
          }
        } else if (f && f.type === 'directory' && typeof f.name === 'string') {
          nombres.push(f.name)
        }
      }
      nombres.sort((a, b2) => a.localeCompare(b2, 'es'))
      setCarpetas(nombres)
    } catch (e: any) {
      setCarpetas([])
      setError(
        'No se pudo leer esta carpeta. Revisa el permiso «Acceso a todos los archivos» ' +
          'en Ajustes del teléfono.'
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar(base, ruta)
  }, [base, ruta, cargar])

  const subir = () => {
    if (!ruta) return
    const partes = ruta.split('/').filter(Boolean)
    partes.pop()
    setRuta(partes.join('/'))
  }

  const cambiarBase = (b: BaseCarpeta) => {
    if (b === base) return
    setBase(b)
    setRuta('')
  }

  const crearCarpeta = async () => {
    const nombre = nombreNueva.trim().replace(/[/\\]/g, '')
    if (!nombre) return
    try {
      await Filesystem.mkdir({
        path: ruta ? `${ruta}/${nombre}` : nombre,
        directory: directorioDe(base),
        recursive: true,
      })
      setNombreNueva('')
      setCreando(false)
      cargar(base, ruta)
    } catch (e: any) {
      setError(`No se pudo crear la carpeta: ${e?.message ?? e}`)
    }
  }

  const etiquetaRuta = `${etiquetaBase(base)}${ruta ? `/${ruta}` : ''}`

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(10, 24, 33, 0.85)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1E3D4F',
          border: '1px solid rgba(201, 162, 74, 0.4)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '440px',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            padding: '14px 16px 10px 16px',
            borderBottom: '1px solid rgba(201, 162, 74, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ color: '#DFBE72', fontWeight: 700, fontSize: '15px' }}>{titulo}</div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar explorador"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9BB0BD',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '2px 6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Selector de base */}
        {permitirCambiarBase && (
          <div style={{ display: 'flex', gap: '8px', padding: '10px 16px 0 16px' }}>
            {(['documents', 'external'] as BaseCarpeta[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => cambiarBase(b)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: base === b ? '1px solid #C9A24A' : '1px solid rgba(255,255,255,0.15)',
                  background: base === b ? 'rgba(201, 162, 74, 0.2)' : 'transparent',
                  color: base === b ? '#DFBE72' : '#9BB0BD',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {b === 'documents' ? '📄 Documentos' : '💾 Almacenamiento'}
              </button>
            ))}
          </div>
        )}

        {/* Ruta actual */}
        <div
          style={{
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              flex: 1,
              color: '#F5F1E8',
              fontSize: '13px',
              background: 'rgba(0,0,0,0.25)',
              borderRadius: '8px',
              padding: '8px 10px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            📁 {etiquetaRuta}
          </div>
          <button
            type="button"
            onClick={subir}
            disabled={!ruta}
            title="Subir un nivel"
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: ruta ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: ruta ? '#DFBE72' : '#5A6B75',
              fontSize: '14px',
              cursor: ruta ? 'pointer' : 'default',
            }}
          >
            ↑
          </button>
        </div>

        {/* Lista de carpetas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', minHeight: '120px' }}>
          {cargando && <div style={{ color: '#8E9EA7', fontSize: '13px' }}>Leyendo…</div>}
          {error && <div style={{ color: '#E5484D', fontSize: '13px' }}>{error}</div>}
          {!cargando && !error && carpetas.length === 0 && (
            <div style={{ color: '#8E9EA7', fontSize: '13px' }}>No hay subcarpetas aquí.</div>
          )}
          {!cargando &&
            carpetas.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setRuta(ruta ? `${ruta}/${c}` : c)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  color: '#F5F1E8',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '17px' }}>📁</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c}
                </span>
                <span style={{ color: '#C9A24A' }}>›</span>
              </button>
            ))}
        </div>

        {/* Nueva carpeta */}
        <div style={{ padding: '8px 16px 0 16px' }}>
          {!creando ? (
            <button
              type="button"
              onClick={() => setCreando(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#DFBE72',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '6px 0',
              }}
            >
              ＋ Nueva carpeta aquí
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', padding: '6px 0' }}>
              <input
                value={nombreNueva}
                onChange={(e) => setNombreNueva(e.target.value)}
                placeholder="Nombre de la carpeta"
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(201, 162, 74, 0.4)',
                  background: 'rgba(0,0,0,0.25)',
                  color: '#F5F1E8',
                  fontSize: '13px',
                }}
              />
              <button
                type="button"
                onClick={crearCarpeta}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#C9A24A',
                  color: '#142C38',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Crear
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreando(false)
                  setNombreNueva('')
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent',
                  color: '#9BB0BD',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Pie */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(201, 162, 74, 0.25)',
            display: 'flex',
            gap: '10px',
          }}
        >
          <button
            type="button"
            onClick={onCerrar}
            style={{
              flex: 1,
              padding: '11px',
              background: '#142C38',
              border: '1px solid #2E4B5E',
              color: '#9BB0BD',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onElegir(base, ruta)}
            style={{
              flex: 2,
              padding: '11px',
              background: 'linear-gradient(135deg, #C9A24A 0%, #A88434 100%)',
              border: 'none',
              color: '#142C38',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Usar esta carpeta
          </button>
        </div>
      </div>
    </div>
  )
}
