'use client';

import { useState } from 'react';
import { SetPasswordBanner } from './SetPasswordBanner';

export function SetPasswordBannerWrapper({ showBanner }: { showBanner: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (!showBanner || dismissed) return null;
  return <SetPasswordBanner onDismiss={() => setDismissed(true)} />;
}
