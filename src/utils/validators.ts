/* ============================================================
   Varchaz — Validators
   ============================================================ */

/** Validate email format */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate password strength (min 8 chars, 1 uppercase, 1 number) */
export function isValidPassword(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true, message: '' };
}

/** Validate display name */
export function isValidName(name: string): boolean {
  return name.trim().length >= 2;
}

/** Validate numeric input (non-negative integer or zero) */
export function isValidNumericInput(value: string): boolean {
  if (value === '' || value === '0') return true;
  return /^[0-9]+$/.test(value) && Number(value) >= 0;
}

/** Parse numeric input, returns 0 for empty/invalid */
export function parseNumericInput(value: string): number {
  const num = parseInt(value, 10);
  return isNaN(num) || num < 0 ? 0 : num;
}

/** Validate phone number (optional field) */
export function isValidPhone(phone: string): boolean {
  if (!phone) return true; // optional
  return /^[+]?[0-9]{10,15}$/.test(phone.replace(/[\s-]/g, ''));
}
