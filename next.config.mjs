/** @type {import('next').NextConfig} */
const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  ...(isStaticExport ? { output: 'export', basePath } : {}),
  images: {
    unoptimized: isStaticExport,
    domains: ['images.ctfassets.net', 'downloads.ctfassets.net']
  }
};

export default nextConfig;
