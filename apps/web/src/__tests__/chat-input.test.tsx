import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ChatInput } from '@/components/chat-input'

describe('ChatInput', () => {
  it('calls onSubmit when Enter is pressed with non-empty value', async () => {
    const onSubmit = vi.fn()
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(
      <ChatInput
        value="cancelar las 10"
        onChange={onChange}
        onSubmit={onSubmit}
        loading={false}
      />,
    )

    const input = screen.getByRole('textbox')
    await user.click(input)
    await user.keyboard('{Enter}')

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('calls onSubmit when submit button is clicked with non-empty value', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <ChatInput
        value="reorganizar agenda"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        loading={false}
      />,
    )

    const button = screen.getByRole('button', { name: /enviar/i })
    await user.click(button)

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('disables input and button while loading', () => {
    render(
      <ChatInput
        value="reorganizar agenda"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        loading={true}
      />,
    )

    const input = screen.getByRole('textbox')
    const button = screen.getByRole('button', { name: /enviar/i })

    expect(input).toBeDisabled()
    expect(button).toBeDisabled()
  })
})
