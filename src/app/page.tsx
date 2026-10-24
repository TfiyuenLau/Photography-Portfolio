import dynamic from 'next/dynamic';
import './globals.css';
import { getAlbums, getSiteConfig } from '@/lib/api';

const Globe = dynamic(() => import('@/lib/globes/globe'), {
  ssr: false
});

export default async function Page() {
  const [albums, siteConfig] = await Promise.all([
    getAlbums(),
    getSiteConfig()
  ]);

  return (
    <main role="main">
      <Globe
        albums={albums}
        photographerName={siteConfig.photographerName}
        copyrightName={siteConfig.copyrightName}
      />
    </main>
  );
}
