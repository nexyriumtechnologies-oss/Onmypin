import { registerOtpProvider } from "./index";
import { logger } from "@/lib/logger";

/**
 * Development-only provider: logs the OTP instead of sending an SMS.
 * TODO (Phase 2): implement Msg91OtpProvider / TwilioOtpProvider and register it.
 */
export class ConsoleOtpProvider {
  async sendOtp(mobile: string, code: string): Promise<void> {
    logger.info(`[ConsoleOtpProvider] OTP for ${mobile}: ${code}`, {
      otpProvider: "console",
    });
  }
}

registerOtpProvider("console", () => new ConsoleOtpProvider());
