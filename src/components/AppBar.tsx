import { useState } from 'react';
import { Sun, Moon, Eye, EyeOff, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/hooks/use-theme';
import { useApiConfig } from '@/hooks/use-api-config';
import { cn } from '@/lib/utils';
import patronLogo from '@/assets/library.svg';

export function AppBar() {
  const { theme, toggleTheme } = useTheme();
  const { providers, provider, setProvider, errorMessage, apiKey, status, setApiKey, connect, disconnect } = useApiConfig();
  const [showApiKey, setShowApiKey] = useState(false);

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          label: 'Connected',
          icon: Wifi,
          className: 'bg-status-connected text-primary-foreground',
          dotClass: 'bg-success-foreground animate-pulse-dot',
        };
      case 'connecting':
        return {
          label: 'Connecting',
          icon: Loader2,
          className: 'bg-secondary text-secondary-foreground',
          dotClass: '',
        };
      case 'error':
        return {
          label: 'Error',
          icon: WifiOff,
          className: 'bg-status-error/15 text-status-error border border-status-error/30',
          dotClass: 'bg-status-error',
        };
      default:
        return {
          label: 'Connect',
          icon: Wifi,
          className: 'bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground',
          dotClass: '',
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  const handleConnectClick = () => {
    if (status === 'connected') {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-appbar border-b border-appbar-border shadow-soft">
      <div className="flex items-center justify-between h-16 px-6 gap-6">
        {/* Left - App Title with Logo */}
        <div className="flex items-center gap-3 min-w-[240px]">
          <img 
            src={patronLogo} 
            alt="Document Library Client" 
            className="w-10 h-10 object-contain"
          />
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-foreground tracking-tight">
              Document Library Client
            </h1>
            <span className="text-xs text-muted-foreground">
              Client for Librarian
            </span>
          </div>
        </div>

        {/* Center - API Configuration */}
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          {providers.length > 0 && (
            <select aria-label="Answer provider" value={provider} onChange={e => setProvider(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-sm">
              {providers.map(name => <option key={name}>{name}</option>)}
            </select>
          )}
          <div className="flex-1 min-w-[180px] relative">
            <Input
              type={showApiKey ? 'text' : 'password'}
              aria-label="Patron key"
              placeholder="Patron key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="h-9 bg-background border-input text-sm pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-3 min-w-[200px] justify-end">
          {/* Connect Button */}
          <Button
            onClick={handleConnectClick}
            disabled={!apiKey || status === 'connecting'}
            className={cn(
              'h-9 px-4 rounded-full font-medium transition-all duration-200',
              statusConfig.className
            )}
          >
            {status === 'connecting' ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <>
                {status === 'connected' && (
                  <span className={cn('w-2 h-2 rounded-full mr-2', statusConfig.dotClass)} />
                )}
                <StatusIcon size={16} className="mr-2" />
              </>
            )}
            {statusConfig.label}
          </Button>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 rounded-full hover:bg-secondary"
          >
            {theme === 'light' ? (
              <Moon size={18} className="text-muted-foreground" />
            ) : (
              <Sun size={18} className="text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>
      {errorMessage && <p role="alert" className="px-6 pb-2 text-sm">{errorMessage}</p>}
    </header>
  );
}
