import { useApiConfig } from '@/hooks/use-api-config';
import { AppBar } from '@/components/AppBar';
import { ChatPanel } from '@/components/ChatPanel';

const Index = () => {
  const { status } = useApiConfig();
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top App Bar */}
      <AppBar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-6 overflow-hidden max-w-5xl mx-auto w-full">
        <ChatPanel key={status === 'connected' ? 'connected' : 'offline'} />
      </main>
    </div>
  );
};

export default Index;
