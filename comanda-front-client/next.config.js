/** @type {import('next').NextConfig} */
const backendProxyTarget = process.env.BACKEND_PROXY_TARGET || "http://127.0.0.1:8001";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${backendProxyTarget}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
