import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getAlbums, getAllTags, getPhotos } from '@/lib/api';
import Nav from '@/lib/nav';
import { getTags, targetSlugFromTag } from '@/app/[slug]/chip';

const Masonry = dynamic(() => import('@/lib/images/masonry'), {
  ssr: false
});

export async function generateStaticParams() {
  const start = 2012;
  const end = new Date().getFullYear();
  const yearSlugs = Array.from({ length: end - start + 1 }, (_, i) =>
    (start + i).toString()
  );

  const [allTags, albums] = await Promise.all([getAllTags(), getAlbums()]);
  const albumChipSlugs = albums.flatMap(album =>
    getTags(album).map(tag => decodeURIComponent(targetSlugFromTag(tag)))
  );

  const combined = new Set<string>([
    ...yearSlugs,
    ...allTags.map(t => t.tag),
    ...albumChipSlugs
  ]);

  return Array.from(combined)
    .filter(Boolean)
    .map(slug => ({ slug }));
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

      <div className="flex-1 flex flex-col max-sm:px-2">
        <div className="mt-12 flex flex-wrap items-center gap-2">
          <div
            className={`inline-block px-2.5 py-1
            border-dashed border border-gray-300 rounded-md
            bg-gray-100 text-gray-700 font-medium`}
          >
            {decodedSlug}
          </div>

          <div className="flex flex-wrap gap-1.5 ml-2">
            {allTags.map(({ tag }) => {
              const isCurrent = tag.toLowerCase() === decodedSlug.toLowerCase();
              if (isCurrent) return null;
              return (
                <Link
                  key={tag}
                  href={`/tags/${encodeURIComponent(tag)}`}
                  prefetch={false}
                  className="px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {tag}
                </Link>
              );
            })}
          </div>
        </div>

        <Masonry className="my-6" items={photos} />
      </div>
    </section>
  );
}

export default Tag;
