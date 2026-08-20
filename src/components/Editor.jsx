import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function Editor({ proyecto, onBack }) {
  const [secciones, setSecciones] = useState([])
  const [seccionActiva, setSeccionActiva] = useState(null)
  const [contenido, setContenido] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [dictando, setDictando] = useState(false)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const recognitionRef = useRef(null)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const autoSaveRef = useRef(null)

  useEffect(() => {
    cargarSecciones()
  }, [proyecto])

  async function cargarSecciones() {
    const { data } = await supabase
      .from('lw_secciones')
      .select('*')
      .eq('project_id', proyecto.id)
      .order('order_index')
    setSecciones(data || [])
    if (data?.length > 0) seleccionarSeccion(data[0])
  }

  function seleccionarSeccion(sec) {
    setSeccionActiva(sec)
    setContenido(sec.content || '')
  }

  function handleContenidoChange(valor) {
    setContenido(valor)
    clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => guardar(valor), 2000)
  }

  async function guardar(texto = contenido) {
    if (!seccionActiva) return
    setGuardando(true)
    await supabase
      .from('lw_secciones')
      .update({ content: texto, updated_at: new Date().toISOString() })
      .eq('id', seccionActiva.id)
    setGuardando(false)
  }

  // Web Speech API — dictado en tiempo real
  function toggleDictado() {
    if (dictando) {
      recognitionRef.current?.stop()
      setDictando(false)
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { alert('Tu navegador no soporta dictado'); return }
    const rec = new SpeechRecognition()
    rec.lang = 'es-MX'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = e => {
      const texto = Array.from(e.results)
        .map(r => r[0].transcript).join(' ')
      const nuevo = contenido + ' ' + texto
      setContenido(nuevo)
      handleContenidoChange(nuevo)
    }
    rec.onerror = () => setDictando(false)
    rec.onend = () => setDictando(false)
    rec.start()
    recognitionRef.current = rec
    setDictando(true)
  }

  // Puter.js — transcribir audio grabado
  async function grabarYTranscribir() {
    if (transcribiendo) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      chunksRef.current = []
      mediaRecorder.ondataavailable = e => chunksRef.current.push(e.data)
      mediaRecorder.onstop = async () => {
        setTranscribiendo(true)
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], 'audio.webm', { type: 'audio/webm' })
        try {
          const result = await window.puter.ai.speech2txt({ file, language: 'es' })
          const nuevo = contenido + '\n' + result.text
          setContenido(nuevo)
          handleContenidoChange(nuevo)
        } catch (err) {
          alert('Error al transcribir: ' + err.message)
        }
        setTranscribiendo(false)
        mediaRef.current = null
      }
      mediaRef.current = mediaRecorder
      mediaRecorder.start()
      setTimeout(() => mediaRecorder.stop(), 60000) // máx 60 seg
      alert('Grabando... Habla ahora. Se detendrá automáticamente en 60 segundos o cierra el navegador para detener.')
    } catch (err) {
      alert('Error al acceder al micrófono: ' + err.message)
    }
  }

  function detenerGrabacion() {
    mediaRef.current?.stop()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1A1610' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: '#2A2418',
        borderBottom: '1px solid #C9A24A', display: 'flex', alignItems: 'center', gap: 12
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: '#C9A24A', fontSize: 20, cursor: 'pointer'
        }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#F5F1E8', fontWeight: 'bold', fontSize: '14px' }}>{proyecto.titulo}</div>
          <div style={{ color: '#888', fontSize: '11px' }}>{guardando ? 'Guardando...' : 'Guardado'}</div>
        </div>
      </div>

      {/* Secciones */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 12px',
        overflowX: 'auto', background: '#1A1610', borderBottom: '1px solid #333'
      }}>
        {secciones.map(s => (
          <button key={s.id} onClick={() => seleccionarSeccion(s)}
            style={{
              padding: '6px 12px', borderRadius: '16px', border: 'none',
              background: seccionActiva?.id === s.id ? '#C9A24A' : '#2A2418',
              color: seccionActiva?.id === s.id ? '#1A1610' : '#888',
              fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap'
            }}>
            {s.title || 'Sección'}
          </button>
        ))}
      </div>

      {/* Editor */}
      <textarea
        value={contenido}
        onChange={e => handleContenidoChange(e.target.value)}
        placeholder="Escribe o dicta tu contenido aquí..."
        style={{
          flex: 1, padding: '16px', background: '#1A1610',
          border: 'none', color: '#F5F1E8', fontSize: '16px',
          lineHeight: '1.6', resize: 'none', outline: 'none',
          fontFamily: 'Georgia, serif'
        }}
      />

      {/* Botones de audio */}
      <div style={{
        padding: '12px 16px', background: '#2A2418',
        borderTop: '1px solid #333', display: 'flex', gap: 12
      }}>
        <button onClick={toggleDictado} style={{
          flex: 1, padding: '14px', borderRadius: '8px', border: 'none',
          background: dictando ? '#ff4444' : '#C9A24A',
          color: '#1A1610', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer'
        }}>
          {dictando ? '⏹ Detener dictado' : '🎤 Dictar'}
        </button>
        <button onClick={mediaRef.current ? detenerGrabacion : grabarYTranscribir}
          disabled={transcribiendo}
          style={{
            flex: 1, padding: '14px', borderRadius: '8px', border: 'none',
            background: transcribiendo ? '#666' : '#3A5A4A',
            color: '#F5F1E8', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer'
          }}>
          {transcribiendo ? '⏳ Transcribiendo...' : mediaRef.current ? '⏹ Detener' : '🎙 Grabar audio'}
        </button>
      </div>
    </div>
  )
}
