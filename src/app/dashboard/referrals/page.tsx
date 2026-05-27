import { redirect } from 'next/navigation';

/** Refer & Earn lives under Settings (admin only). */
export default function ReferralsPage() {
  redirect('/dashboard/settings?tab=refer-earn');
}
