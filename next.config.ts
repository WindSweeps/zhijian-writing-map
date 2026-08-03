import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isGitHubPages ? "/zhijian-writing-map" : "",
  assetPrefix: isGitHubPages ? "/zhijian-writing-map/" : "",
};

export default nextConfig;
