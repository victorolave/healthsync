import { useEffect, useState } from 'react'

const STORAGE_KEY = 'healthsync-theme'

function getInitialDark(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === 'dark'
  } catch {
    // localStorage unavailable (SSR, private mode, etc.)
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Persists dark/light preference in localStorage.
 * Toggles the `.dark` class on <html> so Tailwind dark: variants apply.
 */
export function useDarkMode() {
  const [isDark, setIsDark] = useState<boolean>(getInitialDark)

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
    } catch {
      // ignore write errors
    }
  }, [isDark])

  const toggle = () => setIsDark((prev) => !prev)

  return { isDark, toggle }
}
