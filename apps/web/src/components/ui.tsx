import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import QRCode from 'qrcode';
import { hueOf, initials } from '../lib/format';
import { Icon } from './Icon';

/* ---------- toasts ---------- */
type ToastKind = 'ok' | 'bad';
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: ToastKind; id: number } | null>(null);
  const show = useCallback(
    (message: string, kind: ToastKind = 'ok') => setToast({ message, kind, id: Date.now() }),
    [],
  );
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast ${toast.kind === 'bad' ? 'bad' : ''}`}>
            <Icon name={toast.kind === 'bad' ? 'alert' : 'check'} />
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- buttons ---------- */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger';
  size?: 'sm';
  busy?: boolean;
}

export function Button({
  variant,
  size,
  busy,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = ['btn', variant, size, className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={disabled || busy} {...rest}>
      {busy && <Icon name="refresh" className="spin" />}
      {children}
    </button>
  );
}

/* ---------- modal ---------- */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ---------- form field ---------- */
const FieldIdContext = createContext<string | undefined>(undefined);

/** Labels an <Input>/<TextArea>/<select id={useFieldId()}> placed inside it. */
export function Field({
  label,
  error,
  note,
  optional,
  children,
}: {
  label: string;
  error?: string;
  note?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional && <span className="opt">(optional)</span>}
      </label>
      <FieldIdContext.Provider value={id}>{children}</FieldIdContext.Provider>
      {note && !error && <span className="note">{note}</span>}
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export const useFieldId = () => useContext(FieldIdContext);

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return <input ref={ref} id={useFieldId()} type="text" {...props} />;
  },
);

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select id={useFieldId()} {...props} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea id={useFieldId()} {...props} />;
}

/* ---------- small pieces ---------- */
export type Tone = 'good' | 'warn' | 'bad' | 'accent' | '';

export function Pill({
  tone = '',
  children,
  live,
}: {
  tone?: Tone;
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <span className={`pill ${tone} ${live ? 'live' : ''}`}>
      <i />
      {children}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span
      className="avatar"
      style={{ '--h': hueOf(name) } as React.CSSProperties}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  sub,
  back,
  children,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  back?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {back}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function LoadState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  if (error) {
    return (
      <div className="empty">
        <b>Could not load</b>
        {error}
        {onRetry && (
          <div style={{ marginTop: 12 }}>
            <Button size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }
  return loading ? <div className="empty">Loading…</div> : null;
}

/* ---------- QR ---------- */
export function QrImage({
  value,
  size = 180,
  label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(value, { width: size * 2, margin: 0, errorCorrectionLevel: 'M' }).then(
      (url) => live && setSrc(url),
    );
    return () => {
      live = false;
    };
  }, [value, size]);
  return src ? (
    <img src={src} width={size} height={size} alt={label ?? 'QR code'} />
  ) : (
    <div style={{ width: size, height: size }} />
  );
}
