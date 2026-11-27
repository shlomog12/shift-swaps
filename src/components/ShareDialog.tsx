import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/focusTrap';
import { WhatsAppButton } from './SwapRequests';
import { WhatsAppIcon } from './WhatsAppIcon';

export interface ShareOption {
  label: string;
  /** A short line under the option, e.g. how many shifts it holds. */
  detail?: string;
  text: string;
}

/** A share button that opens a dialog with the choices (each opens WhatsApp with a ready message). */
export function ShareMenuButton({ label, title, options }: { label: string; title: string; options: ShareOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="share-toggle" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <WhatsAppIcon />
        {label}
      </button>
      {open && <ShareDialog title={title} options={options} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({ title, options, onClose }: { title: string; options: ShareOption[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="dialog share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="share-dialog-title">{title}</h2>
        <p className="muted small">נפתחת הודעה מוכנה בוואטסאפ, ושם בוחרים למי לשלוח.</p>
        <div className="share-options">
          {options.map((o) => (
            <div key={o.label} className="share-option" onClick={onClose}>
              <WhatsAppButton label={o.label} text={o.text} />
              {o.detail && <span className="muted small">{o.detail}</span>}
            </div>
          ))}
        </div>
        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            סגירה
          </button>
        </div>
      </div>
    </div>
  );
}
