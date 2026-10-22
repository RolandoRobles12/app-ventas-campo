import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

type Tono = 'ok' | 'error';

interface ToastState {
  toast: string;
  showToast: (msg: string, tono?: Tono) => void;
}

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState('');
  const [tono, setTono] = useState<Tono>('ok');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = (msg: string, t: Tono = 'ok') => {
    setToast(msg);
    setTono(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), t === 'error' ? 6000 : 3800);
  };

  return (
    <ToastContext.Provider value={{ toast, showToast }}>
      {children}
      {toast && (
        <div style={{
          position: 'fixed', top: 72, left: 'calc(50% + 114px)', transform: 'translateX(-50%)', maxWidth: 620,
          background: tono === 'error' ? '#a8322a' : 'var(--aviva-green-700)', color: '#fff', padding: '12px 22px', borderRadius: 10,
          fontSize: 14, fontWeight: 500, boxShadow: '0 10px 30px rgba(15,81,50,.35)', zIndex: 60,
          animation: 'toastIn .25s ease', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {tono === 'error'
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffd2cc" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8fe3b4" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="M5 12l5 5L20 7"/></svg>}
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
