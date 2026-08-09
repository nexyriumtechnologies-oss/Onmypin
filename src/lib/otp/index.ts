/**
 * OTP provider abstraction.
 * The auth flow only depends on this interface — swap in Twilio/MSG91/AWS SNS
 * later by adding a provider and setting OTP_PROVIDER, no auth changes needed.
 */
export interface OtpProvider {
  sendOtp(mobile: string, code: string): Promise<void>;
}

type OtpProviderFactory = () => OtpProvider;

const registry = new Map<string, OtpProviderFactory>();

export function registerOtpProvider(name: string, factory: OtpProviderFactory) {
  registry.set(name, factory);
}

export function getOtpProvider(): OtpProvider {
  const name = process.env.OTP_PROVIDER ?? "console";
  const factory = registry.get(name);
  if (!factory) {
    throw new Error(
      `OTP provider "${name}" is not registered. Available: ${[...registry.keys()].join(", ")}`,
    );
  }
  return factory();
}
