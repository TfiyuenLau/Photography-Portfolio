import { Album } from '@/types';
import Link from 'next/link';

type Tag = string;

export function getTags(
  album: Pick<Album, 'date' | 'description' | 'locations' | 'tags'>
) {
  const tags: Array<string | null | undefined> = [];
  if (album.date) tags.push(album.date);
  if (album.tags) {
    tags.push(...album.tags);
  }
  for (const location of album.locations) {
    if (location.description) tags.push(location.description);
    if (location.date) tags.push(location.date);
  }
  if (album.description && !album.description.includes('·')) {
    tags.push(album.description);
  }
  return Array.from(new Set(tags.filter(Boolean))) as string[];
}

function dateFromTag(tag: Tag) {
  return tag?.match(/(?:^20|[^\d]20)\d{2}/g)?.[0]?.trim();
}

export function TagChip({ tag }: { tag: Tag }) {
  const date = dateFromTag(tag);
  const targetSlug = date || encodeURIComponent(tag.split(' ')[0].trim());

  return (
    <Link
      key={tag}
      href={`/tags/${targetSlug}`}
      className="border border-gray-300 rounded-md px-3 py-1 hover:bg-gray-200/60 hover:border-gray-400 transition-colors"
      prefetch={false}
    >
      {tag}
    </Link>
  );
}
