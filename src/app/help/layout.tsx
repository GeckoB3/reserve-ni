import type { Metadata } from 'next';
import { HelpLayoutShell } from '@/components/help/HelpLayoutShell';

export const metadata: Metadata = {
  title: 'Help',
  description:
    'ReserveNI help: restaurant and appointment booking, settings, Stripe, communications, reports, and troubleshooting.',
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <HelpLayoutShell>{children}</HelpLayoutShell>;
}
