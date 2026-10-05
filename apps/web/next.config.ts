import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@morrow/config", "@morrow/core", "@morrow/bitget"],
  poweredByHeader: false,
};

export default config;
