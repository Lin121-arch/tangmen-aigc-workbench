const isMac = window.electronAPI?.platform === 'darwin';

export function TitleBar() {
  return (
    <header
      className={`app-drag relative flex h-10 shrink-0 select-none items-center gap-2.5 border-b border-[#d4af37]/15 bg-[#0a0a0f] pr-3 ${
        isMac ? 'pl-[78px]' : 'pl-3'
      }`}
    >
      <img src={`${import.meta.env.BASE_URL}app-icon.png`} alt="" className="h-4 w-4" />
      <span className="font-display text-[11px] font-semibold tracking-[0.32em] text-[#e8c766]/90">
        唐门AI · 创作工作台
      </span>
      <a
        href="https://github.com/Lin121-arch/tangmen-aigc-workbench"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="打开唐门AIGC工作台 GitHub 项目"
        title="GitHub · 源码与版本下载"
        className="app-no-drag ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#b5b2a8] hover:bg-white/5 hover:text-[#e8c766] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c766]"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542v-2.094c-3.13.68-3.791-1.328-3.791-1.328-.512-1.3-1.25-1.646-1.25-1.646-1.022-.698.077-.684.077-.684 1.13.08 1.725 1.16 1.725 1.16 1.004 1.72 2.634 1.223 3.275.935.102-.727.393-1.223.715-1.504-2.498-.284-5.124-1.25-5.124-5.565 0-1.23.44-2.232 1.16-3.02-.117-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.154A10.793 10.793 0 0 1 12 6.18c.956.004 1.919.13 2.818.379 2.148-1.457 3.091-1.154 3.091-1.154.615 1.55.229 2.695.112 2.98.722.788 1.159 1.79 1.159 3.02 0 4.327-2.63 5.278-5.136 5.557.404.349.765 1.034.765 2.084v3.085c0 .3.203.65.774.54A11.25 11.25 0 0 0 12 .75Z" />
        </svg>
      </a>
      {/* Reserve space so content stays clear of the native window controls overlay (Windows) */}
      {!isMac && <div aria-hidden="true" className="h-full w-[150px] shrink-0" />}
    </header>
  );
}
