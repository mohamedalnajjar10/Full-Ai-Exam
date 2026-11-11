import type { NextConfig } from "next";

/**
 * الباك اند (NestJS) بيشتغل كبروسيس منفصل. منمرّر عليه عبر rewrite حتى
 * المتصفح يشوف origin واحد بس: لا CORS preflight، والكوكيز بتشتغل كـ
 * same-site بدون sameSite:"none".
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8088";

const nextConfig: NextConfig = {
  // turbopack.root مش مضبوط عمداً: مع npm workspaces صار package-lock.json
  // بجذر المونوريبو، وNext بيلقط الجذر لحاله. لو ثبّتناه على apps/web
  // بتصير packages/types برّا الجذر وما بتنحل.

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: new URL(API_ORIGIN).protocol.replace(":", "") as "http" | "https",
        hostname: new URL(API_ORIGIN).hostname,
        port: new URL(API_ORIGIN).port || undefined,
        pathname: "/api/v1/**",
      },
    ],
  },

  experimental: {
    // بيخزّن ناتج الكومبايل على القرص بين التشغيلات — أسرع بكثير بالـ dev.
    turbopackFileSystemCacheForDev: true,
  },
};

export default nextConfig;
