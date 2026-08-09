export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: "development" | "test" | "production";
      DATABASE_URL?: string;
      JWT_ACCESS_SECRET?: string;
      JWT_REFRESH_SECRET?: string;
      OTP_PROVIDER?: string;
      OTP_PROVIDER_API_KEY?: string;
      OTP_HASH_SALT?: string;
      GOOGLE_MAPS_API_KEY?: string;
      STORAGE_PROVIDER?: string;
      STORAGE_BUCKET?: string;
      STORAGE_ACCESS_KEY?: string;
      STORAGE_SECRET_KEY?: string;
      STORAGE_LOCAL_DIR?: string;
      LOCATION_PROVIDER?: string;
      RATE_LIMIT_BACKEND?: string;
      PORT?: string;
    }
  }
}
