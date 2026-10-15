// src/components/settings/RespaldoZipCarpetas.tsx
//
// Respaldo y restauración de las carpetas de LemWriter Local en un archivo ZIP.
// Todo ocurre en el teléfono, sin Internet.
//
// - «Crear respaldo»: comprime Documentos/<raíz> en
//   Documentos/LemWriter-respaldo-<fecha>.zip (con imágenes y todo).
// - «Restaurar»: lee un ZIP de respaldo y sobrescribe las carpetas actuales
//   con su contenido. Pide confirmación antes de tocar nada.

import React, { useRef, useState } from 'react'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { carpetaRaizGuardada } from '../../lib/folderStore'
import {
  crearRespaldoZip,
  restaurarRespaldoZip,
  type ZipFs,
} from '../../lib/respaldoZip'

const fsCapacitor: ZipFs = {
  async readdir(path) {
    const res = await Filesystem.readdir({ path, directory: Directory.Documents })
    const out: { name: string; type: string }[] = []
    for (const f of res.files as any[]) {
      if (typeof f === 'string') {
        try {
          const st: any = await Filesystem.stat({
            path: path ? `${path}/${f}` : f,
            directory: Directory.Documents,
          })
          out.push({ name: f, type: st.type === 'directory' ? 'directory' : 'file' })
        } catch {
          /* entrada ilegible: se ignora */
        }
      } else if (f && typeof f.name === 'string') {
        out.push({ name: f.name, type: f.type === 'directory' ? 'directory' : 'file' })
      }
    }
    return out
  },
  async readFileBase64(path) {
    const contenido: any = await Filesystem.readFile({ path, directory: Directory.Documents })
    return typeof contenido.data === 'string' ? contenido.data : ''
  },
  async mkdir(path) {
    await Filesystem.mkdir({ path, directory: Directory.Documents, recursive: true })
  },
  async writeFileBase64(path, base64) {
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Documents, recursive: true })
  },
}

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result || '').split(',')[1] || '')
    lector.onerror = () => reject(lector.error)
    lector.readAsDataURL(blob)
  })
}

export const RespaldoZipCarpetas: React.FC = () => {
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [esError, setEsError] = useState(false)
  const [ultimoZip, setUltimoZip] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const informar = (texto: string, error = false) => {
    setMensaje(texto)
    setEsError(error)
  }

  const crearRespaldo = async () => {
    setOcupado(true)
    informar('')
    setUltimoZip('')
    try {
      const raiz = carpetaRaizGuardada()
      const { blob, archivos } = await crearRespaldoZip(fsCapacitor, raiz)
      const fecha = new Date().toISOString().slice(0, 10)
      const nombre = `LemWriter-respaldo-${fecha}.zip`
      await Filesystem.writeFile({
        path: nombre,
        data: await blobABase64(blob),
        directory: Directory.Documents,
      })
      setUltimoZip(nombre)
      informar(`✅ Respaldo creado: Documentos/${nombre} (${archivos} archivos).`)
    } catch (e: any) {
      informar(`❌ No se pudo crear el respaldo: ${e?.message ?? e}`, true)
    } finally {
      setOcupado(false)
    }
  }

  const compartirRespaldo = async () => {
    if (!ultimoZip) return
    try {
      const uri = await Filesystem.getUri({ path: ultimoZip, directory: Directory.Documents })
      await Share.share({
        title: 'Respaldo LemWriter Local',
        text: `Respaldo de mis proyectos (${ultimoZip})`,
        url: uri.uri,
      })
    } catch {
      /* el usuario canceló */
    }
  }

  const pedirRestaurar = () => {
    if (confirmando) {
      setConfirmando(false)
      if (temporizador.current) clearTimeout(temporizador.current)
      inputRef.current?.click()
      return
    }
    setConfirmando(true)
    temporizador.current = setTimeout(() => setConfirmando(false), 6000)
  }

  const restaurar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setOcupado(true)
    informar('')
    try {
      const n = await restaurarRespaldoZip(fsCapacitor, carpetaRaizGuardada(), archivo)
      informar(`✅ Restaurados ${n} archivos. Reiniciando la app…`)
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      informar(`❌ No se pudo restaurar: ${err?.message ?? err}`, true)
    } finally {
      setOcupado(false)
    }
  }

  const estiloBoton: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #C9A24A',
    background: 'rgba(201, 162, 74, 0.15)',
    color: '#DFBE72',
    fontWeight: 700,
    fontSize: '13px',
    cursor: ocupado ? 'default' : 'pointer',
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
        💾 Respaldo ZIP de las carpetas
      </div>
      <div style={{ color: '#BDC7CC', fontSize: '13px', marginBottom: '10px', lineHeight: 1.45 }}>
        Guarda todo <strong style={{ color: '#F5F1E8' }}>Documentos/{carpetaRaizGuardada()}</strong> en
        un solo archivo ZIP, o restaura uno anterior (sus archivos sobrescriben los actuales).
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button type="button" onClick={crearRespaldo} disabled={ocupado} style={estiloBoton}>
          {ocupado ? 'Trabajando…' : '📦 Crear respaldo ZIP'}
        </button>
        <button type="button" onClick={pedirRestaurar} disabled={ocupado} style={estiloBoton}>
          {confirmando ? '⚠️ Toca de nuevo para confirmar' : '♻️ Restaurar desde ZIP'}
        </button>
        {ultimoZip && (
          <button type="button" onClick={compartirRespaldo} disabled={ocupado} style={estiloBoton}>
            📤 Compartir
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={restaurar}
        style={{ display: 'none' }}
      />

      {mensaje && (
        <div
          style={{
            marginTop: '10px',
            fontSize: '13px',
            color: esError ? '#E5484D' : '#4AE098',
            lineHeight: 1.4,
          }}
        >
          {mensaje}
        </div>
      )}
    </div>
  )
}
