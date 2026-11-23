import { useState, createContext, useContext, ReactNode, useRef } from 'react';
import { patronRequest } from '@/lib/patronBackendClient';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

function useConnection() {
  const [apiKey, updateKey] = useState('');
  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setError] = useState('');
  const generation = useRef(0);

  function setApiKey(key: string) {
    generation.current++;
    updateKey(key);
    setProviders([]);
    setProvider('');
    setError('');
    setStatus('idle');
  }

  async function connect() {
    const version = ++generation.current;
    setStatus('connecting');
    setError('');
    try {
      const result = await patronRequest<{ providers: string[] }>('check-connection', apiKey, { method: 'POST' });
      if (generation.current !== version) return;
      setProviders(result.providers);
      setProvider(result.providers[0]);
      setStatus('connected');
    } catch (error) {
      if (generation.current !== version) return;
      setStatus('error');
      setError(error instanceof Error ? error.message : 'Connection failed.');
    }
  }
  return { apiKey, setApiKey, providers, provider, setProvider, status, errorMessage, connect, disconnect: () => setApiKey('') };
}

const ApiConfigContext = createContext<ReturnType<typeof useConnection> | null>(null);

export function ApiConfigProvider({ children }: { children: ReactNode }) {
  return <ApiConfigContext.Provider value={useConnection()}>{children}</ApiConfigContext.Provider>;
}

export function useApiConfig() {
  const context = useContext(ApiConfigContext);
  if (!context) throw new Error('Missing ApiConfigProvider');
  return context;
}
