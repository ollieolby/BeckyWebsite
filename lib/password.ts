// One place for what counts as an acceptable password, so the browser and the
// server cannot disagree about it.
//
// Length does far more for a password than a zoo of character classes, and
// rules that demand a symbol mostly produce Password1! — so this asks for
// length, refuses the handful of things people actually type, and leaves the
// rest to them and their password manager.
export const MIN_PASSWORD = 10;

const OBVIOUS = [
  'password', 'passw0rd', '1234567890', 'qwertyuiop', 'letmein',
  'becky', 'cormorant', 'drakar', 'boat', 'thames',
];

export function passwordProblem(password: string, email = ''): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return 'That is longer than 200 characters.';
  if (!password.trim()) return 'That is only spaces.';
  const lower = password.toLowerCase();
  if (OBVIOUS.some(word => lower === word || lower.startsWith(word))) return 'That is too easy to guess. Try a few unrelated words.';
  const name = email.split('@')[0]?.toLowerCase();
  if (name && name.length > 2 && lower.includes(name)) return 'Do not use your email address in your password.';
  return null;
}
