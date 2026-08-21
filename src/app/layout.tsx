/**
 * Minimal root layout — required by Next.js App Router even for pure-API projects.
 * No UI is rendered; all user-facing routes are API routes (route.ts handlers).
 */
export const metadata = {
  title: "OwnMyPin API",
  description: "OwnMyPin backend API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
