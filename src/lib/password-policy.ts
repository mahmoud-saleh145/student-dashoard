/**
 * The new-password policy, mirrored from the backend
 * (`edu-backend/src/modules/auth/password-policy.ts`), which is the authority.
 * Checking it here means an administrator learns what is wrong before the
 * request is sent; the API applies the same rule to whatever arrives.
 *
 *   - 8 to 128 characters, never trimmed;
 *   - an uppercase and a lowercase Latin letter, or an Arabic letter (Arabic
 *     has no case, so one Arabic letter counts as both);
 *   - a digit, Western or Arabic-Indic;
 *   - not trivially guessable: not a well-known password, at least five
 *     different characters, and not a number with a letter or two attached
 *     ("Aa123456").
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_POLICY_HINT =
  '8–128 characters, with an uppercase and a lowercase letter (an Arabic letter counts as both) and a digit. Avoid common patterns such as Aa123456.';

const LATIN_LOWER = /[a-z]/;
const LATIN_UPPER = /[A-Z]/;
const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u;
const DIGIT = /[0-9٠-٩۰-۹]/;
const LETTER = /\p{L}/u;

const COMMON_PASSWORDS = new Set([
  'password1',
  'password12',
  'password123',
  'password1234',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword1',
  'qwerty123',
  'qwerty1234',
  'qwertyuiop1',
  'welcome1',
  'welcome123',
  'admin123',
  'admin1234',
  'admin@123',
  'abc12345',
  'abc123456',
  'abcd1234',
  'abcde123',
  'iloveyou1',
  'letmein1',
  'student1',
  'student123',
  'teacher1',
  'teacher123',
]);

/** Why the value is not an acceptable new password, or null when it is. */
export function newPasswordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    return `Use between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`;
  }

  const arabic = ARABIC_LETTER.test(value);
  if (!(LATIN_LOWER.test(value) || arabic) || !(LATIN_UPPER.test(value) || arabic)) {
    return 'Include an uppercase and a lowercase letter (an Arabic letter counts as both).';
  }
  if (!DIGIT.test(value)) return 'Include a digit.';

  const chars = Array.from(value);
  const letters = chars.filter((c) => LETTER.test(c)).length;
  const digits = chars.filter((c) => DIGIT.test(c)).length;
  if (
    COMMON_PASSWORDS.has(value.toLowerCase()) ||
    new Set(chars).size < 5 ||
    (letters <= 2 && digits >= 6)
  ) {
    return 'This password is too easy to guess. Choose a less common one.';
  }

  return null;
}
