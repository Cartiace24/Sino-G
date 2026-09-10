import { useCallback, useEffect, useState } from 'react';

/**
 * Device-only preferences (no schema change, no RLS touch).
 * - sinog:notif  → live notification badge + realtime inbox refresh
 * - sinog:alerts → hangout celebratory toasts (Asked!/Nudged!/You're down!)
 * Errors always toast regardless of these toggles.
 */

export const PREF_KEYS = {
  notif: 'sinog:notif',
  alerts: 'sinog:alerts',
} as const;

const PREF_EVENT = 'sinog:prefs';

export function getPreference(key: string, fallback = true): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function setPreferenceValue(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* private mode: state still applies for this session */
  }
  window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: { key, value } }));
}

/** Reactive device preference — syncs same-tab (custom event) + cross-tab (storage). */
export function usePreference(key: string, initial = true): [boolean, () => void] {
  const [value, setValue] = useState(() => getPreference(key, initial));

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string; value?: boolean } | undefined;
      if (detail?.key === key && typeof detail.value === 'boolean') setValue(detail.value);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(e.newValue == null ? initial : e.newValue === '1');
    };
    window.addEventListener(PREF_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PREF_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [key, initial]);

  const toggle = useCallback(() => {
    setValue((prev) => {
      const next = !prev;
      setPreferenceValue(key, next);
      return next;
    });
  }, [key]);

  return [value, toggle];
}

export function useNotifEnabled(): [boolean, () => void] {
  return usePreference(PREF_KEYS.notif, true);
}

export function useAlertsEnabled(): [boolean, () => void] {
  return usePreference(PREF_KEYS.alerts, true);
}
