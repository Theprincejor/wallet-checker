/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // This webpack config is required for wagmi/Reown AppKit SSR compatibility
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

module.exports = nextConfig;