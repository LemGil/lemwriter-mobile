import { describe, it, expect, beforeEach } from 'vitest'
import { FolderStore, htmlToMarkdown, markdownToHtml } from '../folderStore'
import { MemoryFsAdapter } from '../fsAdapter'

describe('resaltado <mark> sobrevive guardar → reabrir (punto 3)', () => {
  it('htmlToMarkdown conserva el <mark> de Tiptap', () => {
    const md = htmlToMarkdown('<p>La <mark>fe</mark> se manifiesta.</p>')
    expect(md).toContain('<mark>fe</mark>')
  })

  it('htmlToMarkdown conserva el <mark> con color de fondo', () => {
    const md = htmlToMarkdown('<p>La <mark style="background-color: #ff0">fe</mark> se manifiesta.</p>')
    expect(md).toContain('<mark style="background-color: #ff0">fe</mark>')
  })

  it('ciclo completo guardar → leer conserva el resaltado', () => {
    const md = htmlToMarkdown('<p>La <mark>fe</mark> tiene que manifestarse.</p>')
    const html = markdownToHtml(md)
    expect(html).toContain('<mark>fe</mark>')
  })

  it('ciclo completo con color de resaltado', () => {
    const md = htmlToMarkdown('<p>La <mark style="background-color: rgb(255, 255, 0)">fe</mark> obra.</p>')
    const html = markdownToHtml(md)
    expect(html).toContain('<mark')
    expect(html).toContain('fe</mark>')
  })
})

describe('copia del documento original al importar (punto 4)', () => {
  let fs: MemoryFsAdapter
  let store: FolderStore

  beforeEach(() => {
    fs = new MemoryFsAdapter()
    store = new FolderStore(fs, 'LemWriter')
  })

  it('guardarOriginal crea la subcarpeta «originales» con el archivo', async () => {
    const p = await store.crearProyecto('estudio', 'Romanos')
    const base64 = Buffer.from('CONTENIDO-DOCX', 'utf8').toString('base64')
    const ruta = await store.guardarOriginal(p.id, 'ensenanza.docx', base64)
    expect(ruta).toBe(`LemWriter/${p.carpeta}/originales/ensenanza.docx`)
    expect(await fs.exists(ruta)).toBe(true)
    expect(await fs.readFile(ruta)).toBe(base64)
  })

  it('el nombre del archivo se limpia de rutas peligrosas', async () => {
    const p = await store.crearProyecto('estudio', 'Romanos')
    const ruta = await store.guardarOriginal(p.id, '../../mal.pdf', 'eA==')
    expect(ruta).not.toContain('..')
    expect(ruta).toContain('/originales/')
  })

  it('falla si el proyecto no existe', async () => {
    await expect(store.guardarOriginal('no-existe', 'a.docx', 'eA==')).rejects.toThrow()
  })

  it('dos originales con el mismo nombre en proyectos distintos no chocan', async () => {
    const a = await store.crearProyecto('estudio', 'Romanos')
    const b = await store.crearProyecto('estudio', 'Gálatas')
    await store.guardarOriginal(a.id, 'doc.docx', 'eA==')
    await store.guardarOriginal(b.id, 'doc.docx', 'eQ==')
    expect(await fs.readFile(`LemWriter/${a.carpeta}/originales/doc.docx`)).toBe('eA==')
    expect(await fs.readFile(`LemWriter/${b.carpeta}/originales/doc.docx`)).toBe('eQ==')
  })
})
