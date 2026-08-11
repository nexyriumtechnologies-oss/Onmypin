import { logger } from "@/lib/logger";

export interface PushPayload {
  token: string;
  title: string;
  message: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  success: boolean;
  errorCode?: string;
}

/**
 * Push channel abstraction. Module 4 ships ConsolePushProvider only;
 * an FCM/Razorpay-backed implementation is a drop-in later (swap the
 * factory in getPushProvider and keep the interface unchanged).
 */
export interface PushProvider {
  readonly name: string;
  send(payload: PushPayload): Promise<PushSendResult>;
}

function maskToken(token: string): string {
  if (token.length <= 12) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

/** Best-effort console transport — used for local/development only. */
export class ConsolePushProvider implements PushProvider {
  readonly name = "console";

  async send(payload: PushPayload): Promise<PushSendResult> {
    logger.info(
      `[push:console] ${payload.title} -> ${maskToken(payload.token)}`,
      {
        type: payload.type,
        message: payload.message,
        token: payload.token ? `${payload.token.slice(0, 6)}…` : "",
        data: payload.data,
      },
    );
    return { success: true };
  }
}

const PROVIDERS: Record<string, () => PushProvider> = {
  console: () => new ConsolePushProvider(),
};

/**
 * Returns the configured push provider (env `PUSH_PROVIDER`, default
 * "console"). Unsupported values fail fast so a misconfigured deployment
 * surfaces immediately instead of silently sending nothing.
 */
export function getPushProvider(): PushProvider {
  const name = process.env.PUSH_PROVIDER?.trim() || "console";
  const factory = PROVIDERS[name];
  if (!factory) {
    throw new Error(
      `PUSH_PROVIDER "${name}" is not supported yet — only "console" is wired in Module 4`,
    );
  }
  return factory();
}