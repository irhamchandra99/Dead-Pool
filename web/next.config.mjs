/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@deadpool/shared"],
  reactStrictMode: true,
  devIndicators: false,
  // Lets `next build` run next to a running dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
