// Maps PostgreSQL error codes → safe client-facing messages.
// Never lets table names, column names, SQL, or stack traces reach the HTTP response.

const PG_MESSAGES = {
  // Integrity constraints
  '23505': 'A record with these details already exists.',
  '23503': 'This action cannot be completed because related records still exist.',
  '23502': 'A required field is missing.',
  '23514': 'The provided value is not allowed.',
  '23001': 'This record is still referenced elsewhere and cannot be removed.',

  // Input errors
  '22P02': 'Invalid input format.',
  '22003': 'A numeric value is out of the allowed range.',
  '22008': 'Invalid date or time value.',

  // Auth / connection
  '28P01': 'Authentication failed.',
  '28000': 'Authentication failed.',

  // Schema errors (never expose table/column names)
  '42P01': 'A configuration error occurred.',
  '42703': 'A configuration error occurred.',
  '42601': 'A configuration error occurred.',

  // Resource / availability
  '53300': 'The server is temporarily overloaded. Please try again.',
  '57P01': 'The server is temporarily unavailable.',
  '57P02': 'The server is temporarily unavailable.',
  '57P03': 'The server is temporarily unavailable.',
};

/**
 * Returns a safe message for a caught error.
 * In production: PG codes → mapped string, everything else → generic.
 * In development: falls through to the raw message so devs still see detail in the console.
 */
export function sanitizeError(err) {
  // Always log the full error server-side
  if (err?.code) {
    const mapped = PG_MESSAGES[err.code];
    if (mapped) return mapped;
    // Unknown PG code — safe generic, never expose the raw message
    return 'A database error occurred.';
  }

  // Non-PG operational errors (network, timeout, etc.)
  // In production expose nothing; in dev expose the message for debugging
  if (process.env.NODE_ENV === 'production') {
    return 'An internal error occurred.';
  }
  return err?.message ?? 'An internal error occurred.';
}
