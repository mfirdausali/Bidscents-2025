/**
 * Date utility functions for consistent date/time formatting across the application
 */

/**
 * Format a date string or Date object to a localized date string
 * @param date - Date string or Date object
 * @returns Formatted date string in user's locale
 */
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString();
}

/**
 * Format a date string or Date object to a localized time string
 * @param date - Date string or Date object
 * @returns Formatted time string in user's locale (HH:MM format)
 */
export function formatTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a date string or Date object to a localized date and time string
 * @param date - Date string or Date object
 * @returns Formatted date and time string in user's locale
 */
export function formatDateTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString();
}

/**
 * Format a date string or Date object to a localized date and time string with custom format
 * @param date - Date string or Date object
 * @returns Formatted string like "Jan 1, 2024 at 14:30"
 */
export function formatDateTimeNice(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const dateStr = dateObj.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = dateObj.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateStr} at ${timeStr}`;
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 * @param date - Date string or Date object
 * @returns Relative time string
 */
export function getRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (Math.abs(diffSecs) < 60) {
    return diffSecs >= 0 ? 'in a few seconds' : 'a few seconds ago';
  } else if (Math.abs(diffMins) < 60) {
    const mins = Math.abs(diffMins);
    return diffMins >= 0 ? `in ${mins} minute${mins !== 1 ? 's' : ''}` : `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  } else if (Math.abs(diffHours) < 24) {
    const hours = Math.abs(diffHours);
    return diffHours >= 0 ? `in ${hours} hour${hours !== 1 ? 's' : ''}` : `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else {
    const days = Math.abs(diffDays);
    return diffDays >= 0 ? `in ${days} day${days !== 1 ? 's' : ''}` : `${days} day${days !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Check if a date is in the past
 * @param date - Date string or Date object
 * @returns True if the date is in the past
 */
export function isPastDate(date: string | Date): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.getTime() < Date.now();
}

/**
 * Check if a date is in the future
 * @param date - Date string or Date object
 * @returns True if the date is in the future
 */
export function isFutureDate(date: string | Date): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.getTime() > Date.now();
}

/**
 * Get ISO string for storing in database (always UTC)
 * @param date - Date object or undefined
 * @returns ISO string or current time ISO string if date is undefined
 */
export function toISOString(date?: Date): string {
  return (date || new Date()).toISOString();
}