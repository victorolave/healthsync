import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ErrorState } from '@/components/states/error-state'

describe('ErrorState', () => {
  it('renders the error message', () => {
    render(
      <ErrorState
        message="No se encontró la agenda del médico."
        onRetry={vi.fn()}
      />,
    )

    expect(
      screen.getByText('No se encontró la agenda del médico.'),
    ).toBeInTheDocument()
  })

  it('renders the retry button', () => {
    render(
      <ErrorState
        message="Error de conexión."
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('calls onRetry when retry button is clicked', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()

    render(
      <ErrorState
        message="El servicio no está disponible."
        onRetry={onRetry}
      />,
    )

    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders as alert role for screen readers', () => {
    render(
      <ErrorState
        message="No se pudo conectar con el servicio."
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
