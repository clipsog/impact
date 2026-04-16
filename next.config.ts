import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native/binary deps out of the bundle so paths like youtube-dl-exec/bin resolve at runtime on Render.
  serverExternalPackages: ["@distube/ytdl-core", "youtube-dl-exec"],
};

export default nextConfig;
