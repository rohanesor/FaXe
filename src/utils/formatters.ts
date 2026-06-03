/**
 * Formats a timestamp as a human-readable relative time (e.g. "2 hours ago", "Just now").
 */
export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  
  if (diff < 60000) {
    return 'Just now';
  }
  
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) {
    return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  }
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

/**
 * Formats duration milliseconds into days, hours, and minutes.
 */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0 minutes';
  
  let seconds = Math.floor(ms / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  minutes %= 60;
  hours %= 24;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} day${days > 1 ? 's' : ''}`);
  }
  if (hours > 0) {
    parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
  }

  return parts.join(' ') || '0 minutes';
}

/**
 * Formats a timestamp into an audit-friendly pattern: "Jun 3, 2026 — 14:32:05".
 */
export function formatTimestamp(timestamp: number): string {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  const pad = (num: number) => num.toString().padStart(2, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${month} ${day}, ${year} — ${hours}:${minutes}:${seconds}`;
}

/**
 * Formats a similarity score (0 - 1) into percentage text (e.g. "94.3%").
 */
export function formatConfidence(score: number): string {
  const percentage = (score || 0) * 100;
  return `${percentage.toFixed(1)}%`;
}
