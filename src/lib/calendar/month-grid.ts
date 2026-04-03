/** Monday-first month grid cells (null = padding). Matches StaffLeaveCalendarPanel. */
export function monthGrid(year: number, monthIndex: number): (number | null)[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function ymd(year: number, monthIndex: number, day: number): string {
  const m = monthIndex + 1;
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
