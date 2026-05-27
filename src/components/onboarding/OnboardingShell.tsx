import type { ReactNode } from 'react';
import { onboardingShellMaxWidthClass } from '@/lib/onboarding/layout-constants';

interface OnboardingShellProps {
  children: ReactNode;
  /** Omit on loading/error states (defaults to standard width). */
  stepKey?: string;
}

/**
 * Centers onboarding step content and caps width on large screens.
 * Parent layout should use flex-col + items-center (see onboarding layout).
 */
export function OnboardingShell({ children, stepKey }: OnboardingShellProps) {
  const maxWidthClass = onboardingShellMaxWidthClass(stepKey ?? '');

  return (
    <div className={`box-border w-full min-w-0 shrink-0 ${maxWidthClass}`}>{children}</div>
  );
}
