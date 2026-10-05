import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  VersionBiblia,
  VERSIONES_BIBLIA,
  ResultadoBusqueda,
  librosDe,
  nombreLibro,
  totalCapitulos,
  obtenerCapitulo,
  etiquetaReferencia,
  parsearReferencia,
  buscarTexto,
} from '../biblia/bibliaService'

export interface CitaBiblica {
  referencia: string
  texto: string
  html: string
  versionCorta: string
}

interface BibliaModalProps {
  onClose: () => void
  /** Si se pasa, muestra el botón «Insertar en el escrito» (modo editor). Sin él, solo copiar. */
  onInsertar?: (cita: CitaBiblica) => void
}

type Panel = 'lectura' | 'libros' | 'capitulos' | 'resultados'

const CLAVE_ESTADO = 'lw_biblia_estado'

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

interface EstadoGuardado {
  version: VersionBiblia
  codigo: string
  capitulo: number
}

function leerEstadoGuardado(): EstadoGuardado {
  try {
    const crudo = localStorage.getItem(CLAVE_ESTADO)
    if (crudo) {
      const datos = JSON.parse(crudo)
      const version: VersionBiblia = datos.version === 'vbl' ? 'vbl' : 'rv1909'
      const metas = librosDe(version)
      if (metas.some((m) => m.codigo === datos.codigo)) {
        const capMax = totalCapitulos(version, datos.codigo)
        const capitulo = Math.min(Math.max(1, datos.capitulo | 0 || 1), capMax)
        return { version, codigo: datos.codigo, capitulo }
      }
    }
  } catch {
    /* estado no válido: se usa el inicio */
  }
  return { version: 'rv1909', codigo: 'GEN', capitulo: 1 }
}

export const BibliaModal: React.FC<BibliaModalProps> = ({ onClose, onInsertar }) => {
  const [inicial] = useState<EstadoGuardado>(leerEstadoGuardado)
  const [version, setVersion] = useState<VersionBiblia>(inicial.version)
  const [codigo, setCodigo] = useState<string>(inicial.codigo)
  const [capitulo, setCapitulo] = useState<number>(inicial.capitulo)
  const [versiculos, setVersiculos] = useState<string[]>([])
  const [cargando, setCargando] = useState<boolean>(true)
  const [errorCarga, setErrorCarga] = useState<string>('')
  const [seleccion, setSeleccion] = useState<number[]>([])
  const [resaltado, setResaltado] = useState<number | null>(null)
  const [panel, setPanel] = useState<Panel>('lectura')
  const [testamento, setTestamento] = useState<'AT' | 'NT'>('AT')
  const [consulta, setConsulta] = useState<string>('')
  const [buscando, setBuscando] = useState<boolean>(false)
  const [progreso, setProgreso] = useState<string>('')
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([])
  const [busquedaCompleta, setBusquedaCompleta] = useState<boolean>(true)
  const [consultaBuscada, setConsultaBuscada] = useState<string>('')
  const [aviso, setAviso] = useState<string>('')

  const refsVersiculos = useRef<Map<number, HTMLDivElement | null>>(new Map())

  const nombreActual = useMemo(() => nombreLibro(version, codigo), [version, codigo])
  const numCapitulos = useMemo(() => totalCapitulos(version, codigo), [version, codigo])
  const versionCorta = VERSIONES_BIBLIA.find((v) => v.id === version)?.corta || version.toUpperCase()

  // Cargar el capítulo al cambiar libro / capítulo / versión
  useEffect(() => {
    let activo = true
    setCargando(true)
    setErrorCarga('')
    obtenerCapitulo(version, codigo, capitulo)
      .then((versos) => {
        if (!activo) return
        setVersiculos(versos)
        setCargando(false)
      })
      .catch(() => {
        if (!activo) return
        setVersiculos([])
        setCargando(false)
        setErrorCarga('No se pudo cargar este capítulo. Revisa que los datos de la Biblia estén instalados.')
      })
    return () => {
      activo = false
    }
  }, [version, codigo, capitulo])

  // Recordar la última posición de lectura
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ version, codigo, capitulo }))
    } catch {
      /* almacenamiento no disponible */
    }
  }, [version, codigo, capitulo])

  // Llevar a la vista el versículo resaltado (al saltar desde una búsqueda o referencia)
  useEffect(() => {
    if (panel !== 'lectura' || cargando || resaltado === null) return
    const nodo = refsVersiculos.current.get(resaltado)
    if (nodo) {
      const t = setTimeout(() => nodo.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80)
      return () => clearTimeout(t)
    }
  }, [panel, cargando, resaltado, versiculos])

  const irA = useCallback((nuevoCodigo: string, nuevoCapitulo: number, versiculo?: number) => {
    setCodigo(nuevoCodigo)
    setCapitulo(nuevoCapitulo)
    setPanel('lectura')
    if (versiculo) {
      setSeleccion([versiculo])
      setResaltado(versiculo)
    } else {
      setSeleccion([])
      setResaltado(null)
    }
  }, [])

  const cambiarCapitulo = (delta: number) => {
    const siguiente = Math.min(Math.max(1, capitulo + delta), numCapitulos)
    if (siguiente !== capitulo) {
      setCapitulo(siguiente)
      setSeleccion([])
      setResaltado(null)
    }
  }

  const elegirLibro = (nuevoCodigo: string) => {
    irA(nuevoCodigo, 1)
    const meta = librosDe(version).find((m) => m.codigo === nuevoCodigo)
    if (meta) setTestamento(meta.testamento)
  }

  const toggleVersiculo = (numero: number) => {
    setResaltado(null)
    setSeleccion((prev) => {
      const ordenada = prev.includes(numero)
        ? prev.filter((n) => n !== numero)
        : [...prev, numero].sort((a, b) => a - b)
      return ordenada
    })
  }

  const citaSeleccionada = useCallback((): CitaBiblica | null => {
    if (seleccion.length === 0 || versiculos.length === 0) return null
    const desde = seleccion[0]
    const hasta = seleccion[seleccion.length - 1]
    const texto = seleccion.map((n) => versiculos[n - 1] || '').filter(Boolean).join(' ')
    if (!texto) return null
    const referencia = etiquetaReferencia(version, codigo, capitulo, desde, hasta)
    const html =
      `<blockquote data-callout-type="biblia">` +
      `<p>${escaparHtml(texto)}</p>` +
      `<p><strong>${escaparHtml(referencia)} (${versionCorta})</strong></p>` +
      `</blockquote><p></p>`
    return { referencia, texto, html, versionCorta }
  }, [seleccion, versiculos, version, codigo, capitulo, versionCorta])

  const copiarCita = async () => {
    const cita = citaSeleccionada()
    if (!cita) return
    const textoPlano = `«${cita.texto}» — ${cita.referencia} (${cita.versionCorta})`
    try {
      await navigator.clipboard.writeText(textoPlano)
      setAviso('✓ Cita copiada')
    } catch {
      const area = document.createElement('textarea')
      area.value = textoPlano
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
      setAviso('✓ Cita copiada')
    }
    setTimeout(() => setAviso(''), 2500)
  }

  const insertarCita = () => {
    const cita = citaSeleccionada()
    if (!cita || !onInsertar) return
    onInsertar(cita)
    onClose()
  }

  const ejecutarBusqueda = async () => {
    const texto = consulta.trim()
    if (!texto || buscando) return
    // 1) ¿Es una referencia tipo «Juan 3:16»?
    const ref = parsearReferencia(texto)
    if (ref) {
      const capMax = totalCapitulos(version, ref.codigo)
      const cap = Math.min(Math.max(1, ref.capitulo), capMax)
      irA(ref.codigo, cap, ref.versiculo)
      return
    }
    // 2) Búsqueda de texto en toda la Biblia (offline)
    setBuscando(true)
    setResultados([])
    setProgreso('Buscando en Génesis…')
    try {
      const { resultados: encontrados, completa } = await buscarTexto(version, texto, (revisados, total) => {
        const meta = librosDe(version)[Math.min(revisados, total - 1)]
        setProgreso(`Buscando… ${meta ? meta.nombre : ''} (${revisados}/${total})`)
      })
      setResultados(encontrados)
      setBusquedaCompleta(completa)
      setConsultaBuscada(texto)
      setPanel('resultados')
    } catch {
      setAviso('La búsqueda falló. Inténtalo de nuevo.')
      setTimeout(() => setAviso(''), 2500)
    } finally {
      setBuscando(false)
      setProgreso('')
    }
  }

  const cita = citaSeleccionada()

  const estiloPill = (activo: boolean): React.CSSProperties => ({
    height: '28px',
    padding: '0 12px',
    borderRadius: '999px',
    border: activo ? '1px solid #C9A24A' : '1px solid rgba(155, 176, 189, 0.35)',
    background: activo ? 'rgba(201, 162, 74, 0.25)' : 'rgba(18, 40, 52, 0.6)',
    color: activo ? '#DFBE72' : '#9BB0BD',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: "'Cinzel', serif",
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  const estiloBotonNav: React.CSSProperties = {
    height: '34px',
    padding: '0 10px',
    borderRadius: '8px',
    border: '1px solid rgba(201, 162, 74, 0.45)',
    background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.18) 0%, rgba(20, 43, 55, 0.95) 100%)',
    color: '#DFBE72',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: "'Cinzel', serif",
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(5, 12, 17, 0.88)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '880px',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, #1A3A4A 0%, #122834 100%)',
          borderLeft: '1px solid rgba(201, 162, 74, 0.35)',
          borderRight: '1px solid rgba(201, 162, 74, 0.35)',
          boxShadow: '0 0 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: 'max(10px, env(safe-area-inset-top, 10px)) 12px 10px',
            borderBottom: '1px solid rgba(201, 162, 74, 0.3)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '18px' }}>📖</span>
          <span
            style={{
              color: '#C9A24A',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: '17px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              flex: 1,
            }}
          >
            Biblia
          </span>
          {VERSIONES_BIBLIA.map((v) => (
            <button
              key={v.id}
              style={estiloPill(version === v.id)}
              onClick={() => {
                setVersion(v.id)
                setSeleccion([])
                setResaltado(null)
              }}
              title={v.nombre}
            >
              {v.corta}
            </button>
          ))}
          <button
            onClick={onClose}
            aria-label="Cerrar Biblia"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '1px solid rgba(155, 176, 189, 0.4)',
              background: 'transparent',
              color: '#E8EEF2',
              fontSize: '15px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Navegación libro / capítulo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderBottom: '1px solid rgba(201, 162, 74, 0.18)',
            flexShrink: 0,
          }}
        >
          <button style={{ ...estiloBotonNav, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => setPanel(panel === 'libros' ? 'lectura' : 'libros')}>
            {nombreActual} ▾
          </button>
          <button style={estiloBotonNav} onClick={() => cambiarCapitulo(-1)} disabled={capitulo <= 1} aria-label="Capítulo anterior">
            ‹
          </button>
          <button style={{ ...estiloBotonNav, minWidth: '74px' }} onClick={() => setPanel(panel === 'capitulos' ? 'lectura' : 'capitulos')}>
            Cap. {capitulo} ▾
          </button>
          <button style={estiloBotonNav} onClick={() => cambiarCapitulo(1)} disabled={capitulo >= numCapitulos} aria-label="Capítulo siguiente">
            ›
          </button>
        </div>

        {/* Buscador */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '8px 12px',
            borderBottom: '1px solid rgba(201, 162, 74, 0.18)',
            flexShrink: 0,
          }}
        >
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ejecutarBusqueda()
            }}
            placeholder="Buscar palabra o ir a «Juan 3:16»…"
            style={{
              flex: 1,
              height: '36px',
              borderRadius: '8px',
              border: '1px solid rgba(155, 176, 189, 0.35)',
              background: 'rgba(10, 24, 33, 0.8)',
              color: '#E8EEF2',
              padding: '0 10px',
              fontSize: '14px',
              fontFamily: "'Inter', sans-serif",
              outline: 'none',
              minWidth: 0,
            }}
          />
          <button style={{ ...estiloBotonNav, height: '36px' }} onClick={ejecutarBusqueda} disabled={buscando}>
            {buscando ? '…' : 'Ir / Buscar'}
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {panel === 'libros' && (
            <div style={{ padding: '12px' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <button style={estiloPill(testamento === 'AT')} onClick={() => setTestamento('AT')}>
                  Antiguo Testamento
                </button>
                <button style={estiloPill(testamento === 'NT')} onClick={() => setTestamento('NT')}>
                  Nuevo Testamento
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px' }}>
                {librosDe(version)
                  .filter((m) => m.testamento === testamento)
                  .map((m) => (
                    <button
                      key={m.codigo}
                      onClick={() => elegirLibro(m.codigo)}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        textAlign: 'left',
                        border: m.codigo === codigo ? '1px solid #C9A24A' : '1px solid rgba(155, 176, 189, 0.25)',
                        background: m.codigo === codigo ? 'rgba(201, 162, 74, 0.18)' : 'rgba(18, 40, 52, 0.55)',
                        color: m.codigo === codigo ? '#DFBE72' : '#D7E3EA',
                        fontSize: '13px',
                        fontFamily: "'Inter', sans-serif",
                        cursor: 'pointer',
                      }}
                    >
                      {m.nombre}
                      <span style={{ display: 'block', fontSize: '10px', color: '#9BB0BD', marginTop: '2px' }}>
                        {m.capitulos} cap.
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {panel === 'capitulos' && (
            <div style={{ padding: '12px' }}>
              <div style={{ color: '#DFBE72', fontFamily: "'Cinzel', serif", fontSize: '13px', marginBottom: '10px' }}>
                {nombreActual} — elige el capítulo
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: '6px' }}>
                {Array.from({ length: numCapitulos }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setCapitulo(n)
                      setSeleccion([])
                      setResaltado(null)
                      setPanel('lectura')
                    }}
                    style={{
                      height: '40px',
                      borderRadius: '8px',
                      border: n === capitulo ? '1px solid #C9A24A' : '1px solid rgba(155, 176, 189, 0.25)',
                      background: n === capitulo ? 'rgba(201, 162, 74, 0.2)' : 'rgba(18, 40, 52, 0.55)',
                      color: n === capitulo ? '#DFBE72' : '#D7E3EA',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {panel === 'resultados' && (
            <div style={{ padding: '12px' }}>
              <div style={{ color: '#9BB0BD', fontSize: '12px', fontFamily: "'Inter', sans-serif", marginBottom: '10px' }}>
                {resultados.length === 0
                  ? `Sin resultados para «${consultaBuscada}» en ${versionCorta}.`
                  : `${resultados.length}${busquedaCompleta ? '' : '+'} resultado(s) para «${consultaBuscada}» en ${versionCorta}${busquedaCompleta ? '' : ' (se muestran los primeros 200)'}. Toca uno para leerlo en contexto.`}
              </div>
              {resultados.map((r, i) => (
                <button
                  key={`${r.codigo}-${r.capitulo}-${r.versiculo}-${i}`}
                  onClick={() => irA(r.codigo, r.capitulo, r.versiculo)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px',
                    marginBottom: '6px',
                    borderRadius: '8px',
                    border: '1px solid rgba(155, 176, 189, 0.22)',
                    background: 'rgba(18, 40, 52, 0.55)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: '#DFBE72', fontWeight: 700, fontSize: '12px', fontFamily: "'Cinzel', serif" }}>
                    {r.nombre} {r.capitulo}:{r.versiculo}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      color: '#D7E3EA',
                      fontSize: '13.5px',
                      lineHeight: 1.45,
                      fontFamily: "'Crimson Pro', Georgia, serif",
                      marginTop: '3px',
                    }}
                  >
                    {r.texto}
                  </span>
                </button>
              ))}
              <button style={{ ...estiloBotonNav, marginTop: '6px' }} onClick={() => setPanel('lectura')}>
                ← Volver a la lectura
              </button>
            </div>
          )}

          {panel === 'lectura' && (
            <div style={{ padding: '14px 16px 20px' }}>
              <div
                style={{
                  color: '#C9A24A',
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: '15px',
                  fontWeight: 700,
                  textAlign: 'center',
                  marginBottom: '12px',
                }}
              >
                {nombreActual} {capitulo}
                <span style={{ display: 'block', fontSize: '10px', color: '#9BB0BD', fontFamily: "'Inter', sans-serif", fontWeight: 400, marginTop: '2px' }}>
                  {VERSIONES_BIBLIA.find((v) => v.id === version)?.nombre} · Toca los versículos que quieras citar
                </span>
              </div>
              {cargando && <div style={{ color: '#9BB0BD', textAlign: 'center', padding: '24px', fontFamily: "'Inter', sans-serif", fontSize: '13px' }}>Cargando…</div>}
              {errorCarga && <div style={{ color: '#F2A0A0', textAlign: 'center', padding: '24px', fontFamily: "'Inter', sans-serif", fontSize: '13px' }}>{errorCarga}</div>}
              {!cargando &&
                !errorCarga &&
                versiculos.map((texto, i) => {
                  const numero = i + 1
                  const seleccionado = seleccion.includes(numero)
                  const destacado = resaltado === numero
                  return (
                    <div
                      key={numero}
                      ref={(el) => {
                        refsVersiculos.current.set(numero, el)
                      }}
                      onClick={() => toggleVersiculo(numero)}
                      style={{
                        padding: '5px 8px',
                        margin: '0 -8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: seleccionado
                          ? 'rgba(201, 162, 74, 0.20)'
                          : destacado
                            ? 'rgba(74, 224, 152, 0.15)'
                            : 'transparent',
                        borderLeft: seleccionado ? '3px solid #C9A24A' : '3px solid transparent',
                        color: '#EDF3F7',
                        fontFamily: "'Crimson Pro', Georgia, serif",
                        fontSize: '17.5px',
                        lineHeight: 1.55,
                      }}
                    >
                      <sup style={{ color: '#C9A24A', fontSize: '11px', fontWeight: 700, marginRight: '5px', fontFamily: "'Inter', sans-serif" }}>
                        {numero}
                      </sup>
                      {texto}
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        {/* Pie: cita seleccionada */}
        <div
          style={{
            borderTop: '1px solid rgba(201, 162, 74, 0.3)',
            padding: '10px 12px max(10px, env(safe-area-inset-bottom, 10px))',
            background: 'rgba(10, 24, 33, 0.85)',
            flexShrink: 0,
          }}
        >
          {buscando && (
            <div style={{ color: '#9BB0BD', fontSize: '12px', fontFamily: "'Inter', sans-serif", marginBottom: '6px' }}>{progreso || 'Buscando…'}</div>
          )}
          {aviso && (
            <div style={{ color: '#4AE098', fontSize: '12px', fontWeight: 700, fontFamily: "'Inter', sans-serif", marginBottom: '6px' }}>{aviso}</div>
          )}
          {cita ? (
            <div>
              <div style={{ color: '#DFBE72', fontSize: '12px', fontWeight: 700, fontFamily: "'Cinzel', serif", marginBottom: '4px' }}>
                {cita.referencia} ({cita.versionCorta})
              </div>
              <div
                style={{
                  color: '#D7E3EA',
                  fontSize: '13px',
                  fontFamily: "'Crimson Pro', Georgia, serif",
                  lineHeight: 1.4,
                  maxHeight: '54px',
                  overflow: 'hidden',
                  marginBottom: '8px',
                }}
              >
                «{cita.texto}»
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={{ ...estiloBotonNav, flex: 1, height: '38px' }} onClick={copiarCita}>
                  📋 Copiar
                </button>
                {onInsertar && (
                  <button
                    style={{
                      ...estiloBotonNav,
                      flex: 1.4,
                      height: '38px',
                      background: 'linear-gradient(135deg, rgba(201, 162, 74, 0.45) 0%, rgba(160, 124, 44, 0.85) 100%)',
                      color: '#122834',
                    }}
                    onClick={insertarCita}
                  >
                    ✍️ Insertar en el escrito
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: '#9BB0BD', fontSize: '12px', fontFamily: "'Inter', sans-serif", textAlign: 'center' }}>
              Lee, busca por palabra o salta a una referencia — todo sin conexión.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BibliaModal
