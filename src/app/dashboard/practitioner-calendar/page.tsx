import { redirect } from 'next/navigation';

/** @deprecated Use /dashboard/calendar */
export default function LegacyPractitionerCalendarPage() {
  redirect('/dashboard/calendar');
}
