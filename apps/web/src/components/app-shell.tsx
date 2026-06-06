import type { ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDarkMode } from '@/hooks/use-dark-mode'

interface AppShellProps {
  children: ReactNode
}

/**
 * App shell: sticky top bar with logo swap (light/dark) and dark-mode toggle.
 * Centered content column max-w-2xl.
 */
export function AppShell({ children }: AppShellProps) {
  const { isDark, toggle } = useDarkMode()

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top app bar */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img
              src={isDark ? '/brand/logo-dark.png' : '/brand/logo-horizontal.png'}
              alt="HealthSync"
              className="h-8 w-auto object-contain"
            />
          </div>

          {/* Dark mode toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? (
              <Sun className="size-5" aria-hidden="true" />
            ) : (
              <Moon className="size-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-2xl px-4 py-6">
        {children}
      </main>
    </div>
  )
}
