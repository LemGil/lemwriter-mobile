// src/__integration__/explorador-carpetas.test.tsx
//
// El explorador de carpetas lista subcarpetas, navega y devuelve la elegida.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Filesystem } from '@capacitor/filesystem'
import { ExploradorCarpetas } from '../components/settings/ExploradorCarpetas'

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    readdir: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
  },
  Directory: { Documents: 'DOCUMENTS', ExternalStorage: 'EXTERNAL' },
}))

const readdirMock = Filesystem.readdir as unknown as ReturnType<typeof vi.fn>
const mkdirMock = Filesystem.mkdir as unknown as ReturnType<typeof vi.fn>

function arbol() {
  readdirMock.mockImplementation(async ({ path }: any) => {
    if (!path) {
      return {
        files: [
          { name: 'LemWriter', type: 'directory' },
          { name: 'MinisterioWiki', type: 'directory' },
          { name: 'foto.jpg', type: 'file' },
        ],
      }
    }
    if (path === 'LemWriter') {
      return {
        files: [
          { name: 'sermones', type: 'directory' },
          { name: 'proyecto.json', type: 'file' },
        ],
      }
    }
    return { files: [] }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  arbol()
})

function renderExplorador(props?: Partial<React.ComponentProps<typeof ExploradorCarpetas>>) {
  const onElegir = vi.fn()
  const onCerrar = vi.fn()
  render(
    <ExploradorCarpetas
      titulo="Elegir carpeta"
      onElegir={onElegir}
      onCerrar={onCerrar}
      {...props}
    />
  )
  return { onElegir, onCerrar }
}

describe('ExploradorCarpetas', () => {
  it('lista solo las subcarpetas (no los archivos)', async () => {
    renderExplorador()
    expect(await screen.findByText('LemWriter')).toBeTruthy()
    expect(await screen.findByText('MinisterioWiki')).toBeTruthy()
    expect(screen.queryByText('foto.jpg')).toBeNull()
  })

  it('entra a la subcarpeta al tocarla', async () => {
    renderExplorador()
    fireEvent.click(await screen.findByText('LemWriter'))
    await waitFor(() => {
      expect(readdirMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'LemWriter' })
      )
    })
    expect(await screen.findByText('sermones')).toBeTruthy()
  })

  it('«Usar esta carpeta» devuelve la base y la ruta actual', async () => {
    const { onElegir } = renderExplorador()
    fireEvent.click(await screen.findByText('LemWriter'))
    fireEvent.click(await screen.findByText('Usar esta carpeta'))
    expect(onElegir).toHaveBeenCalledWith('documents', 'LemWriter')
  })

  it('puede crear una subcarpeta nueva', async () => {
    renderExplorador()
    await screen.findByText('LemWriter')
    fireEvent.click(screen.getByText(/nueva carpeta/i))
    fireEvent.change(screen.getByPlaceholderText(/nombre de la carpeta/i), {
      target: { value: 'NuevaBiblia' },
    })
    fireEvent.click(screen.getByText('Crear'))
    await waitFor(() => {
      expect(mkdirMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'NuevaBiblia' })
      )
    })
  })
})
