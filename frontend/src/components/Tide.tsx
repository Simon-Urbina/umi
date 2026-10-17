const W = 600
const H = 120
const PAD = 14

/** One mood per local day (YYYY-MM-DD), the average of that day's entries, in the order the days first appear. */
export function dailyMoods(entries: { createdAt: { toDate(): Date } | null; moodScore: number }[]) {
  const days = new Map<string, number[]>()
  for (const e of entries) {
    const day = (e.createdAt?.toDate() ?? new Date()).toLocaleDateString('en-CA') // a pending write is from today
    days.set(day, [...(days.get(day) ?? []), e.moodScore])
  }
  return [...days].map(([day, moods]) => ({ day, moodScore: moods.reduce((a, b) => a + b, 0) / moods.length }))
}

/** Mood (1-10) of each day, oldest first, drawn as a smooth wave. */
export function tidePath(moods: number[]) {
  const pts = (moods.length === 1 ? [moods[0], moods[0]] : moods).map((m, i, a) => [
    (i / (a.length - 1)) * W,
    H - PAD - ((m - 1) / 9) * (H - PAD * 2),
  ])
  // Quadratic curves through midpoints keep the wave soft without overshooting the 1-10 range.
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1]
    const [x, y] = pts[i]
    d += ` Q${px},${py} ${(px + x) / 2},${(py + y) / 2}`
  }
  const [lx, ly] = pts[pts.length - 1]
  return `${d} T${lx},${ly}`
}

export default function Tide({ moods }: { moods: number[] }) {
  const line = tidePath(moods)
  const avg = moods.reduce((a, b) => a + b, 0) / moods.length
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={`Tu ánimo en tus últimos ${moods.length} días: ${moods.map((m) => +m.toFixed(1)).join(', ')} de 10`}
      >
        <defs>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--tide)" stopOpacity="0.45" />
            <stop offset="1" stopColor="var(--tide)" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#sea)" />
        <path d={line} fill="none" stroke="var(--tide)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-sm text-muted-foreground">
        <span>Tu marea, {moods.length === 1 ? 'último día' : `últimos ${moods.length} días`}</span>
        <span>Promedio {avg.toFixed(1)} de 10</span>
      </figcaption>
    </figure>
  )
}
