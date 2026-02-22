import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { CopilotContext } from '../types';

interface CopilotContextState {
  context: CopilotContext;
  setLeadContext: (leadId: number | null, leadName?: string) => void;
}

const CopilotCtx = createContext<CopilotContextState>({
  context: { page: '/' },
  setLeadContext: () => {},
});

export function CopilotContextProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [leadId, setLeadId] = useState<number | null>(null);
  const [leadName, setLeadName] = useState<string | undefined>();

  const setLeadContext = useCallback((id: number | null, name?: string) => {
    setLeadId(id);
    setLeadName(name);
  }, []);

  const context: CopilotContext = {
    page: location.pathname,
    ...(leadId ? { lead_id: leadId, lead_name: leadName } : {}),
  };

  return (
    <CopilotCtx.Provider value={{ context, setLeadContext }}>
      {children}
    </CopilotCtx.Provider>
  );
}

export function useCopilotContext() {
  return useContext(CopilotCtx);
}
