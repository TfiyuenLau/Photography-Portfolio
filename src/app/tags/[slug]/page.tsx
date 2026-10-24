import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getAlbums, getAllTags, getPhotos } from '@/lib/api';
import Nav from '@/lib/nav';

const Masonry = dynamic(() => import('@/lib/images/masonry'), {
  ssr: false
});

export async function generateStaticParams() {
  const start = 2015;
  const end = new Date().getFullYear();
  const yearSlugs = Array.from({ length: end - start + 1 }, (_, i) =>
    (start + i).toString()
  );

  const allTags = await getAllTags();
  const combined = new Set<string>([
    ...yearSlugs,
    ...allTags.map(t => t.tag)
  ]);

  return Array.from(combined).map(slug => ({ slug }));
}

async function Tag({ params: { slug } }: { params: { slug: string } }) {
  const decodedSlug = decodeURIComponent(slug);
  const [albums, photos, allTags] = await Promise.all([
    getAlbums(),
    getPhotos(decodedSlug),
    getAllTags()
  ]);

  return (
    <section className="flex flex-col sm:flex-row sm:my-20" id="top">
      <div className="pt-10 sm:pl-10 sm:pr-20 lg:pl-20 lg:pr-40 space-y-1">
        <Nav albums={albums} />
      </div>

      <div className="flex-1 flex flex-col max-sm:px-2 mt-6 max-w-5xl">
        <div className="rounded-lg bg-gray-100 px-5 py-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 border border-dashed border-red-300 rounded-md bg-white text-red-800 font-medium text-lg">
                #{decodedSlug}
              </span>
              <span className="text-sm text-gray-500">
                共找到 {photos.length} 张相关摄影作品
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-200/80">
            {allTags.map(({ tag, count }) => {
              const isCurrent = tag.toLowerCase() === decodedSlug.toLowerCase();
              return (
                <Link
                  key={tag}
                  href={`/tags/${encodeURIComponent(tag)}`}
                  prefetch={false}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    isCurrent
                      ? 'bg-red-700 text-white font-medium'
                      : 'bg-white/80 text-gray-600 hover:bg-white hover:text-black border border-gray-200'
                  }`}
                >
                  #{tag} {count > 0 ? `(${count})` : ''}
                </Link>
              );
            })}
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="py-20 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl my-6">
            暂未找到带有「#{decodedSlug}」标签的作品，请点击上方其他标签浏览。
          </div>
        ) : (
          <Masonry className="my-6" items={photos} />
        )}
      </div>
    </section>
  );
}

export default Tag;
