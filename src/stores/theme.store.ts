import { create } from 'zustand'

export type AppTheme = 'light' | 'dark'
const STORAGE_KEY = 'tangmen.appearance.theme'

function readTheme(): AppTheme {
  try { return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark' }
  catch { return 'dark' }
}

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  window.electronAPI?.setTheme(theme)
}

export const useThemeStore = create<{ theme: AppTheme; setTheme: (theme: AppTheme) => void }>(set => ({
  theme: readTheme(),
  setTheme: theme => {
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* Current-window switching still works if storage is unavailable. */ }
    applyTheme(theme)
    set({ theme })
  },
}))

// Runs before the first React render; theme is a local appearance preference, not project data.
export function initializeTheme() {
  applyTheme(useThemeStore.getState().theme)
}
