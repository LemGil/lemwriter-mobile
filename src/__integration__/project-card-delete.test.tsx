// src/__integration__/project-card-delete.test.tsx
//
// La tarjeta de proyecto muestra un botón visible de eliminar (además del
// gesto de deslizar): al tocarlo se pide confirmación (onDelete) sin abrir
// el proyecto.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SwipeableProjectCard } from '../components/SwipeableProjectCard'
import type { Proyecto } from '../types'

const proyecto: Proyecto = {
  id: 'p1',
  title: 'Mi sermón',
  type: 'sermon',
  updated_at: new Date().toISOString(),
}
const tipoInfo = { icon: '📝', label: 'Sermón', desc: '' }

function renderCard(handlers?: {
  onSelect?: (p: Proyecto) => void
  onEdit?: (p: Proyecto, e: React.MouseEvent) => void
  onDelete?: (p: Proyecto) => void
}) {
  return render(
    <SwipeableProjectCard
      proyecto={proyecto}
      tipoInfo={tipoInfo}
      fechaRelativa="hoy"
      onSelect={handlers?.onSelect ?? vi.fn()}
      onEdit={handlers?.onEdit ?? vi.fn()}
      onDelete={handlers?.onDelete ?? vi.fn()}
    />
  )
}

/** El botón visible de la tarjeta (el otro «Eliminar» vive en la capa
 *  oculta del gesto de deslizar, con opacity 0). */
function botonEliminarVisible() {
  const botones = screen.getAllByRole('button', { name: /eliminar proyecto/i })
  const visible = botones.find((b) => (b as HTMLElement).style.opacity !== '0')
  if (!visible) throw new Error('No se encontró el botón visible de eliminar')
  return visible
}

describe('SwipeableProjectCard: botón visible de eliminar', () => {
  it('muestra el botón eliminar en cada tarjeta', () => {
    renderCard()
    expect(botonEliminarVisible()).toBeTruthy()
  })

  it('al tocarlo llama onDelete con el proyecto y no lo abre', () => {
    const onDelete = vi.fn()
    const onSelect = vi.fn()
    renderCard({ onDelete, onSelect })
    fireEvent.click(botonEliminarVisible())
    expect(onDelete).toHaveBeenCalledWith(proyecto)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
