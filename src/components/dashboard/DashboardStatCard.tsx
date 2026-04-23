'use client';

import type { ReactNode } from 'react';
import type { DashboardStatColor } from '@/components/dashboard/dashboard-stat-types';
import { StatTile } from '@/components/ui/dashboard/StatTile';

export type { DashboardStatColor } from '@/components/dashboard/dashboard-stat-types';

/**
 * Matches the stat tiles on dashboard/bookings for visual consistency.
 */
export function DashboardStatCard({
  label,
  value,
  color,
  subValue,
  subValue2,
  trend,
  icon,
  sparklineValues,
}: {
  /** Omit or leave empty to hide the footer line (e.g. next-bookings tile). */
  label?: string;
  value: string | number;
  color: DashboardStatColor;
  /** Optional smaller line under the main value (e.g. percentage). */
  subValue?: string;
  /** Optional second line under subValue. */
  subValue2?: string;
  trend?: string;
  icon?: ReactNode;
  sparklineValues?: number[];
}) {
  return (
    <StatTile
      label={label}
      value={value}
      color={color}
      subValue={subValue}
      subValue2={subValue2}
      trend={trend}
      icon={icon}
      sparklineValues={sparklineValues}
    />
  );
}
