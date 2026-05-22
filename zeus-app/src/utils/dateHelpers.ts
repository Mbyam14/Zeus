/**
 * Return the YYYY-MM-DD string for the Monday of the week at the given offset
 * from the current week. weekOffset=0 is this week; 1 is next week; -1 is last.
 */
export function getMondayDateString(weekOffset: number = 0): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysToMonday + weekOffset * 7);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
