import { Html, Head, Main, NextScript } from "next/document";

/**
 * Custom Pages Router document — required to prevent the
 * "<Html> should not be imported outside of pages/_document" error
 * during `next build` on Linux (e.g., Render) for the fallback /404 page.
 * This project is a pure API backend; only the 404 fallback uses Pages Router.
 */
export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
