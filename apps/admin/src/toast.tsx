import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastState {
  toast: string;
  showToast: (msg: string) => void;
}

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 3200);
  };

  return (
    <ToastContext.Provider value={{ toast, showToast }}>
      {children}
      {toast && (
        <div style={{
          position: 'fixed', top: 76, left: 'calc(50% + 118px)', transform: 'translateX(-50%)',
          background: 'var(--aviva-green-700)', color: '#fff', padding: '12px 22px', borderRadius: 10,
          fontSize: 14, fontWeight: 500, boxShadow: '0 10px 30px rgba(15,81,50,.35)', zIndex: 60,
          animation: 'toastIn .25s ease', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8fe3b4" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
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
