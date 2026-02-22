import { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error';
interface Toast { id: number; message: string; type: ToastType; }
interface ToastCtx { toast: (message: string, type?: ToastType) => void; }

const ToastContext = createContext<ToastCtx>({ toast: () => {} });
let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={`
                pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
                border cursor-pointer select-none
                ${t.type === 'error'
                  ? 'bg-zinc-900 border-red-800 text-red-300'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-200'}
              `}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.type === 'error' ? 'bg-red-400' : 'bg-green-400'}`} />
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
