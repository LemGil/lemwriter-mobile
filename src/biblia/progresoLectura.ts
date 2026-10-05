// Progreso de lectura bíblica de LemWriter Mobile.
// Guarda los capítulos marcados como leídos en el dispositivo (localStorage),
// con clave «CODIGO:capitulo» (p. ej. «JHN:3»). Es un solo registro por capítulo,
// sin importar en qué versión se leyó.

const CLAVE_LEIDOS = 'lw_biblia_leidos_v1'

export function claveCapitulo(codigo: string, capitulo: number): string {
  return `${codigo}:${capitulo}`
}

export function cargarLeidos(): Set<string> {
  try {
    const crudo = localStorage.getItem(CLAVE_LEIDOS)
    if (crudo) {
      const datos = JSON.parse(crudo)
      if (Array.isArray(datos)) {
        return new Set(datos.filter((x) => typeof x === 'string'))
      }
    }
  } catch {
    /* registro no válido: se empieza de cero */
  }
  return new Set<string>()
}

export function guardarLeidos(leidos: Set<string>): void {
  try {
    localStorage.setItem(CLAVE_LEIDOS, JSON.stringify([...leidos]))
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Devuelve un Set nuevo con el capítulo marcado o desmarcado. */
export function alternarLeido(leidos: Set<string>, codigo: string, capitulo: number): Set<string> {
  const nuevo = new Set(leidos)
  const clave = claveCapitulo(codigo, capitulo)
  if (nuevo.has(clave)) {
    nuevo.delete(clave)
  } else {
    nuevo.add(clave)
  }
  guardarLeidos(nuevo)
  return nuevo
}

export function conteoPorLibro(leidos: Set<string>): Map<string, number> {
  const conteo = new Map<string, number>()
  for (const clave of leidos) {
    const codigo = clave.split(':')[0]
    conteo.set(codigo, (conteo.get(codigo) || 0) + 1)
  }
  return conteo
}
