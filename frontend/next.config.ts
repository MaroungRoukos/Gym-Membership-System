import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Improves dev HMR / chunk serving on some Windows setups when env is set. */
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer && process.env.WATCHPACK_POLLING === "1") {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
