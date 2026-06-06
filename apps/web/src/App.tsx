import { AppShell } from '@/components/app-shell'
import { MessagesContainer } from '@/features/messages/messages-container'

/**
 * Root application component.
 * IntentResponse render removed — the app now displays PlanResponseDto.
 * Confirm button and SSE are deferred to PR4 (FE-loop).
 */
function App() {
  return (
    <AppShell>
      <MessagesContainer />
    </AppShell>
  )
}

export default App
