import type { SVGProps } from 'react'
type Name = 'plus' | 'chat' | 'image' | 'video' | 'canvas' | 'search' | 'settings' | 'arrow' | 'close' | 'folder' | 'menu' | 'copy' | 'refresh' | 'file'
const paths: Record<Name, string> = {
  plus: 'M12 5v14M5 12h14', chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
  image: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM21 15l-5-5L5 21M7 7h.01',
  video: 'M4 4h16v16H4ZM9 8l7 4-7 4Z', canvas: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  search: 'm21 21-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  arrow: 'M12 19V5m-6 6 6-6 6 6', close: 'm6 6 12 12M6 18 18 6', folder: 'M3 5h6l2 2h10v13H3Z', menu: 'M4 6h16M4 12h16M4 18h16', copy: 'M8 8h12v13H8ZM16 8V3H3v13h5', refresh: 'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 7M4 12l2 7a8 8 0 0 0 13-2', file: 'M4 3h10l6 6v12H4ZM14 3v6h6M8 13h8M8 17h5',
}
export function StudioIcon({ name, ...props }: { name: Name } & SVGProps<SVGSVGElement>) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg> }
