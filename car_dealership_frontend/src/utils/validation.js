/* Simple validation utilities for inline form errors. */

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const PHONE_RE =
  /^[+()\-.\s\d]{7,}$/;

// PUBLIC_INTERFACE
export function validateRequired(value) {
  /** Validate that a value is present. Returns error message or empty string. */
  if (typeof value !== "string") return "This field is required.";
  if (!value.trim()) return "This field is required.";
  return "";
}

// PUBLIC_INTERFACE
export function validateEmail(value) {
  /** Validate email format. Returns error message or empty string. */
  const req = validateRequired(value);
  if (req) return req;
  if (!EMAIL_RE.test(value.trim())) return "Enter a valid email address.";
  return "";
}

// PUBLIC_INTERFACE
export function validatePhoneOptional(value) {
  /** Validate phone only if provided. Returns error message or empty string. */
  const v = (value || "").trim();
  if (!v) return "";
  if (!PHONE_RE.test(v)) return "Enter a valid phone number.";
  return "";
}

// PUBLIC_INTERFACE
export function validateMinLen(value, min, fieldName = "This field") {
  /** Validate minimum length. Returns error message or empty string. */
  const v = (value || "").trim();
  if (v.length < min) return `${fieldName} must be at least ${min} characters.`;
  return "";
}
