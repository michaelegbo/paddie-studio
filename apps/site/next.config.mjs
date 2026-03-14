import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@paddie-studio/ui'],
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
};

export default nextConfig;
