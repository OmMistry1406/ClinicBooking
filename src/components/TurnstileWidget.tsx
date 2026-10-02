'use client';

import { useEffect, useRef } from 'react';

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Props {
  onToken: (token: string) => void;
  /** Change this value to reset the widget (tokens are single use). */
  resetKey: number;
}

export function TurnstileWidget({ onToken, resetKey }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | undefined>(undefined);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!sitekey) return;
    let cancelled = false;
    function render() {
      if (cancelled || !ref.current || !window.turnstile) return;
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: sitekey!,
        callback: (t) => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current(''),
      });
    }
    if (window.turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
      if (!script) {
        script = document.createElement('script');
        script.src = SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
    }
    return () => {
      cancelled = true;
      if (idRef.current) window.turnstile?.remove(idRef.current);
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && idRef.current) window.turnstile?.reset(idRef.current);
  }, [resetKey]);

  return <div ref={ref} />;
}
