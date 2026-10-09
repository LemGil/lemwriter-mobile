import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  VersionBiblia,
  VERSIONES_BIBLIA,
  LibroMeta,
  librosDe,
  nombreLibro,
  totalCapitulos,
  obtenerCapitulo,
  etiquetaReferencia,
  parsearReferencia,
} from '../biblia/bibliaService'
import { cargarLeidos, alternarLeido, conteoPorLibro, claveCapitulo, reiniciarLeidos, sincronizarLeidosDesdeNube, respaldarCambioEnNube, borrarProgresoEnNube } from '../biblia/progresoLectura'

// Vista de LECTURA bíblica (pestaña Biblia). Pensada para leer la Biblia seguida,
// marcar capítulos como leídos y ver el avance — no como buscador (eso queda en el
// modal del editor, con «Insertar en el escrito»). Lee y escribe la misma posición
// guardada que el modal (clave lw_biblia_estado) para continuar donde ibas.

type Pantalla = 'inicio' | 'capitulos' | 'leyendo'

const CLAVE_ESTADO = 'lw_biblia_estado'

// Modo Leer: pantalla completa para leer seguido, con tamaño de letra y temas.
// Las preferencias se guardan en el dispositivo y se recuerdan entre sesiones.
type TemaLectura = 'noche' | 'dia' | 'sepia'
const CLAVE_TEMA_LECTURA = 'lw_biblia_tema_lectura'
const CLAVE_LETRA = 'lw_biblia_letra'
const LETRA_MIN = 15
const LETRA_MAX = 32
const TEMAS_LECTURA: Record<TemaLectura, { fondo: string; texto: string; suave: string; acento: string; borde: string }> = {
  noche: { fondo: '#101E29', texto: '#EDF3F7', suave: '#9BB0BD', acento: '#DFBE72', borde: 'rgba(201, 162, 74, 0.35)' },
  dia: { fondo: '#F7F3EA', texto: '#26333D', suave: '#7A6A4F', acento: '#9A7B2D', borde: 'rgba(154, 123, 45, 0.45)' },
  sepia: { fondo: '#EAE1D0', texto: '#4A3B28', suave: '#8A7350', acento: '#8A6D2F', borde: 'rgba(138, 109, 47, 0.45)' },
}

function posicionGuardada(version: VersionBiblia): { codigo: string; capitulo: number } {
  try {
    const crudo = localStorage.getItem(CLAVE_ESTADO)
    if (crudo) {
      const datos = JSON.parse(crudo)
      if (librosDe(version).some((m) => m.codigo === datos.codigo)) {
        const max = totalCapitulos(version, datos.codigo)
        return { codigo: datos.codigo, capitulo: Math.min(Math.max(1, datos.capitulo | 0 || 1), max) }
      }
    }
  } catch {
    /* sin posición guardada */
  }
  return { codigo: 'GEN', capitulo: 1 }
}

export const BibliaVista: React.FC = () => {
  const [version, setVersion] = useState<VersionBiblia>(() => {
    try {
      const crudo = localStorage.getItem(CLAVE_ESTADO)
      if (crudo) {
        const datos = JSON.parse(crudo)
        return datos.version === 'vbl' ? 'vbl' : 'rv1909'
      }
    } catch {
      /* valor por defecto */
    }
    return 'rv1909'
  })
  const [pantalla, setPantalla] = useState<Pantalla>('inicio')
  const [codigo, setCodigo] = useState<string>(() => posicionGuardada('rv1909').codigo)
  const [capitulo, setCapitulo] = useState<number>(() => posicionGuardada('rv1909').capitulo)
  const [versiculos, setVersiculos] = useState<string[]>([])
  const [cargando, setCargando] = useState<boolean>(false)
  const [errorCarga, setErrorCarga] = useState<string>('')
  const [leidos, setLeidos] = useState<Set<string>>(() => cargarLeidos())

  // Al abrir la Biblia: unir las marcas locales con las de la cuenta, para
  // continuar la lectura en cualquier teléfono con la misma sesión.
  useEffect(() => {
    let vivo = true
    sincronizarLeidosDesdeNube()
      .then((unidos) => {
        if (vivo) setLeidos(unidos)
      })
      .catch(() => {
        /* sin nube disponible: se quedan las marcas locales */
      })
    return () => {
      vivo = false
    }
  }, [])
  const [testamento, setTestamento] = useState<'AT' | 'NT'>('AT')
  const [seleccion, setSeleccion] = useState<number[]>([])
  const [aviso, setAviso] = useState<string>('')
  const [salto, setSalto] = useState<string>('')
  const [confirmandoReinicio, setConfirmandoReinicio] = useState<boolean>(false)
  const [modoLeer, setModoLeer] = useState<boolean>(false)
  const [temaLectura, setTemaLectura] = useState<TemaLectura>(() => {
    try {
      const t = localStorage.getItem(CLAVE_TEMA_LECTURA)
      return t === 'dia' || t === 'sepia' ? t : 'noche'
    } catch {
      return 'noche'
    }
  })
  const [letra, setLetra] = useState<number>(() => {
    try {
      const n = parseInt(localStorage.getItem(CLAVE_LETRA) || '', 10)
      return Number.isFinite(n) ? Math.min(LETRA_MAX, Math.max(LETRA_MIN, n)) : 19
    } catch {
      return 19
    }
  })
  const leerRef = useRef<HTMLDivElement>(null)

  const metas = useMemo(() => librosDe(version), [version])
  const nombreActual = useMemo(() => nombreLibro(version, codigo), [version, codigo])
  const numCapitulos = useMemo(() => totalCapitulos(version, codigo), [version, codigo])
  const versionCorta = VERSIONES_BIBLIA.find((v) => v.id === version)?.corta || version.toUpperCase()
  const totalBiblia = useMemo(() => metas.reduce((acc, m) => acc + m.capitulos, 0), [metas])
  const porLibro = useMemo(() => conteoPorLibro(leidos), [leidos])
  const totalLeidos = leidos.size
  const porcentaje = totalBiblia > 0 ? Math.round((totalLeidos / totalBiblia) * 100) : 0
  const capituloLeido = leidos.has(claveCapitulo(codigo, capitulo))

  // Cargar el capítulo al entrar a leer
  useEffect(() => {
    if (pantalla !== 'leyendo') return
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
        setErrorCarga('No se pudo cargar este capítulo.')
      })
    return () => {
      activo = false
    }
  }, [pantalla, version, codigo, capitulo])

  // Guardar posición (compartida con el modal del editor) y subir al inicio del capítulo
  useEffect(() => {
    if (pantalla !== 'leyendo') return
    try {
      localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ version, codigo, capitulo }))
    } catch {
      /* almacenamiento no disponible */
    }
    window.scrollTo({ top: 0 })
  }, [pantalla, version, codigo, capitulo])

  // Recordar tema y tamaño de letra del modo Leer
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_TEMA_LECTURA, temaLectura)
    } catch {
      /* almacenamiento no disponible */
    }
  }, [temaLectura])

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_LETRA, String(letra))
    } catch {
      /* almacenamiento no disponible */
    }
  }, [letra])

  // En modo Leer, cada capítulo nuevo empieza arriba
  useEffect(() => {
    const cont = leerRef.current
    if (modoLeer && cont && typeof cont.scrollTo === 'function') cont.scrollTo({ top: 0 })
  }, [modoLeer, codigo, capitulo])

  const abrirLibro = (nuevoCodigo: string) => {
    setCodigo(nuevoCodigo)
    setPantalla('capitulos')
  }

  const leerCapitulo = (nuevoCodigo: string, nuevoCapitulo: number) => {
    setCodigo(nuevoCodigo)
    setCapitulo(nuevoCapitulo)
    setSeleccion([])
    setPantalla('leyendo')
  }

  const destinoSiguiente = (): { codigo: string; capitulo: number } | null => {
    if (capitulo < numCapitulos) return { codigo, capitulo: capitulo + 1 }
    const idx = metas.findIndex((m) => m.codigo === codigo)
    const siguiente = metas[idx + 1]
    return siguiente ? { codigo: siguiente.codigo, capitulo: 1 } : null
  }

  const destinoAnterior = (): { codigo: string; capitulo: number } | null => {
    if (capitulo > 1) return { codigo, capitulo: capitulo - 1 }
    const idx = metas.findIndex((m) => m.codigo === codigo)
    const anterior = metas[idx - 1]
    return anterior ? { codigo: anterior.codigo, capitulo: anterior.capitulos } : null
  }

  const marcarLeido = (nuevoEstado: boolean) => {
    const yaLeido = leidos.has(claveCapitulo(codigo, capitulo))
    if (yaLeido !== nuevoEstado) {
      setLeidos(alternarLeido(leidos, codigo, capitulo))
      void respaldarCambioEnNube(claveCapitulo(codigo, capitulo), nuevoEstado)
    }
  }

  const marcarYContinuar = () => {
    marcarLeido(true)
    const sig = destinoSiguiente()
    if (sig) {
      leerCapitulo(sig.codigo, sig.capitulo)
    } else {
      setPantalla('capitulos')
      setAviso('🎉 ¡Terminaste la Biblia! Dios te bendiga.')
      setTimeout(() => setAviso(''), 4000)
    }
  }

  const toggleVersiculo = (numero: number) => {
    setSeleccion((prev) => (prev.includes(numero) ? prev.filter((n) => n !== numero) : [...prev, numero].sort((a, b) => a - b)))
  }

  const copiarSeleccion = async () => {
    if (seleccion.length === 0 || versiculos.length === 0) return
    const desde = seleccion[0]
    const hasta = seleccion[seleccion.length - 1]
    const texto = seleccion.map((n) => versiculos[n - 1] || '').filter(Boolean).join(' ')
    const referencia = etiquetaReferencia(version, codigo, capitulo, desde, hasta)
    const plano = `«${texto}» — ${referencia} (${versionCorta})`
    try {
      await navigator.clipboard.writeText(plano)
    } catch {
      const area = document.createElement('textarea')
      area.value = plano
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setAviso('✓ Cita copiada')
    setTimeout(() => setAviso(''), 2500)
  }

  const ejecutarSalto = () => {
    const ref = parsearReferencia(salto.trim())
    if (!ref) {
      setAviso('Escribe una referencia, p. ej. «Juan 3» o «Salmos 23:1»')
      setTimeout(() => setAviso(''), 3000)
      return
    }
    const capMax = totalCapitulos(version, ref.codigo)
    leerCapitulo(ref.codigo, Math.min(Math.max(1, ref.capitulo), capMax))
    setSalto('')
  }

  // Borra las marcas de leídos y vuelve a Génesis 1 para leer la Biblia otra vez.
  const reiniciarLectura = () => {
    setLeidos(reiniciarLeidos())
    void borrarProgresoEnNube()
    setCodigo('GEN')
    setCapitulo(1)
    try {
      localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ version, codigo: 'GEN', capitulo: 1 }))
    } catch {
      /* almacenamiento no disponible */
    }
    setConfirmandoReinicio(false)
    setAviso('📖 Lectura reiniciada: marcas borradas. ¡A empezar de nuevo!')
    setTimeout(() => setAviso(''), 3500)
  }

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

  const estiloBoton: React.CSSProperties = {
    height: '36px',
    padding: '0 12px',
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

  const tarjetaLibro = (meta: LibroMeta) => {
    const leidosLibro = porLibro.get(meta.codigo) || 0
    const completo = leidosLibro >= meta.capitulos
    const pct = meta.capitulos > 0 ? Math.round((leidosLibro / meta.capitulos) * 100) : 0
    return (
      <button
        key={meta.codigo}
        onClick={() => abrirLibro(meta.codigo)}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '11px 12px',
          marginBottom: '7px',
          borderRadius: '10px',
          border: completo ? '1px solid rgba(74, 224, 152, 0.5)' : '1px solid rgba(201, 162, 74, 0.22)',
          background: 'rgba(18, 40, 52, 0.55)',
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ color: '#EDF3F7', fontSize: '15px', fontFamily: "'Crimson Pro', Georgia, serif", fontWeight: 600 }}>
            {completo ? '✓ ' : ''}{meta.nombre}
          </span>
          <span style={{ color: leidosLibro > 0 ? '#4AE098' : '#8E9EA7', fontSize: '11px', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>
            {leidosLibro}/{meta.capitulos} cap.
          </span>
        </span>
        <span style={{ display: 'block', height: '5px', borderRadius: '3px', background: 'rgba(155,176,189,0.18)', marginTop: '7px', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: completo ? '#4AE098' : '#C9A24A', borderRadius: '3px', transition: 'width 0.3s ease' }} />
        </span>
      </button>
    )
  }

  const tema = TEMAS_LECTURA[temaLectura]
  const botonLectura = (activo: boolean): React.CSSProperties => ({
    height: '32px',
    padding: '0 11px',
    borderRadius: '999px',
    border: `1px solid ${tema.borde}`,
    background: activo ? tema.acento : 'transparent',
    color: activo ? tema.fondo : tema.texto,
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ paddingBottom: '104px' }}>
      {/* Versión + continuar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span style={{ color: '#C9A24A', fontFamily: "'Cinzel', serif", fontSize: '15px', fontWeight: 700, marginRight: '4px' }}>📖 Lectura bíblica</span>
        {VERSIONES_BIBLIA.map((v) => (
          <button key={v.id} style={estiloPill(version === v.id)} onClick={() => setVersion(v.id)} title={v.nombre}>
            {v.corta}
          </button>
        ))}
      </div>

      {aviso && (
        <div style={{ color: '#4AE098', fontSize: '13px', fontWeight: 700, fontFamily: "'Inter', sans-serif", marginBottom: '10px' }}>{aviso}</div>
      )}

      {pantalla === 'inicio' && (
        <>
          {/* Progreso general */}
          <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid rgba(201, 162, 74, 0.3)', background: 'rgba(18, 40, 52, 0.65)', marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ color: '#DFBE72', fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 700 }}>Tu lectura de la Biblia</span>
              <span style={{ color: '#EDF3F7', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>
                {totalLeidos} de {totalBiblia} capítulos · {porcentaje}%
              </span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(155,176,189,0.18)', marginTop: '9px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${porcentaje}%`, background: 'linear-gradient(90deg, #C9A24A, #4AE098)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
            </div>
            <button
              style={{ ...estiloBoton, width: '100%', marginTop: '12px', height: '42px', fontSize: '13px' }}
              onClick={() => leerCapitulo(codigo, capitulo)}
            >
              ▶ Continuar en {nombreActual} {capitulo}
            </button>
            {totalLeidos > 0 && !confirmandoReinicio && (
              <button
                style={{
                  width: '100%',
                  marginTop: '8px',
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid rgba(155, 176, 189, 0.3)',
                  background: 'transparent',
                  color: '#9BB0BD',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif",
                  cursor: 'pointer',
                }}
                onClick={() => setConfirmandoReinicio(true)}
                title="Borrar las marcas de capítulos leídos y volver a Génesis 1"
              >
                ↺ Reiniciar lectura
              </button>
            )}
            {confirmandoReinicio && (
              <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', border: '1px solid rgba(242, 160, 160, 0.45)', background: 'rgba(120, 40, 40, 0.18)' }}>
                <div style={{ color: '#F2C9C9', fontSize: '12px', fontFamily: "'Inter', sans-serif", lineHeight: 1.5, marginBottom: '8px' }}>
                  Se borrarán las marcas de los <strong>{totalLeidos}</strong> capítulos leídos y volverás a <strong>Génesis 1</strong> para leer la Biblia otra vez. Los textos no se tocan.
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    style={{ flex: 1, height: '36px', borderRadius: '8px', border: 'none', background: 'rgba(214, 96, 96, 0.85)', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, fontFamily: "'Inter', sans-serif", cursor: 'pointer' }}
                    onClick={reiniciarLectura}
                  >
                    Sí, reiniciar
                  </button>
                  <button style={{ ...estiloBoton, flex: 1, height: '36px' }} onClick={() => setConfirmandoReinicio(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Salto rápido a una referencia */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            <input
              value={salto}
              onChange={(e) => setSalto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ejecutarSalto()
              }}
              placeholder="Ir a… «Juan 3», «Salmos 23:1»"
              style={{
                flex: 1,
                height: '38px',
                borderRadius: '8px',
                border: '1px solid rgba(155, 176, 189, 0.3)',
                background: 'rgba(10, 24, 33, 0.8)',
                color: '#E8EEF2',
                padding: '0 10px',
                fontSize: '14px',
                fontFamily: "'Inter', sans-serif",
                outline: 'none',
                minWidth: 0,
              }}
            />
            <button style={{ ...estiloBoton, height: '38px' }} onClick={ejecutarSalto}>
              Ir
            </button>
          </div>

          {/* Libros */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <button style={estiloPill(testamento === 'AT')} onClick={() => setTestamento('AT')}>
              Antiguo Testamento
            </button>
            <button style={estiloPill(testamento === 'NT')} onClick={() => setTestamento('NT')}>
              Nuevo Testamento
            </button>
          </div>
          <div>{metas.filter((m) => m.testamento === testamento).map(tarjetaLibro)}</div>

          <div style={{ color: '#8E9EA7', fontSize: '10.5px', fontFamily: "'Inter', sans-serif", lineHeight: 1.5, marginTop: '14px', textAlign: 'center' }}>
            Textos: Reina-Valera 1909 (dominio público) · Versión Biblia Libre (CC BY-SA 4.0, vía eBible.org). Sin conexión.
          </div>
        </>
      )}

      {pantalla === 'capitulos' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <button style={estiloBoton} onClick={() => setPantalla('inicio')}>
              ← Libros
            </button>
            <span style={{ color: '#EDF3F7', fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '17px', fontWeight: 600 }}>{nombreActual}</span>
            <span style={{ color: '#4AE098', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>
              {porLibro.get(codigo) || 0}/{numCapitulos} leídos
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(54px, 1fr))', gap: '7px' }}>
            {Array.from({ length: numCapitulos }, (_, i) => i + 1).map((n) => {
              const leidoCap = leidos.has(claveCapitulo(codigo, n))
              return (
                <button
                  key={n}
                  onClick={() => leerCapitulo(codigo, n)}
                  style={{
                    height: '46px',
                    borderRadius: '9px',
                    border: leidoCap ? '1px solid rgba(74, 224, 152, 0.55)' : '1px solid rgba(155, 176, 189, 0.25)',
                    background: leidoCap ? 'rgba(74, 224, 152, 0.13)' : 'rgba(18, 40, 52, 0.55)',
                    color: leidoCap ? '#4AE098' : '#D7E3EA',
                    fontSize: '15px',
                    fontWeight: 600,
                    fontFamily: "'Inter', sans-serif",
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  {n}
                  {leidoCap && <span style={{ position: 'absolute', top: '2px', right: '5px', fontSize: '10px' }}>✓</span>}
                </button>
              )
            })}
          </div>
          <div style={{ color: '#8E9EA7', fontSize: '11.5px', fontFamily: "'Inter', sans-serif", marginTop: '12px' }}>
            El ✓ marca los capítulos que ya leíste. Toca un número para leer.
          </div>
        </div>
      )}

      {pantalla === 'leyendo' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <button style={estiloBoton} onClick={() => setPantalla('capitulos')}>
              ☰ Capítulos
            </button>
            <span style={{ flex: 1, color: '#C9A24A', fontFamily: "'Cinzel', Georgia, serif", fontSize: '16px', fontWeight: 700, textAlign: 'center', minWidth: '120px' }}>
              {nombreActual} {capitulo}
            </span>
            <button
              style={{
                ...estiloBoton,
                border: capituloLeido ? '1px solid rgba(74, 224, 152, 0.6)' : estiloBoton.border,
                color: capituloLeido ? '#4AE098' : '#DFBE72',
              }}
              onClick={() => marcarLeido(!capituloLeido)}
              title={capituloLeido ? 'Capítulo leído (toca para desmarcar)' : 'Marcar capítulo como leído'}
            >
              {capituloLeido ? '✓ Leído' : '○ Marcar leído'}
            </button>
            <button style={estiloBoton} onClick={() => setModoLeer(true)} title="Leer a pantalla completa, con tamaño de letra y temas noche/día">
              📖 Leer
            </button>
          </div>

          {cargando && <div style={{ color: '#9BB0BD', textAlign: 'center', padding: '24px', fontFamily: "'Inter', sans-serif", fontSize: '13px' }}>Cargando…</div>}
          {errorCarga && <div style={{ color: '#F2A0A0', textAlign: 'center', padding: '24px', fontFamily: "'Inter', sans-serif", fontSize: '13px' }}>{errorCarga}</div>}

          {!cargando &&
            !errorCarga &&
            versiculos.map((texto, i) => {
              const numero = i + 1
              const seleccionado = seleccion.includes(numero)
              return (
                <div
                  key={numero}
                  onClick={() => toggleVersiculo(numero)}
                  style={{
                    padding: '5px 8px',
                    margin: '0 -4px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: seleccionado ? 'rgba(201, 162, 74, 0.20)' : 'transparent',
                    borderLeft: seleccionado ? '3px solid #C9A24A' : '3px solid transparent',
                    color: '#EDF3F7',
                    fontFamily: "'Crimson Pro', Georgia, serif",
                    fontSize: '18px',
                    lineHeight: 1.6,
                  }}
                >
                  <sup style={{ color: '#C9A24A', fontSize: '11px', fontWeight: 700, marginRight: '5px', fontFamily: "'Inter', sans-serif" }}>{numero}</sup>
                  {texto}
                </div>
              )
            })}

          {!cargando && !errorCarga && (
            <div style={{ marginTop: '22px', borderTop: '1px solid rgba(201, 162, 74, 0.25)', paddingTop: '16px' }}>
              {seleccion.length > 0 && (
                <button style={{ ...estiloBoton, width: '100%', marginBottom: '8px' }} onClick={copiarSeleccion}>
                  📋 Copiar cita seleccionada ({etiquetaReferencia(version, codigo, capitulo, seleccion[0], seleccion[seleccion.length - 1])})
                </button>
              )}
              {!capituloLeido ? (
                <button
                  onClick={marcarYContinuar}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #DFBE72 0%, #C9A24A 100%)',
                    color: '#122834',
                    fontSize: '14px',
                    fontWeight: 700,
                    fontFamily: "'Cinzel', serif",
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  ✓ Marcar como leído{destinoSiguiente() ? ' y continuar →' : ''}
                </button>
              ) : (
                <button
                  onClick={() => {
                    const sig = destinoSiguiente()
                    if (sig) leerCapitulo(sig.codigo, sig.capitulo)
                  }}
                  disabled={!destinoSiguiente()}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '10px',
                    border: '1px solid rgba(74, 224, 152, 0.55)',
                    background: 'rgba(74, 224, 152, 0.12)',
                    color: '#4AE098',
                    fontSize: '14px',
                    fontWeight: 700,
                    fontFamily: "'Cinzel', serif",
                    cursor: destinoSiguiente() ? 'pointer' : 'default',
                    opacity: destinoSiguiente() ? 1 : 0.5,
                  }}
                >
                  ✓ Capítulo leído · Siguiente →
                </button>
              )}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button
                  style={{ ...estiloBoton, flex: 1 }}
                  disabled={!destinoAnterior()}
                  onClick={() => {
                    const ant = destinoAnterior()
                    if (ant) leerCapitulo(ant.codigo, ant.capitulo)
                  }}
                >
                  ‹ Anterior
                </button>
                <button
                  style={{ ...estiloBoton, flex: 1 }}
                  disabled={!destinoSiguiente()}
                  onClick={() => {
                    const sig = destinoSiguiente()
                    if (sig) leerCapitulo(sig.codigo, sig.capitulo)
                  }}
                >
                  Siguiente ›
                </button>
              </div>
              <div style={{ color: '#8E9EA7', fontSize: '11px', fontFamily: "'Inter', sans-serif", marginTop: '10px', textAlign: 'center' }}>
                Toca versículos para copiarlos. Para insertarlos en tu escrito, abre la Biblia desde el editor (botón Biblia).
              </div>
            </div>
          )}
        </div>
      )}

      {modoLeer && (
        <div
          ref={leerRef}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: tema.fondo,
            color: tema.texto,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Barra del modo Leer */}
          <div style={{ position: 'sticky', top: 0, background: tema.fondo, borderBottom: `1px solid ${tema.borde}`, padding: '10px 12px', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '760px', margin: '0 auto' }}>
              <button
                onClick={() => setModoLeer(false)}
                style={{ height: '34px', padding: '0 12px', borderRadius: '8px', border: `1px solid ${tema.borde}`, background: 'transparent', color: tema.texto, fontSize: '13px', fontWeight: 700, fontFamily: "'Inter', sans-serif", cursor: 'pointer' }}
              >
                ✕ Salir
              </button>
              <span style={{ flex: 1, textAlign: 'center', color: tema.acento, fontFamily: "'Cinzel', Georgia, serif", fontSize: '16px', fontWeight: 700 }}>
                {nombreActual} {capitulo}
              </span>
              <span style={{ color: tema.suave, fontSize: '11px', fontFamily: "'Inter', sans-serif" }}>{versionCorta}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '760px', margin: '8px auto 0', flexWrap: 'wrap' }}>
              <button style={botonLectura(false)} onClick={() => setLetra((n) => Math.max(LETRA_MIN, n - 1))} disabled={letra <= LETRA_MIN} aria-label="Letra más chica">
                A−
              </button>
              <span style={{ color: tema.suave, fontSize: '12px', fontFamily: "'Inter', sans-serif", minWidth: '44px', textAlign: 'center' }}>{letra} px</span>
              <button style={botonLectura(false)} onClick={() => setLetra((n) => Math.min(LETRA_MAX, n + 1))} disabled={letra >= LETRA_MAX} aria-label="Letra más grande">
                A+
              </button>
              <span style={{ flex: 1 }} />
              {(['noche', 'dia', 'sepia'] as TemaLectura[]).map((t) => (
                <button key={t} style={botonLectura(temaLectura === t)} onClick={() => setTemaLectura(t)}>
                  {t === 'noche' ? '🌙 Noche' : t === 'dia' ? '☀️ Día' : '📜 Sepia'}
                </button>
              ))}
            </div>
          </div>

          {/* Texto corrido, como un libro */}
          <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 20px 12px', fontFamily: "'Crimson Pro', Georgia, serif", fontSize: `${letra}px`, lineHeight: 1.85 }}>
            {cargando && (
              <div style={{ textAlign: 'center', color: tema.suave, fontFamily: "'Inter', sans-serif", fontSize: '14px' }}>Cargando…</div>
            )}
            {errorCarga && (
              <div style={{ textAlign: 'center', color: '#D66', fontFamily: "'Inter', sans-serif", fontSize: '14px' }}>{errorCarga}</div>
            )}
            {!cargando &&
              !errorCarga &&
              versiculos.map((texto, i) => (
                <span key={i + 1}>
                  <sup style={{ color: tema.acento, fontSize: '0.62em', fontWeight: 700, marginRight: '4px', fontFamily: "'Inter', sans-serif" }}>{i + 1}</sup>
                  {texto}{' '}
                </span>
              ))}
          </div>

          {/* Navegación al final del capítulo */}
          {!cargando && !errorCarga && (
            <div style={{ maxWidth: '760px', margin: '0 auto', padding: '6px 20px 34px' }}>
              {!capituloLeido ? (
                <button
                  onClick={marcarYContinuar}
                  style={{ width: '100%', height: '48px', borderRadius: '10px', border: 'none', background: tema.acento, color: tema.fondo, fontSize: '14px', fontWeight: 700, fontFamily: "'Cinzel', serif", cursor: 'pointer' }}
                >
                  ✓ Marcar como leído{destinoSiguiente() ? ' y continuar →' : ''}
                </button>
              ) : (
                <button
                  onClick={() => {
                    const sig = destinoSiguiente()
                    if (sig) leerCapitulo(sig.codigo, sig.capitulo)
                  }}
                  disabled={!destinoSiguiente()}
                  style={{ width: '100%', height: '48px', borderRadius: '10px', border: `1px solid ${tema.borde}`, background: 'transparent', color: tema.acento, fontSize: '14px', fontWeight: 700, fontFamily: "'Cinzel', serif", cursor: destinoSiguiente() ? 'pointer' : 'default', opacity: destinoSiguiente() ? 1 : 0.5 }}
                >
                  ✓ Capítulo leído · Siguiente →
                </button>
              )}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button
                  style={{ ...botonLectura(false), flex: 1, borderRadius: '8px', height: '38px' }}
                  disabled={!destinoAnterior()}
                  onClick={() => {
                    const ant = destinoAnterior()
                    if (ant) leerCapitulo(ant.codigo, ant.capitulo)
                  }}
                >
                  ‹ Anterior
                </button>
                <button
                  style={{ ...botonLectura(false), flex: 1, borderRadius: '8px', height: '38px' }}
                  disabled={!destinoSiguiente()}
                  onClick={() => {
                    const sig = destinoSiguiente()
                    if (sig) leerCapitulo(sig.codigo, sig.capitulo)
                  }}
                >
                  Siguiente ›
                </button>
              </div>
              <div style={{ color: tema.suave, fontSize: '11px', fontFamily: "'Inter', sans-serif", marginTop: '10px', textAlign: 'center' }}>
                Modo Leer: para leer seguido, sin distracciones. Para copiar versículos, toca ✕ Salir.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default BibliaVista
