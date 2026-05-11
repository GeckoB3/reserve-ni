export const IMPORT_EXECUTE_STATE_KEY = 'import_execute_v1' as const;

export type ImportExecutePhase = 'clients' | 'staged_bookings' | 'csv_bookings';

export interface ImportExecuteDefaultsPayload {
  defaultAreaId: string | null;
  defaultCalendarId: string | null;
  defaultServiceItemId: string | null;
  defaultPractitionerId: string | null;
  defaultAppointmentServiceId: string | null;
}

export interface ImportExecuteStateV1 {
  phase: ImportExecutePhase;
  clientFileIndex: number;
  clientRowIndex: number;
  stagedRowIndex: number;
  bookingFileIndex: number;
  bookingRowIndex: number;
  importedClients: number;
  importedBookings: number;
  skipped: number;
  updatedExisting: number;
  processed: number;
  defaultsPayload: ImportExecuteDefaultsPayload | null;
}

export function createInitialImportExecuteState(): ImportExecuteStateV1 {
  return {
    phase: 'clients',
    clientFileIndex: 0,
    clientRowIndex: 0,
    stagedRowIndex: 0,
    bookingFileIndex: 0,
    bookingRowIndex: 0,
    importedClients: 0,
    importedBookings: 0,
    skipped: 0,
    updatedExisting: 0,
    processed: 0,
    defaultsPayload: null,
  };
}

/** Thrown when a batch budget is exhausted; checkpoint is safe to persist and resume. */
export class ImportBatchPaused extends Error {
  readonly checkpoint: ImportExecuteStateV1;
  constructor(checkpoint: ImportExecuteStateV1) {
    super('import_batch_paused');
    this.name = 'ImportBatchPaused';
    this.checkpoint = checkpoint;
  }
}

export function isImportBatchPaused(e: unknown): e is ImportBatchPaused {
  return e instanceof ImportBatchPaused;
}

function deepCloneState(s: ImportExecuteStateV1): ImportExecuteStateV1 {
  return {
    ...s,
    defaultsPayload: s.defaultsPayload ? { ...s.defaultsPayload } : null,
  };
}

export function snapshotImportExecuteStateForPause(st: ImportExecuteStateV1): ImportExecuteStateV1 {
  return deepCloneState(st);
}
