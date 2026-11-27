/** Grey placeholders in the shape of the content while it loads; screen readers hear "טוען". */

export function SkeletonList({ rows = 4, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div className="skeleton-list" role="status" aria-busy="true">
      <span className="visually-hidden">טוען…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={tall ? 'skeleton skeleton-row tall' : 'skeleton skeleton-row'} aria-hidden="true" />
      ))}
    </div>
  );
}

export function SkeletonGrid() {
  return (
    <div className="skeleton-grid" role="status" aria-busy="true">
      <span className="visually-hidden">טוען…</span>
      {Array.from({ length: 35 }, (_, i) => (
        <div key={i} className="skeleton skeleton-day" aria-hidden="true" />
      ))}
    </div>
  );
}

export function SkeletonChips({ count = 8 }: { count?: number }) {
  return (
    <div className="name-list" role="status" aria-busy="true">
      <span className="visually-hidden">טוען…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-chip" style={{ width: `${3.5 + ((i * 37) % 4)}rem` }} aria-hidden="true" />
      ))}
    </div>
  );
}

/** Full-page placeholder for the app's first load (session and profile). */
export function SkeletonPage() {
  return (
    <div className="skeleton-page" role="status" aria-busy="true">
      <span className="visually-hidden">טוען…</span>
      <div className="skeleton skeleton-bar" aria-hidden="true" />
      <div className="page">
        <div className="skeleton skeleton-card" aria-hidden="true" />
        <SkeletonGrid />
      </div>
    </div>
  );
}
