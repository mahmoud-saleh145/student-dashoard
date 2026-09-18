import type { NextConfig } from 'next';

/**
 * The dashboard is a back-office application, not a public site: it is served
 * to a handful of authenticated staff, never indexed, and every byte of data
 * it renders comes from the API at request time.
 *
 * `output: 'standalone'` is deliberately NOT set here. It produces a smaller
 * container image, but it also makes `next start` refuse to run — the server
 * has to be launched as `node .next/standalone/server.js` instead. Leaving it
 * off keeps `npm run build && npm start` working exactly as the README says;
 * see the README's deployment notes for turning it on for Docker.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // The API base URL is read server-side (see src/lib/config.ts). It is
  // deliberately NOT a NEXT_PUBLIC_ variable: the browser never talks to the
  // backend directly, it talks to this app's own proxy route, so the backend's
  // address does not need to be public and access tokens never leave the
  // server.
  env: {},

  eslint: {
    // Linting runs as its own step (`npm run lint`) so a lint failure is
    // reported as a lint failure rather than as a mysterious build failure.
    ignoreDuringBuilds: true,
  },

  typescript: {
    // Type errors must fail the build. Never set this to true.
    ignoreBuildErrors: false,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
