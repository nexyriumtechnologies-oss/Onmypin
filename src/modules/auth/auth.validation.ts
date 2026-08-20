import { z } from "zod";

export const mobileSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Must be a valid 10-digit Indian mobile number");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit");

export const sendOtpSchema = z
  .object({
    mobile: mobileSchema,
    purpose: z.enum(["AUTH", "REGISTER"]).default("AUTH"),
  })
  .strict();

export const verifyOtpSchema = z
  .object({
    mobile: mobileSchema,
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
    purpose: z.enum(["AUTH", "REGISTER"]).default("AUTH"),
    deviceInfo: z.string().max(255).optional(),
  })
  .strict();

export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1, "refreshToken is required"),
  })
  .strict();

// ---- Register flow ----

export const registerInitSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    email: z.string().email("Must be a valid email address"),
    mobile: mobileSchema,
    password: passwordSchema,
  })
  .strict();

export const registerVerifySchema = z
  .object({
    mobile: mobileSchema,
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
    deviceInfo: z.string().max(255).optional(),
  })
  .strict();

// ---- Login flow ----

export const loginSchema = z
  .object({
    mobile: mobileSchema,
    password: z.string().min(1, "Password is required"),
    deviceInfo: z.string().max(255).optional(),
  })
  .strict();

