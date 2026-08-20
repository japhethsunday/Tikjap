export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type FieldErrors<T> = Partial<Record<keyof T | "form", string>>;

export interface ValidationResult<T = unknown> {
  ok: boolean;
  errors: FieldErrors<T>;
  values?: T;
}

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function passwordStrength(password: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
} {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) score += 1;
  const labels = ["Too short", "Weak", "Good", "Strong"] as const;
  return { score: score as 0 | 1 | 2 | 3, label: labels[Math.min(score, 3)] };
}

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Email is required.";
  if (!isEmail(value)) return "Enter a valid email address.";
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (!value) return "Password is required.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  return undefined;
}

export function validateName(value: string): string | undefined {
  if (!value.trim()) return "Name is required.";
  if (value.trim().length < 2) return "Name must be at least 2 characters.";
  return undefined;
}

export interface SignupFormValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function validateSignup(values: SignupFormValues): FieldErrors<SignupFormValues> {
  const errors: FieldErrors<SignupFormValues> = {};
  const nameError = validateName(values.name);
  const emailError = validateEmail(values.email);
  const passwordError = validatePassword(values.password);
  if (nameError) errors.name = nameError;
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  if (!passwordError && values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}

export interface LoginFormValues {
  email: string;
  password: string;
}

export function validateLogin(values: LoginFormValues): FieldErrors<LoginFormValues> {
  const errors: FieldErrors<LoginFormValues> = {};
  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;
  if (!values.password) errors.password = "Password is required.";
  return errors;
}

export interface ForgotPasswordValues {
  email: string;
}

export function validateForgotPassword(values: ForgotPasswordValues): FieldErrors<ForgotPasswordValues> {
  const errors: FieldErrors<ForgotPasswordValues> = {};
  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;
  return errors;
}

export interface ResetPasswordValues {
  password: string;
  confirmPassword: string;
}

export function validateResetPassword(values: ResetPasswordValues): FieldErrors<ResetPasswordValues> {
  const errors: FieldErrors<ResetPasswordValues> = {};
  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;
  if (!passwordError && values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}

export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function validateChangePassword(values: ChangePasswordValues): FieldErrors<ChangePasswordValues> {
  const errors: FieldErrors<ChangePasswordValues> = {};
  if (!values.currentPassword) errors.currentPassword = "Enter your current password.";
  const newError = validatePassword(values.newPassword);
  if (newError) errors.newPassword = newError;
  if (!newError && values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}

export function validateAccountName(name: string): string | undefined {
  if (!name.trim()) return "Name is required.";
  if (name.trim().length < 2) return "Name must be at least 2 characters.";
  return undefined;
}

export function validateAccountEmail(email: string): string | undefined {
  return validateEmail(email);
}