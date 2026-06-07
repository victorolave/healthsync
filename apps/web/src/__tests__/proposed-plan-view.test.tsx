import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProposedPlanView } from '@/components/proposed-plan-view'
import type { PlanResponseDto } from '@/lib/api/types'

const makePlan = (overrides: Partial<PlanResponseDto> = {}): PlanResponseDto => ({
  status: 'proposed',
  operations: [],
  conflicts: [],
  confidence: 0.9,
  ...overrides,
})

describe('ProposedPlanView', () => {
  it('renders two operation cards from fixture', () => {
    const plan = makePlan({
      operations: [
        {
          type: 'move',
          appointmentId: 'appt-1',
          patientId: 'pac-001',
          from: { start: '09:00', end: '09:30' },
          to: { start: '10:00', end: '10:30' },
        },
        {
          type: 'move',
          appointmentId: 'appt-2',
          patientId: 'pac-002',
          from: { start: '11:00', end: '11:30' },
          to: { start: '12:00', end: '12:30' },
        },
      ],
    })

    render(<ProposedPlanView plan={plan} />)

    expect(screen.getByText('pac-001')).toBeInTheDocument()
    expect(screen.getByText('pac-002')).toBeInTheDocument()
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
  })

  it('renders OVERFLOWS_CLOSING conflict badge for matching operation', () => {
    const plan = makePlan({
      operations: [
        {
          type: 'move',
          appointmentId: 'appt-1',
          patientId: 'pac-001',
          from: { start: '09:00', end: '09:30' },
          to: { start: '18:30', end: '19:00' },
        },
      ],
      conflicts: [
        {
          appointmentId: 'appt-1',
          reason: 'OVERFLOWS_CLOSING',
          proposedSlot: { start: '18:30', end: '19:00' },
        },
      ],
    })

    render(<ProposedPlanView plan={plan} />)

    const badge = screen.getByLabelText(/Conflicto:/i)
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('Se pasa del horario de cierre')
    expect(badge).toHaveTextContent('18:30')
  })

  it('shows confidence percentage', () => {
    // Empty plan shows "sin cambios" — need at least one operation to render confidence
    const planWithOp = makePlan({
      confidence: 0.87,
      operations: [
        {
          type: 'move',
          appointmentId: 'appt-1',
          patientId: 'pac-001',
          from: { start: '09:00', end: '09:30' },
          to: { start: '10:00', end: '10:30' },
        },
      ],
    })

    render(<ProposedPlanView plan={planWithOp} />)
    expect(screen.getByText('Confianza: 87%')).toBeInTheDocument()
  })

  it('shows "sin cambios" copy when plan is empty', () => {
    const plan = makePlan({ operations: [], conflicts: [], confidence: 1 })

    render(<ProposedPlanView plan={plan} />)

    expect(
      screen.getByText(/sin cambios/i),
    ).toBeInTheDocument()
  })
})
