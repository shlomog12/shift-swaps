/** A short note from a swap request, offer or volunteer, shown as a quote. */
export function NoteLine({ note, className = '' }: { note: string; className?: string }) {
  return (
    <p className={`note-line ${className}`.trim()}>
      <span aria-hidden="true">💬 </span>
      {note}
    </p>
  );
}
