'use client';

import { createContext, useContext } from 'react';

export type ImportTerminology = {
  /** Venue label for people records (e.g. Guest, Client). */
  clientLabel: string;
};

const Ctx = createContext<ImportTerminology>({ clientLabel: 'Client' });

export function ImportTerminologyProvider({
  value,
  children,
}: {
  value: ImportTerminology;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useImportTerminology() {
  return useContext(Ctx);
}
