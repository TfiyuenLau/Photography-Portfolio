import { getFolder, getFolders } from '@/lib/api';
import { titleToSlug } from '@/lib/api/slug';
import Grid from '@/lib/images/pig-grid';
import Link from 'next/link';

export async function generateStaticParams() {
  const folders = await getFolders();
  return folders.map(folder => ({
    slug: titleToSlug(folder.title, folder.slug)
  }));
}

async function Folder({ params: { slug } }: { params: { slug: string } }) {
  const { folder, photos } = await getFolder(slug);

  return (
    <section className="flex flex-col justify-center sm:flex-row sm:my-20 sm:mt-48">
      <div className="max-sm:px-2 px-4 w-full max-w-6xl">
        <div className="mb-16">
          <h1
            id="top"
            className="font-semibold tracking-tight text-4xl mb-2 w-full"
          >
            {folder.title}
          </h1>
          {folder.description && (
            <p className="text-gray-400 text-sm">{folder.description}</p>
          )}
        </div>

        <Grid items={photos} />

        <div className="flex justify-between items-center text-gray-400 hover:text-gray-600 mt-12">
          <a href="#top">↑ 返回顶部</a>
          <Link href="/folders">← 返回全部归档</Link>
        </div>
      </div>
    </section>
  );
}

export default Folder;
