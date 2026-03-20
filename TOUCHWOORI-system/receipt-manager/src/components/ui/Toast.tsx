'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  success: () => {},
  error: () => {},
  info: () => {},
});

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<ToastContextType>(() => ({
    success: (msg) => addToast('success', msg),
    error: (msg) => addToast('error', msg),
    info: (msg) => addToast('info', msg),
  }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* 토스트 컨테이너 - 우하단 */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 md:bottom-6 md:right-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            aria-live="polite"
            className={`
              flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg
              animate-slide-in-right min-w-[280px] max-w-[400px]
              ${toast.type === 'success' ? 'bg-success-50 text-success-700 border border-success-600/20' : ''}
              ${toast.type === 'error' ? 'bg-danger-50 text-danger-700 border border-danger-600/20' : ''}
              ${toast.type === 'info' ? 'bg-info-50 text-info-600 border border-info-600/20' : ''}
            `}
          >
            {toast.type === 'success' && <CheckCircle className="h-5 w-5 shrink-0" />}
            {toast.type === 'error' && <XCircle className="h-5 w-5 shrink-0" />}
            {toast.type === 'info' && <Info className="h-5 w-5 shrink-0" />}
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded p-0.5 hover:bg-black/5 transition-colors"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
