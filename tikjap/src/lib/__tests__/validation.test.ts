import { describe, it, expect } from "vitest";
import {
  validateLogin,
  validateSignup,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  passwordStrength,
  isEmail,
} from "@/lib/validation";

describe("passwordStrength", () => {
  it("flags short passwords", () => {
    expect(passwordStrength("abc").label).toBe("Too short");
  });
  it("scores longer, mixed passwords higher", () => {
    expect(passwordStrength("Abcdefg1").score).toBeGreaterThanOrEqual(2);
  });
});

describe("validateLogin", () => {
  it("accepts valid credentials", () => {
    expect(validateLogin({ email: "a@b.com", password: "password" })).toEqual({});
  });
  it("rejects bad email", () => {
    const errors = validateLogin({ email: "nope", password: "password" });
    expect(errors.email).toBeTruthy();
  });
  it("rejects missing password", () => {
    const errors = validateLogin({ email: "a@b.com", password: "" });
    expect(errors.password).toBe("Password is required.");
  });
});

describe("validateSignup", () => {
  it("requires matching passwords", () => {
    const errors = validateSignup({ name: "Jane", email: "a@b.com", password: "password", confirmPassword: "mismatch" });
    expect(errors.confirmPassword).toBe("Passwords do not match.");
  });
  it("requires a valid name", () => {
    const errors = validateSignup({ name: "J", email: "a@b.com", password: "password", confirmPassword: "password" });
    expect(errors.name).toBeTruthy();
  });
  it("accepts a valid signup", () => {
    const errors = validateSignup({ name: "Jane", email: "a@b.com", password: "password", confirmPassword: "password" });
    expect(errors).toEqual({});
  });
});

describe("validateForgotPassword", () => {
  it("accepts valid email", () => {
    expect(validateForgotPassword({ email: "a@b.com" })).toEqual({});
  });
  it("rejects invalid email", () => {
    expect(validateForgotPassword({ email: "x" }).email).toBeTruthy();
  });
});

describe("validateResetPassword", () => {
  it("rejects short passwords", () => {
    const errors = validateResetPassword({ password: "short", confirmPassword: "short" });
    expect(errors.password).toBeTruthy();
  });
  it("rejects mismatched confirmations", () => {
    const errors = validateResetPassword({ password: "password", confirmPassword: "different" });
    expect(errors.confirmPassword).toBe("Passwords do not match.");
  });
});

describe("validateChangePassword", () => {
  it("requires the current password", () => {
    const errors = validateChangePassword({ currentPassword: "", newPassword: "password", confirmPassword: "password" });
    expect(errors.currentPassword).toBeTruthy();
  });
  it("accepts valid input", () => {
    const errors = validateChangePassword({ currentPassword: "old-password", newPassword: "new-password", confirmPassword: "new-password" });
    expect(errors).toEqual({});
  });
});

describe("isEmail", () => {
  it("accepts standard emails", () => {
    expect(isEmail("jane@example.com")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isEmail("not-an-email")).toBe(false);
    expect(isEmail("")).toBe(false);
  });
});