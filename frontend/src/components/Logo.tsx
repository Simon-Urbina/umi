/** Three stacked waves; the same drawing as public/umi-icon.svg. */
export default function Logo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" strokeWidth="2.6" strokeLinecap="round" className={className} aria-hidden>
      <path d="M4 10c3-3 5-3 8 0s5 3 8 0 5-3 8 0" stroke="var(--tide)" />
      <path d="M4 17c3-3 5-3 8 0s5 3 8 0 5-3 8 0" stroke="var(--coral)" />
      <path d="M4 24c3-3 5-3 8 0s5 3 8 0 5-3 8 0" stroke="var(--tide-ink)" />
    </svg>
  )
}
