import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@morrow/config", "@morrow/core"],
  poweredByHeader: false,
};

export default config;
