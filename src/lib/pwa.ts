import { useEffect, useState } from 'react';

/** The browser's install prompt (Chrome/Android), kept until the user asks to install. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Registers the service worker (production builds only) and keeps the install prompt for later. */
export function setupPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    listeners.forEach((l) => l());
  });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Without a service worker the app still works, just not offline.
      });
    });
  }
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Whether the browser offered to install the app, and a function that shows its prompt. */
export function useInstall(): { canInstall: boolean; install: () => Promise<boolean> } {
  const [canInstall, setCanInstall] = useState(installPrompt !== null);
  useEffect(() => {
    const update = () => setCanInstall(installPrompt !== null);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  async function install() {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    listeners.forEach((l) => l());
    return outcome === 'accepted';
  }

  return { canInstall, install };
}

/** False while the device has no network connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
