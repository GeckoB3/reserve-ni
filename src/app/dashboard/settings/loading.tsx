import { PageFrame } from '@/components/ui/dashboard/PageFrame';
import { SettingsPageSkeleton } from './SettingsView';

export default function LoadingSettingsPage() {
  return (
    <PageFrame maxWidthClass="max-w-5xl">
      <SettingsPageSkeleton />
    </PageFrame>
  );
}
