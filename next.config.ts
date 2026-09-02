import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // Native and worker-loading packages used by the document reader. The
  // bundler cannot place @napi-rs/canvas's .node binary in an ESM chunk, and
  // pdfjs resolves its worker from disk at runtime, so both have to be left
  // as real node_modules requires on the server.
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'sharp'],
};

export default nextConfig;
