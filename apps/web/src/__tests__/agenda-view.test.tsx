import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AgendaView, AgendaViewSkeleton } from '@/components/agenda-view'
import type { AgendaDto } from '@/lib/api/types'

const makeAgenda = (overrides: Partial<AgendaDto> = {}): AgendaDto => ({
  date: '2026-06-06',
  workingHours: { open: '08:00', close: '18:00' },
  appointments: [],
  ...overrides,
})

describe('AgendaView', () => {
  it('renders the agenda title', () => {
    render(<AgendaView agenda={makeAgenda()} />)
    expect(screen.getByText('Agenda de hoy')).toBeInTheDocument()
  })

  it('renders working hours', () => {
    render(<AgendaView agenda={makeAgenda()} />)
    expect(screen.getByText(/08:00/)).toBeInTheDocument()
    expect(screen.getByText(/18:00/)).toBeInTheDocument()
  })

  it('renders appointment patient and slot', () => {
    const agenda = makeAgenda({
      appointments: [
        { id: 'a1', patientId: 'pac-007', slot: { start: '09:00', end: '09:30' } },
      ],
    })

    render(<AgendaView agenda={agenda} />)

    expect(screen.getByText('pac-007')).toBeInTheDocument()
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText(/09:30/)).toBeInTheDocument()
  })

  it('renders multiple appointments', () => {
    const agenda = makeAgenda({
      appointments: [
        { id: 'a1', patientId: 'pac-001', slot: { start: '09:00', end: '09:30' } },
        { id: 'a2', patientId: 'pac-002', slot: { start: '10:00', end: '10:30' } },
        { id: 'a3', patientId: 'pac-003', slot: { start: '11:00', end: '11:30' } },
      ],
    })

    render(<AgendaView agenda={agenda} />)

    expect(screen.getByText('pac-001')).toBeInTheDocument()
    expect(screen.getByText('pac-002')).toBeInTheDocument()
    expect(screen.getByText('pac-003')).toBeInTheDocument()
  })

  it('renders empty state when no appointments', () => {
    render(<AgendaView agenda={makeAgenda({ appointments: [] })} />)
    expect(screen.getByText(/No hay citas/i)).toBeInTheDocument()
  })

  it('has accessible aria-label on the card', () => {
    render(<AgendaView agenda={makeAgenda()} />)
    expect(screen.getByLabelText(/Agenda de hoy/i)).toBeInTheDocument()
  })
})

describe('AgendaViewSkeleton', () => {
  it('renders with aria-busy and accessible label', () => {
    render(<AgendaViewSkeleton />)
    const el = screen.getByLabelText(/Cargando agenda/i)
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute('aria-busy', 'true')
  })
})
