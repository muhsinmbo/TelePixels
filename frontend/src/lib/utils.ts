import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: any) {
  if (!date) return 'N/A';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateId(prefix: string = 'ID') {
  if (prefix === 'MRN') {
    const digits = Math.floor(100000 + Math.random() * 900000);
    return `MRN-${digits}`;
  }
  return `${prefix}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

export function sanitizeDocId(id: string) {
  return id.replace(/\//g, '_');
}

export function formatGhanaPhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  const hasPlus = phone.startsWith('+');
  const cleaned = phone.replace(/\D/g, '');
  
  if (!cleaned) return phone;

  // If it already has a plus and looks like it has a country code (length > 9)
  if (hasPlus && cleaned.length > 9) {
    return `+${cleaned}`;
  }

  // Case 1: Starts with 233 but no plus
  if (cleaned.startsWith('233') && !hasPlus) {
    return `+${cleaned}`;
  }

  // Case 2: Starts with 0 (e.g., 024 123 4567)
  if (cleaned.startsWith('0')) {
    return `+233${cleaned.substring(1)}`;
  }

  // Case 3: Standard Ghana number length without leading 0 (e.g., 241234567)
  if (cleaned.length === 9) {
    return `+233${cleaned}`;
  }

  // Default: if it's longer than a standard local number, assume it has a country code or needs a plus
  if (cleaned.length > 9) {
    return `+${cleaned}`;
  }

  return phone;
}
