import type { PlanResponseDto, Result } from './types'

const SCHEDULING_URL =
  (import.meta.env.VITE_SCHEDULING_URL as string | undefined) ??
  'http://localhost:3000'

/**
 * POST /messages → Result<PlanResponseDto>
 *
 * Error mapping (Spanish user-facing copy):
 *   422 agenda_not_found    → "No se encontró la agenda del médico."
 *   503 language_unavailable → "El servicio de lenguaje no está disponible. Intenta de nuevo en unos momentos."
 *   network error           → "No se pudo conectar con el servicio. Verifica tu conexión."
 *   any other error         → "Ocurrió un error inesperado. Por favor intenta de nuevo."
 */
export async function postMessage(message: string): Promise<Result<PlanResponseDto>> {
  try {
    const response = await fetch(`${SCHEDULING_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })

    if (response.ok) {
      const data = (await response.json()) as PlanResponseDto
      return { ok: true, data }
    }

    if (response.status === 422) {
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (body.error === 'agenda_not_found') {
        return {
          ok: false,
          error: {
            kind: 'agenda_not_found',
            message: 'No se encontró la agenda del médico.',
          },
        }
      }
    }

    if (response.status === 503) {
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (body.error === 'language_unavailable') {
        return {
          ok: false,
          error: {
            kind: 'language_unavailable',
            message:
              'El servicio de lenguaje no está disponible. Intenta de nuevo en unos momentos.',
          },
        }
      }
    }

    return {
      ok: false,
      error: {
        kind: 'unknown',
        message: 'Ocurrió un error inesperado. Por favor intenta de nuevo.',
      },
    }
  } catch {
    return {
      ok: false,
      error: {
        kind: 'network',
        message: 'No se pudo conectar con el servicio. Verifica tu conexión.',
      },
    }
  }
}
