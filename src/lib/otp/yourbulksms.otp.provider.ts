import { registerOtpProvider } from "./index";
import { logger } from "@/lib/logger";

/**
 * Real SMS OTP delivery via YourBulkSMS (control.yourbulksms.com).
 * Uses the sendhttp API:
 *   http://control.yourbulksms.com/api/sendhttp.php
 *     ?authkey=<key>&mobiles=91<mobile>&message=<text>
 *     &sender=<6-char DLT sender id>&route=2&country=0&DLT_TE_ID=<template id>
 *
 * India TRAI DLT: `sender` + `DLT_TE_ID` must be registered with the provider
 * and the `message` must match the approved template exactly (with the OTP
 * digits in place of the {#var#} placeholder).
 */
export class YourBulkSmsOtpProvider {
  async sendOtp(mobile: string, code: string): Promise<void> {
    const authkey = process.env.YOURBULKSMS_AUTHKEY?.trim();
    const sender = process.env.YOURBULKSMS_SENDER_ID?.trim();
    const dltTeId = process.env.YOURBULKSMS_DLT_TE_ID?.trim();
    const route = process.env.YOURBULKSMS_ROUTE ?? "2";
    const country = process.env.YOURBULKSMS_COUNTRY ?? "0";
    const template =
      process.env.YOURBULKSMS_OTP_TEMPLATE ??
      "Your OwnMyPin OTP is {code}. Valid for 5 minutes. Do not share it.";

    if (!authkey || !sender || !dltTeId) {
      throw new Error(
        "YourBulkSMS provider is not configured: set YOURBULKSMS_AUTHKEY, " +
          "YOURBULKSMS_SENDER_ID and YOURBULKSMS_DLT_TE_ID",
      );
    }

    const message = template.replace("{#var#}", code);
    const url = new URL("http://control.yourbulksms.com/api/sendhttp.php");
    url.searchParams.set("authkey", authkey);
    url.searchParams.set("mobiles", `91${mobile}`);
    url.searchParams.set("message", message);
    url.searchParams.set("sender", sender);
    url.searchParams.set("route", route);
    url.searchParams.set("country", country);
    url.searchParams.set("DLT_TE_ID", dltTeId);

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (err) {
      logger.error("YourBulkSMS request failed", {
        error: err instanceof Error ? err.message : String(err),
        otpProvider: "yourbulksms",
      });
      throw new Error("YourBulkSMS request failed");
    }

    const body = await res.text();
    const trimmed = body.trim();
    // Success comes back as either a plain numeric message id or a JSON
    // envelope like {"Status":"Success","Code":"000","Message-Id":"...","Description":"..."}.
    let isSuccess = res.ok && /^\d+$/.test(trimmed);
    let messageId: string | undefined;
    if (!isSuccess && trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as { Status?: string; "Message-Id"?: string; Code?: string };
        isSuccess = res.ok && parsed?.Status === "Success";
        messageId = parsed?.["Message-Id"];
      } catch {
        isSuccess = false;
      }
    }
    if (!isSuccess) {
      logger.error("YourBulkSMS rejected the OTP", {
        status: res.status,
        response: body.slice(0, 300),
        otpProvider: "yourbulksms",
      });
      throw new Error(`YourBulkSMS send failed (${trimmed.slice(0, 60)})`);
    }

    logger.info(`[YourBulkSmsOtpProvider] OTP sent to ${mobile}`, {
      otpProvider: "yourbulksms",
      messageId: messageId ?? trimmed,
    });
  }
}

registerOtpProvider("yourbulksms", () => new YourBulkSmsOtpProvider());
