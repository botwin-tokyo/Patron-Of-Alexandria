import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiConfigProvider, useApiConfig } from '@/hooks/use-api-config';

afterEach(() => vi.unstubAllGlobals());

it('invalidates a pending connection when the key changes', async () => {
  let finish: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(useApiConfig, { wrapper: ApiConfigProvider });
  act(() => result.current.setApiKey('fixture'));
  let pending: Promise<void>;
  act(() => { pending = result.current.connect(); });
  const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/check-connection');
  expect(new Headers(options.headers).get('X-API-Key')).toBe('fixture');
  act(() => result.current.setApiKey('changed'));
  await act(async () => {
    finish(Response.json({ providers: ['custom'] }));
    await pending;
  });
  expect(result.current.status).toBe('idle');
  expect(result.current.providers).toEqual([]);
});
