import { useEffect, useRef, useState, type ReactNode } from 'react';

type AlertToastVariant = 'tech' | 'danger' | 'warning';

type AlertToastProps = {
  message: string;
  variant?: AlertToastVariant;
  icon?: ReactNode;
  autoCloseMs?: number;
  exitDelayMs?: number;
  closeLabel?: string;
  onClose: () => void;
};

const VARIANT_STYLES: Record<AlertToastVariant, { container: string; icon: string; message: string; button: string }> = {
  tech: {
    container:
      'bg-slate-900/55 border-cyan-400/45 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_10px_30px_rgba(6,182,212,0.2)]',
    icon: 'text-cyan-300',
    message: 'text-cyan-50',
    button: 'text-cyan-200/80 hover:text-cyan-50',
  },
  danger: {
    container: 'bg-red-600 border-red-700 text-white',
    icon: 'text-white',
    message: 'text-white',
    button: 'text-red-100 hover:text-white',
  },
  warning: {
    container: 'bg-yellow-400 border-yellow-500 text-yellow-950',
    icon: 'text-yellow-950',
    message: 'text-yellow-950',
    button: 'text-yellow-900 hover:text-yellow-950',
  },
};

function getAnimationClass(isVisible: boolean): string {
  const baseClass =
    'flex items-start gap-3 px-4 py-3 border rounded-xl backdrop-blur-md transform transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';
  const stateClass = isVisible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-10 opacity-0 scale-95';
  return `${baseClass} ${stateClass}`;
}

export default function AlertToast({
  message,
  variant = 'danger',
  icon,
  autoCloseMs = 5000,
  exitDelayMs = 220,
  closeLabel = 'Close',
  onClose,
}: AlertToastProps) {
  const style = VARIANT_STYLES[variant];
  const [isVisible, setIsVisible] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    setIsVisible(false);
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [message]);

  const handleClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setIsVisible(false);
    window.setTimeout(() => onClose(), exitDelayMs);
  };

  useEffect(() => {
    if (autoCloseMs <= 0) return;
    const timer = window.setTimeout(() => handleClose(), autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, message]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-xl">
      <div className={`${getAnimationClass(isVisible)} ${style.container}`}>
        {icon ?? (
          <svg className={`w-5 h-5 mt-0.5 shrink-0 ${style.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
        )}
        <p className={`flex-1 text-sm tracking-wide ${style.message}`}>{message}</p>
        <button
          type="button"
          onClick={handleClose}
          className={`${style.button} transition-colors text-sm font-semibold`}
          aria-label="close alert message"
        >
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
