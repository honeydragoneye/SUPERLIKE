import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the OAuth redirect URI is registered on 127.0.0.1, so dev traffic
  // arrives from that host rather than localhost
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      // Spotify album artwork
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "mosaic.scdn.co" },
      { protocol: "https", hostname: "image-cdn-ak.spotifycdn.com" },
      { protocol: "https", hostname: "image-cdn-fa.spotifycdn.com" },
    ],
  },
};

export default nextConfig;
