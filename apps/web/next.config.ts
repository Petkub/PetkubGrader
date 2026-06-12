import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone", // for slim docker image
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google avatars
      { protocol: "https", hostname: "avatars.githubusercontent.com" }, // GitHub avatars
    ],
  },
};

export default config;
