/** Shape subset of `venues.deposit_config` / settings JSON. */
export interface DepositConfigLike {
  enabled?: boolean;
  online_requires_deposit?: boolean;
  phone_requires_deposit?: boolean;
}

export interface VenueUsesDepositWorkflowOpts {
  /** Table venues on the service engine use per-service deposits; still show deposit comms templates. */
  serviceEngineTable?: boolean;
}

/** True when the venue may send deposit request / confirmation comms (online, phone, or staff pay-by-link). */
export function venueUsesDepositWorkflow(
  dc: DepositConfigLike | null | undefined,
  opts?: VenueUsesDepositWorkflowOpts,
): boolean {
  if (opts?.serviceEngineTable) return true;
  if (!dc) return false;
  return Boolean(dc.enabled || dc.online_requires_deposit || dc.phone_requires_deposit);
}
