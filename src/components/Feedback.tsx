import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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
}

type ToastKind = 'success' | 'error' | 'info';

interface Feedback {
  /** Resolves to true when the user confirms. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves to the entered text, or null when cancelled. */
  ask: (options: AskOptions) => Promise<string | null>;
  toast: (message: string, kind?: ToastKind) => void;
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

  const value = useMemo(() => ({ confirm, ask, toast }), [confirm, ask, toast]);

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
