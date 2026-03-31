import { redirect } from 'next/navigation';

/** Bookmarks and old links: guest management lives under Reports → Clients. */
export default function GuestsPage() {
  redirect('/dashboard/reports?tab=clients');
}
