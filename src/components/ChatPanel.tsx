import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, User, Upload, FileText, X, CheckCircle, AlertCircle, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useApiConfig } from '@/hooks/use-api-config';
import { cn } from '@/lib/utils';
import sendIcon from '@/assets/send.svg';
import assistantAvatar from '@/assets/assistant.svg';
import uploadIcon from '@/assets/upload.svg';

import { patronRequest, PatronRequestError } from '@/lib/patronBackendClient';

interface LibraryDocument {
  id: number;
  status: 'processing' | 'indexed' | 'error' | 'deleting';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type FileStatus = 'ready' | 'uploading' | 'processing' | 'indexed' | 'error';

interface UploadFile {
  id: string;
  file: File;
  status: FileStatus;
  documentId?: number;
  error?: string;
}

export function ChatPanel() {
  const { provider, apiKey, status } = useApiConfig();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        'Welcome to the Document Library Client. I am ready to help you explore and query your document library. What would you like to know?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const requests = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    requests.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const pending = files.filter(f => f.status === 'processing');
    if (!pending.length || status !== 'connected') return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const updates = new Map<string, Partial<UploadFile>>();
      for (const file of pending) {
        try {
          const doc = await patronRequest<LibraryDocument>(`documents/${file.documentId}/status`, apiKey, { signal: controller.signal });
          updates.set(file.id, { status: doc.status === 'deleting' ? 'error' : doc.status,
            error: doc.status === 'error' ? 'Librarian could not index this document.' : undefined });
        } catch (error) {
          if (controller.signal.aborted) return;
          const permanent = error instanceof PatronRequestError && [401, 403, 404].includes(error.status);
          updates.set(file.id, permanent
            ? { status: 'error', error: error.message }
            : { error: 'Status unavailable. Retrying…' });
        }
      }
      if (!controller.signal.aborted) setFiles(prev => prev.map(f => updates.has(f.id) ? { ...f, ...updates.get(f.id) } : f));
    }, 2500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [files, apiKey, status]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const pushAssistantError = (content: string) => {
    const errorMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, errorMessage]);
  };

  const handleAskQuestion = async () => {
    if (!input.trim() || isLoading) return;

    if (status !== 'connected') {
      pushAssistantError('Please connect to your Librarian instance using the Connect button in the top bar before querying.');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const data = await patronRequest<{ answer: string }>('ask', apiKey, {
        method: 'POST',
        signal: requests.current.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, query: userMessage.content }),
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer || 'I did not receive an answer from the backend.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      pushAssistantError(error instanceof Error ? error.message : 'Could not reach Patron.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // File upload handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
    setShowUpload(true);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'ready',
    }));
    setFiles(prev => [...prev, ...uploadFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleUploadFile = async () => {
    const readyFiles = files.filter(f => f.status === 'ready');
    if (readyFiles.length === 0) return;

    if (status !== 'connected') return;

    setIsUploading(true);

    for (const uploadFile of readyFiles) {
      setFiles(prev =>
        prev.map(f =>
          f.id === uploadFile.id ? { ...f, status: 'uploading' as FileStatus } : f
        )
      );

      try {
        const formData = new FormData();
        formData.append('files', uploadFile.file);

        const result = await patronRequest<{ documents: LibraryDocument[] }>('upload', apiKey, {
          method: 'POST', body: formData, signal: requests.current.signal,
        });
        const doc = result.documents[0];
        setFiles(prev => prev.map(f => f.id === uploadFile.id
          ? { ...f, documentId: doc.id, status: doc.status === 'deleting' ? 'error' : doc.status }
          : f));
      } catch (error) {
        if (requests.current.signal.aborted) break;
        setFiles(prev => prev.map(f => f.id === uploadFile.id
          ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed.' }
          : f));
      }
    }

    setIsUploading(false);
  };

  const getStatusBadge = (fileStatus: FileStatus) => {
    switch (fileStatus) {
      case 'ready':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
            Ready
          </span>
        );
      case 'uploading':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
            <Loader2 size={12} className="animate-spin" />
            Uploading…
          </span>
        );
      case 'processing':
        return <span className="text-xs">Processing…</span>;
      case 'indexed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
            <CheckCircle size={12} />
            Indexed
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-error/15 text-error">
            <AlertCircle size={12} />
            Error
          </span>
        );
    }
  };

  const hasReadyFiles = files.some(f => f.status === 'ready');

  return (
    <div className="flex flex-col h-full bg-card rounded-2xl shadow-soft border border-border overflow-hidden">
      {/* Header with Upload Toggle */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background/50">
        <div className="flex items-center gap-2">
          <img src={assistantAvatar} alt="Librarian" className="w-6 h-6 object-contain" />
          <span className="text-sm font-medium text-foreground">Librarian</span>
        </div>
        <Button
          variant={showUpload ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowUpload(!showUpload)}
          className={cn(
            'gap-2 transition-all',
            showUpload && 'bg-primary text-primary-foreground'
          )}
        >
          <Paperclip size={14} />
          {showUpload ? 'Hide Upload' : 'Upload Documents'}
        </Button>
      </div>

      {/* Upload Panel (collapsible) */}
      {showUpload && (
        <div className="border-b border-border bg-secondary/20 p-4 animate-fade-in-up">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-xl p-4 transition-all duration-200 text-center',
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-secondary/30'
            )}
          >
            <div className="flex flex-col items-center gap-2">
              <img src={uploadIcon} alt="Upload" className="w-12 h-12 object-contain" />
              <div>
                <p className="text-sm text-foreground font-medium">
                  Drop files here or click to upload
                </p>
                <p className="text-xs text-muted-foreground">PDFs and other supported files</p>
              </div>
              <label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                  <span>Select file</span>
                </Button>
              </label>
            </div>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
              {files.map(file => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 px-3 py-2 bg-background rounded-lg"
                >
                  <FileText size={16} className="text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {file.file.name}
                    </p>
                  </div>
                  {file.error && <span role="status" className="text-xs">{file.error}</span>}
                  {getStatusBadge(file.status)}
                  {file.status === 'ready' && (
                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upload Button */}
          {files.length > 0 && (
            <div className="mt-3 flex justify-center">
              <Button
                onClick={handleUploadFile}
                disabled={!hasReadyFiles || isUploading || status !== 'connected'}
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isUploading ? (
                  <>
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={14} className="mr-2" />
                    Upload {files.filter(f => f.status === 'ready').length} file(s)
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map(message => (
          <div
            key={message.id}
            className={cn(
              'flex gap-3 animate-fade-in-up',
              message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            {/* Avatar */}
            {message.role === 'user' ? (
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground">
                <User size={16} />
              </div>
            ) : (
              <img
                src={assistantAvatar}
                alt="Librarian"
                className="flex-shrink-0 w-8 h-8 object-contain"
              />
            )}

            {/* Message Content */}
            <div
              className={cn(
                'max-w-[70%] flex flex-col gap-1',
                message.role === 'user' ? 'items-end' : 'items-start'
              )}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">
                  {message.role === 'user' ? 'Patron' : 'Librarian'}
                </span>
                <span>{formatTime(message.timestamp)}</span>
              </div>
              <div
                className={cn(
                  'px-4 py-3 rounded-2xl text-sm leading-relaxed',
                  message.role === 'user'
                    ? 'bg-chat-user text-chat-user-foreground rounded-tr-md'
                    : 'bg-chat-assistant text-chat-assistant-foreground border border-border rounded-tl-md'
                )}
              >
                {message.content}
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-3 animate-fade-in-up">
            <img
              src={assistantAvatar}
              alt="Librarian"
              className="flex-shrink-0 w-8 h-8 object-contain"
            />
            <div className="flex items-center gap-2 px-4 py-3 bg-chat-assistant border border-border rounded-2xl rounded-tl-md">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border p-4 bg-background/50">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the Librarian anything about your documents…"
              className="min-h-[60px] max-h-[120px] resize-none pr-4 bg-background border-input rounded-xl"
              disabled={isLoading || status !== 'connected'}
            />
          </div>
          <Button
            onClick={handleAskQuestion}
            disabled={!input.trim() || isLoading || status !== 'connected'}
            className="h-[60px] px-6 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200"
          >
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <img src={sendIcon} alt="Send" className="w-20 h-20 object-contain -ml-3" />
            )}
          </Button>
        </div>

      </div>
    </div>
  );
}
