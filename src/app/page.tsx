import dynamic from 'next/dynamic';
import './globals.css';
import { getAlbums, getSiteConfig } from '@/lib/api';

const ChinaMapScene = dynamic(() => import('@/lib/map/china-map-scene'), {
  ssr: false
});

export default async function Page() {
  const [albums, siteConfig] = await Promise.all([
    getAlbums(),
    getSiteConfig()
  ]);

  return (
    <main role="main">
      <ChinaMapScene
        albums={albums}
        photographerName={siteConfig.photographerName}
        copyrightName={siteConfig.copyrightName}
      />
    </main>
  );
}
