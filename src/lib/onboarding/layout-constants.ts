/** Shared max width for onboarding shell (nav + step card) on desktop. */
export const ONBOARDING_SHELL_MAX_WIDTH_CLASS = 'max-w-4xl';

/** Wider shell for restaurant table / floor-plan setup only. */
export const ONBOARDING_TABLE_SETUP_MAX_WIDTH_CLASS = 'max-w-6xl';

/** Outermost cap in layout so steps never span the full viewport. */
export const ONBOARDING_LAYOUT_MAX_WIDTH_CLASS = ONBOARDING_TABLE_SETUP_MAX_WIDTH_CLASS;

/** Padding for the main onboarding step card. */
export const ONBOARDING_CARD_PADDING_CLASS = 'p-4 sm:p-8';

export function onboardingShellMaxWidthClass(stepKey: string): string {
  return stepKey === 'r_table_setup'
    ? ONBOARDING_TABLE_SETUP_MAX_WIDTH_CLASS
    : ONBOARDING_SHELL_MAX_WIDTH_CLASS;
}
