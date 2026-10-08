// src/components/settings/MigracionLocalPanel.tsx
//
// «Traer mis proyectos actuales» (LemWriter Local, Fase 2 del diseño).
//
// Lee el respaldo JSON que exporta el LemWriter de siempre
// (Respaldo → Datos JSON) y escribe cada proyecto con sus secciones en
// las carpetas de LemWriter Local, conservando sus identificadores
// originales — incluidos los proyectos que solo viven en el teléfono y
// nunca llegaron a la nube. Los que ya estén en las carpetas se omiten:
// nada se duplica. Al final muestra el conteo para verificar.
// Todo ocurre en el teléfono, sin Internet.

import React, { useRef, useState } from 'react'
import {
  getOfflineProjects,
  saveOrUpdateOfflineProject,
  saveOfflineSections,
  generateLocalId,
  flushDataStore
} from '../../lib/dataStore'

export const MigracionLocalPanel: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [terminado, setTerminado] = useState(false)

  const alElegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setOcupado(true)
    setTerminado(false)
    setMensaje(null)
    try {
      const texto = await archivo.text()
      const datos = JSON.parse(texto)
      if (!datos || !Array.isArray(datos.proyectos)) {
        throw new Error('ese archivo no es un respaldo válido de LemWriter.')
      }
      const yaExisten = new Set(getOfflineProjects().map((p) => p.id))
      let nuevos = 0
      let omitidos = 0
      let seccionesTraidas = 0
      for (const item of datos.proyectos) {
        const p = item?.proyecto
        if (!p || !p.id) continue
        if (yaExisten.has(p.id)) {
          omitidos++
          continue
        }
        saveOrUpdateOfflineProject({
          id: p.id,
          title: p.title || 'Sin título',
          type: p.type || 'sermon',
          created_at: p.created_at,
          updated_at: p.updated_at || new Date().toISOString()
        })
        const secciones = Array.isArray(item.secciones) ? item.secciones : []
        saveOfflineSections(
          p.id,
          secciones.map((s: any, i: number) => ({
            id: s?.id || generateLocalId('local_sec'),
            project_id: p.id,
            title: s?.title || 'Sin título',
            content: s?.content || '',
            order_index: typeof s?.order_index === 'number' ? s.order_index : i
          }))
        )
        yaExisten.add(p.id)
        nuevos++
        seccionesTraidas += secciones.length
      }
      // Esperar a que todo quede escrito en las carpetas antes de reportar
      await flushDataStore()
      setMensaje(
        `✅ Traídos ${nuevos} proyecto(s) y ${seccionesTraidas} sección(es) a tus carpetas.` +
          (omitidos > 0 ? ` ${omitidos} ya estaban y se omitieron (no se duplican).` : '')
      )
      setTerminado(true)
    } catch (err: any) {
      setMensaje(`❌ No se pudo traer el respaldo: ${err?.message ?? err}`)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div
      style={{
        marginTop: '20px',
        padding: '14px',
        border: '1px solid rgba(201, 162, 74, 0.45)',
        borderRadius: '12px',
        background: 'rgba(201, 162, 74, 0.07)'
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>📥 Traer mis proyectos actuales</div>
      <div style={{ opacity: 0.85, fontSize: '0.9em', marginBottom: '10px' }}>
        En tu LemWriter de siempre abre <strong>Respaldo → Datos JSON</strong> y guarda el archivo de
        respaldo. Después elígelo aquí: tus proyectos y secciones se escriben en las carpetas de
        LemWriter Local, sin Internet y sin duplicar los que ya estén.
      </div>

      <input ref={inputRef} type="file" accept=".json,application/json" onChange={alElegir} style={{ display: 'none' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={ocupado}
          style={{ padding: '8px 12px', borderRadius: '8px' }}
        >
          {ocupado ? 'Trayendo…' : 'Elegir el respaldo JSON'}
        </button>
        {terminado && (
          <button onClick={() => window.location.reload()} style={{ padding: '8px 12px', borderRadius: '8px' }}>
            Ver mis proyectos
          </button>
        )}
      </div>

      {!!mensaje && (
        <pre
          style={{
            marginTop: '12px',
            whiteSpace: 'pre-wrap',
            fontSize: '0.85em',
            background: 'rgba(0,0,0,0.25)',
            padding: '10px',
            borderRadius: '8px'
          }}
        >
          {mensaje}
        </pre>
      )}
    </div>
  )
}
