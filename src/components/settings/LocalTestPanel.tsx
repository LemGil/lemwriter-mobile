// src/components/settings/LocalTestPanel.tsx
//
// Panel de PRUEBA de LemWriter Local (Fase 1 del diseño).
// Verifica en el teléfono real que la app puede crear, leer y renombrar
// carpetas en Documentos/<raíz> — sin Internet. En navegador usa memoria
// y lo dice en pantalla (las carpetas reales son cosa de la APK).

import React, { useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { FolderStore, carpetaRaizGuardada, guardarCarpetaRaiz } from '../../lib/folderStore'
import { CapacitorFsAdapter } from '../../lib/fsCapacitor'
import { MemoryFsAdapter } from '../../lib/fsAdapter'

export const LocalTestPanel: React.FC = () => {
  const esNativo = Capacitor.isNativePlatform()
  const [raiz, setRaiz] = useState(carpetaRaizGuardada())
  const [lineas, setLineas] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)

  const store = useMemo(
    () => new FolderStore(esNativo ? new CapacitorFsAdapter() : new MemoryFsAdapter(), raiz),
    [esNativo, raiz]
  )

  const log = (texto: string) => setLineas((prev) => [...prev, texto])

  const ejecutar = async (fn: () => Promise<void>) => {
    setOcupado(true)
    try {
      await fn()
    } catch (e: any) {
      log(`❌ Error: ${e?.message ?? e}`)
    } finally {
      setOcupado(false)
    }
  }

  const crearEstructura = () =>
    ejecutar(async () => {
      await store.asegurarEstructura()
      log(`✅ Estructura creada en ${esNativo ? 'Documentos' : 'memoria (navegador)'}/${raiz}`)
    })

  const crearPrueba = () =>
    ejecutar(async () => {
      const p = await store.crearProyecto('sermon', 'Prueba LemWriter Local')
      await store.guardarSeccion(p.id, {
        titulo: 'Introducción',
        contentHtml: '<h2>Introducción</h2><p>Esto se guardó en una <strong>carpeta local</strong>, sin Internet.</p>',
      })
      await store.guardarSeccion(p.id, {
        titulo: 'Punto uno',
        contentHtml: '<p>Primera sección del archivo <em>02-punto-uno.md</em>.</p>',
      })
      log(`✅ Proyecto de prueba en ${raiz}/${p.carpeta} con 2 secciones (.md)`)
    })

  const listar = () =>
    ejecutar(async () => {
      const proyectos = await store.listarProyectos()
      if (!proyectos.length) {
        log('📭 Todavía no hay proyectos en las carpetas.')
        return
      }
      for (const p of proyectos) {
        const secciones = await store.listarSecciones(p.id)
        log(`📁 ${p.carpeta} — «${p.titulo}» (${secciones.length} secciones)`)
      }
    })

  const cambiarRaiz = () =>
    ejecutar(async () => {
      guardarCarpetaRaiz(raiz)
      log(`💾 Carpeta raíz guardada: ${raiz}. La estructura se crea al usarla.`)
    })

  return (
    <div
      style={{
        marginTop: '20px',
        padding: '14px',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.04)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>🧪 LemWriter Local — prueba de carpetas (Fase 1)</div>
      <div style={{ opacity: 0.85, fontSize: '0.9em', marginBottom: '10px' }}>
        {esNativo
          ? 'Estás en la APK: las carpetas se crean de verdad en Documentos del teléfono.'
          : 'Estás en navegador: esto corre en memoria. Las carpetas reales se prueban en la APK.'}
      </div>

      <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '4px' }}>
        Carpeta raíz (la puedes cambiar):
      </label>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <input
          value={raiz}
          onChange={(e) => setRaiz(e.target.value)}
          style={{ flex: 1, padding: '8px', borderRadius: '8px' }}
        />
        <button onClick={cambiarRaiz} disabled={ocupado} style={{ padding: '8px 12px', borderRadius: '8px' }}>
          Guardar raíz
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button onClick={crearEstructura} disabled={ocupado} style={{ padding: '8px 12px', borderRadius: '8px' }}>
          1 · Crear estructura
        </button>
        <button onClick={crearPrueba} disabled={ocupado} style={{ padding: '8px 12px', borderRadius: '8px' }}>
          2 · Crear proyecto de prueba
        </button>
        <button onClick={listar} disabled={ocupado} style={{ padding: '8px 12px', borderRadius: '8px' }}>
          3 · Listar mis carpetas
        </button>
      </div>

      {!!lineas.length && (
        <pre
          style={{
            marginTop: '12px',
            whiteSpace: 'pre-wrap',
            fontSize: '0.85em',
            background: 'rgba(0,0,0,0.25)',
            padding: '10px',
            borderRadius: '8px',
            maxHeight: '220px',
            overflow: 'auto',
          }}
        >
          {lineas.join('\n')}
        </pre>
      )}
    </div>
  )
}
