import type { Metadata } from 'next';
import { HelpLayoutShell } from '@/components/help/HelpLayoutShell';

export const metadata: Metadata = {
  title: 'Help',
  description:
    'ReserveNI product documentation and troubleshooting — restaurants, appointments, settings, and common issues.',
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <HelpLayoutShell>{children}</HelpLayoutShell>;
}
