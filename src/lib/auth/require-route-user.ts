import type { User } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export async function requireRouteUser(request: Request): Promise<User | null> {
  const supabase = await createRouteHandlerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
