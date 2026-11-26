import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { whatsappUrl } from '../lib/share';
import { WhatsAppIcon } from './WhatsAppIcon';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  /** The user must type this word before the confirm button is enabled. */
  requireText?: string;
}

export interface AskOptions {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  initial?: string;
  placeholder?: string;
  maxLength?: number;
}

type ToastKind = 'success' | 'error' | 'info';

/** After an action, an offer to tell the other person on WhatsApp. */
export interface ShareOffer {
  /** Who to tell, e.g. "אפשר לעדכן את דני בוואטסאפ". */
  message: string;
  /** The WhatsApp message. */
  text: string;
  /** Label of the WhatsApp button. */
  label: string;
}

const SHARE_OFF_KEY = 'share-offers';
const SHARE_MS = 15_000;

export function shareOffersEnabled(): boolean {
  return localStorage.getItem(SHARE_OFF_KEY) !== 'off';
}

export function setShareOffersEnabled(on: boolean) {
  localStorage.setItem(SHARE_OFF_KEY, on ? 'on' : 'off');
}

interface Feedback {
  /** Resolves to true when the user confirms. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves to the entered text, or null when cancelled. */
  ask: (options: AskOptions) => Promise<string | null>;
  toast: (message: string, kind?: ToastKind) => void;
  /** Shows a dismissible WhatsApp offer that does not block the screen (unless the user turned these off). */
  shareOffer: (offer: ShareOffer) => void;
}

const FeedbackContext = createContext<Feedback | null>(null);

export function useFeedback(): Feedback {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider');
  return value;
}

type DialogState =
  | { type: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { type: 'ask'; options: AskOptions; resolve: (text: string | null) => void };

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const TOAST_MS = 3500;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const [share, setShare] = useState<ShareOffer | null>(null);
  const shareTimer = useRef<number | undefined>(undefined);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ type: 'confirm', options, resolve })),
    [],
  );
  const ask = useCallback(
    (options: AskOptions) => new Promise<string | null>((resolve) => setDialog({ type: 'ask', options, resolve })),
    [],
  );
  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++nextId.current;
    setToasts((list) => [...list, { id, message, kind }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const shareOffer = useCallback((offer: ShareOffer) => {
    if (!shareOffersEnabled()) return;
    setShare(offer);
    window.clearTimeout(shareTimer.current);
    shareTimer.current = window.setTimeout(() => setShare(null), SHARE_MS);
  }, []);

  const value = useMemo(() => ({ confirm, ask, toast, shareOffer }), [confirm, ask, toast, shareOffer]);

  function close(result: boolean, text: string) {
    if (!dialog) return;
    if (dialog.type === 'confirm') dialog.resolve(result);
    else dialog.resolve(result ? text : null);
    setDialog(null);
  }

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {dialog && <Dialog key={dialog.options.title} state={dialog} onClose={close} />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
        {share && (
          <div className="share-bar">
            <span>{share.message}</span>
            <span className="share-bar-actions">
              <a
                className="button whatsapp small"
                href={whatsappUrl(share.text)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShare(null)}
              >
                <WhatsAppIcon />
                {share.label}
              </a>
              <button
                className="link small"
                onClick={() => {
                  setShareOffersEnabled(false);
                  setShare(null);
                  toast('לא נציע יותר. אפשר להחזיר את זה במסך הפרופיל', 'info');
                }}
              >
                לא להציע שוב
              </button>
              <button className="icon small-icon" aria-label="סגירה" onClick={() => setShare(null)}>
                ✕
              </button>
            </span>
          </div>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}

function Dialog({ state, onClose }: { state: DialogState; onClose: (ok: boolean, text: string) => void }) {
  const { options } = state;
  const required = state.type === 'confirm' ? state.options.requireText : undefined;
  const hasInput = state.type === 'ask' || required !== undefined;
  const [text, setText] = useState(state.type === 'ask' ? (state.options.initial ?? '') : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = state.type === 'confirm' && state.options.danger;
  const blocked = required !== undefined && text.trim() !== required;

  useEffect(() => {
    if (hasInput) inputRef.current?.focus();
    else confirmRef.current?.focus();
  }, [hasInput]);

  return (
    <div
      className="dialog-backdrop"
      onClick={() => onClose(false, text)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose(false, text);
        }
      }}
    >
      <form
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) onClose(true, text);
        }}
      >
        <h2 id="dialog-title">{options.title}</h2>
        {options.message && <div className="dialog-message">{options.message}</div>}
        {hasInput && (
          <input
            ref={inputRef}
            value={text}
            placeholder={state.type === 'ask' ? state.options.placeholder : `הקלדת "${required}" לאישור`}
            aria-label={state.type === 'ask' ? options.title : `הקלדת "${required}" לאישור`}
            maxLength={state.type === 'ask' ? state.options.maxLength : undefined}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <div className="dialog-buttons">
          <button type="button" onClick={() => onClose(false, text)}>
            {(state.type === 'confirm' && state.options.cancelLabel) || 'ביטול'}
          </button>
          <button ref={confirmRef} type="submit" className={danger ? 'danger solid' : 'primary'} disabled={blocked}>
            {options.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
