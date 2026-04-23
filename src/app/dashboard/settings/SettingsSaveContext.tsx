'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type SettingsSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type BannerState = {
  status: SettingsSaveStatus;
  message: string | null;
};

const SettingsSaveContext = createContext<{
  report: (next: Partial<BannerState>) => void;
  clear: () => void;
  banner: BannerState;
} | null>(null);

export function SettingsSaveProvider({ children }: { children: ReactNode }) {
  const [banner, setBanner] = useState<BannerState>({ status: 'idle', message: null });
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    setBanner({ status: 'idle', message: null });
  }, []);

  const report = useCallback((next: Partial<BannerState>) => {
    setBanner((prev) => ({
      status: next.status ?? prev.status,
      message: next.message !== undefined ? next.message : prev.message,
    }));
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    if (next.status === 'saved') {
      clearTimer.current = setTimeout(() => {
        setBanner({ status: 'idle', message: null });
        clearTimer.current = null;
      }, 2800);
    }
  }, []);

  const value = useMemo(() => ({ report, clear, banner }), [report, clear, banner]);

  return <SettingsSaveContext.Provider value={value}>{children}</SettingsSaveContext.Provider>;
}

export function useSettingsSave() {
  const ctx = useContext(SettingsSaveContext);
  if (!ctx) {
    return {
      report: () => {},
      clear: () => {},
      banner: { status: 'idle' as const, message: null as string | null },
    };
  }
  return ctx;
}
