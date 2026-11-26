import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { whatsappUrl } from '../lib/share';

export interface ShareOffer {
  /** What just happened, e.g. "ההתנדבות נשלחה". */
  title: string;
  /** Who to tell, e.g. "להודיע לדני בוואטסאפ?". */
  message?: ReactNode;
  /** The WhatsApp message. */
  text: string;
  /** Label of the WhatsApp button. */
  label: string;
}

const ShareContext = createContext<(offer: ShareOffer) => void>(() => {});

/** After an action, offers to send the other person a WhatsApp message about it. */
export function useShareOffer() {
  return useContext(ShareContext);
}

export function ShareProvider({ children }: { children: ReactNode }) {
  const [offer, setOffer] = useState<ShareOffer | null>(null);
  const show = useCallback((next: ShareOffer) => setOffer(next), []);
  const value = useMemo(() => show, [show]);

  return (
    <ShareContext.Provider value={value}>
      {children}
      {offer && (
        <div
          className="dialog-backdrop"
          onClick={() => setOffer(null)}
          onKeyDown={(e) => e.key === 'Escape' && setOffer(null)}
        >
          <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>{offer.title}</h2>
            {offer.message && <div className="dialog-message">{offer.message}</div>}
            <div className="dialog-buttons">
              <button type="button" onClick={() => setOffer(null)}>
                לא עכשיו
              </button>
              <a
                className="button whatsapp"
                href={whatsappUrl(offer.text)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOffer(null)}
                autoFocus
              >
                {offer.label}
              </a>
            </div>
          </div>
        </div>
      )}
    </ShareContext.Provider>
  );
}
