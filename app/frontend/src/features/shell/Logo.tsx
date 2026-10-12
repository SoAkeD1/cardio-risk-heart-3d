export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="rgb(var(--surface-3))" />
        <path
          d="M16 25s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 16 10.9a4.8 4.8 0 0 1 8.5 2.9C24.5 19.8 16 25 16 25z"
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="2"
        />
        <path
          d="M9.5 16h4l1.5-3 2 6 1.5-3h4"
          fill="none"
          stroke="rgb(var(--text-1))"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.01em]">CardioLens</span>
    </div>
  );
}
