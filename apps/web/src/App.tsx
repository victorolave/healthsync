import { AppShell } from '@/components/app-shell'
import { Toaster } from '@/components/ui/sonner'
import { MessagesContainer } from '@/features/messages/messages-container'

/**
 * Root application component.
 * Renders the two-panel layout: chat+movements (left) and agenda (right).
 * Toaster is mounted here so toast() calls from any child are captured.
 */
function App() {
  return (
    <AppShell>
      <MessagesContainer />
      <Toaster />
    </AppShell>
  )
}

export default App
