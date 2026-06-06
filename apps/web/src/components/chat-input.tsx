import { type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading: boolean
  disabled?: boolean
}

/**
 * Presentational chat input card.
 * - Enter key submits (unless Shift is held)
 * - Submit blocked when value is empty or loading
 * - Input is disabled while in-flight (loading=true)
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  loading,
  disabled = false,
}: ChatInputProps) {
  const canSubmit = value.trim().length > 0 && !loading && !disabled

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSubmit) onSubmit()
    }
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="flex gap-2 p-3">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Contame qué pasó — reorganiza el resto"
          disabled={loading || disabled}
          aria-label="Mensaje para el asistente de agenda"
          className="flex-1"
        />
        <Button
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-label="Enviar mensaje"
          size="icon"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  )
}
