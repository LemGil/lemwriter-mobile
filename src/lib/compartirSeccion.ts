// src/lib/compartirSeccion.ts
//
// Compartir una sección como texto listo para pegar (WhatsApp, redes,
// correo…). Convierte el HTML del editor a texto plano con el formato
// sencillo que WhatsApp entiende (*negrita*, _cursiva_, • viñetas) y
// abre la hoja de compartir del teléfono. Sin Internet: la hoja es del
// sistema; el envío ya lo hace la app que elijas.

import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { textoDeHtml } from './importarDocumento'

/**
 * HTML del editor → texto plano compartible. Si se da un título, va
 * primero en su propia línea, en negrita de WhatsApp.
 */
export function htmlATextoCompartible(html: string, titulo?: string): string {
  let plano = ` ${html || ''} `
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<h[1-6][^>]*>/gi, '\n\n')
    .replace(/<\/(h[1-6]|p|li|ul|ol|blockquote)>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner: string) => `*${textoDeHtml(inner)}*`)
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner: string) => `_${textoDeHtml(inner)}_`)
  plano = plano
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (titulo && titulo.trim()) {
    const encabezado = `*${titulo.trim()}*`
    if (!plano.startsWith(encabezado)) plano = plano ? `${encabezado}\n\n${plano}` : encabezado
  }
  return plano
}

/**
 * Comparte el texto: en el teléfono abre la hoja del sistema (WhatsApp,
 * Facebook, Telegram, correo…); en web usa el compartir del navegador o
 * copia al portapapeles. Devuelve cómo se resolvió.
 */
export async function compartirTextoPlano(opts: {
  title: string
  text: string
}): Promise<'compartido' | 'copiado'> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ title: opts.title, text: opts.text, dialogTitle: 'Compartir sección' })
    return 'compartido'
  }
  if (typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function') {
    await (navigator as any).share({ title: opts.title, text: opts.text })
    return 'compartido'
  }
  await navigator.clipboard.writeText(opts.text)
  return 'copiado'
}
