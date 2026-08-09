import { z } from "zod";

export const mobileSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Must be a valid 10-digit Indian mobile number");

export const sendOtpSchema = z
  .object({
    mobile: mobileSchema,
    purpose: z.enum(["AUTH"]).default("AUTH"),
  })
  .strict();

export const verifyOtpSchema = z
  .object({
    mobile: mobileSchema,
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
    purpose: z.enum(["AUTH"]).default("AUTH"),
    deviceInfo: z.string().max(255).optional(),
  })
  .strict();

export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1, "refreshToken is required"),
  })
  .strict();
