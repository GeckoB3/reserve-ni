import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin, type VenueStaff } from '@/lib/venue-auth';
import { NextResponse } from 'next/server';

export type ImportAdminContext = {
  staff: VenueStaff & { role: 'admin' };
};

export async function requireImportAdmin(): Promise<
  ImportAdminContext | { response: NextResponse }
> {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) {
    return { response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) };
  }
  if (!requireAdmin(staff)) {
    return { response: NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 }) };
  }
  return { staff };
}
