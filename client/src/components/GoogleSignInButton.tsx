import { useEffect, useRef } from 'react';

// Minimal shape of the bits of Google Identity Services we use — the real
// script (loaded at runtime below) has no first-party types package.
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: { type: string; theme: string; size: string; shape: string; width: string },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Renders Google's own "Sign in with Google" button. Only mounted when
 * VITE_GOOGLE_CLIENT_ID is configured — see AuthPage.
 */
export function GoogleSignInButton({
  clientId,
  onCredential,
}: {
  clientId: string;
  onCredential: (credential: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onCredential(response.credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: '336',
        });
      })
      .catch(() => {
        // Offline or blocked by the network — the password form still works.
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential]);

  return <div ref={containerRef} className="flex justify-center" />;
}
