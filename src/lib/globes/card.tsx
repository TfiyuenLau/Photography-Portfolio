import { Album } from '@/types';
import React from 'react';

export function AlbumCard({ album }: { album: Album }) {
  let tags = [album.description, ...(album.tags || [])];
  for (const location of album.locations) {
    tags.push(location.description || '');
  }
  tags = Array.from(new Set(tags.filter(Boolean))) as string[];

  return (
    <aside
      className={`card-enter p-4
        fixed z-50 pointer-events-none left-[31%] top-[21%]
        rounded-lg bg-white/85 backdrop-blur-md w-64 text-2xl flex flex-col
        border border-gray-200/80 shadow-sm
        max-md:hidden
        overflow-hidden`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="w-2 h-2 rounded-full bg-red-700 shrink-0 pulse-soft"
          aria-hidden="true"
        />
        <span className="font-medium tracking-tight text-gray-900 truncate">
          {album.title}
        </span>
      </div>
      {album.date && (
        <span className="mt-0.5 text-sm text-gray-500 tracking-tight">
          {album.date}
        </span>
      )}
      {tags.length > 0 && (
        <div className="marquee py-3.5 text-lg text-gray-700">
          <div className="marquee-content">
            {tags.map(tag => (
              <span key={`${tag}-1`} className="whitespace-nowrap">
                {tag}
              </span>
            ))}
          </div>
          <div className="marquee-content" aria-hidden={true}>
            {tags.map(tag => (
              <span key={`${tag}-2`} className="whitespace-nowrap">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <span className="text-sm text-gray-500 tracking-tight">
        Click to enter &rarr;
      </span>
    </aside>
  );
}
