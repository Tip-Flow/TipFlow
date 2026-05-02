import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const SW_SCRIPT = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js')
      .then(function (reg) { console.log('[SW] registered', reg.scope); })
      .catch(function (err) { console.warn('[SW] registration failed', err); });
  });
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* PWA manifest + theme */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4169E1" />

        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mise" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        <ScrollViewStyleReset />

        {/* Service worker registration */}
        <script dangerouslySetInnerHTML={{ __html: SW_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
