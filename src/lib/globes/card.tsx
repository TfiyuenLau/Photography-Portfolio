import { Album } from '@/types';
import React from 'react';

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function AlbumCard({ album }: { album: Album }) {
  const randomLeft = randomInRange(10, 60);
  const randomTop = randomInRange(10, 40);

  let tags = [album.description, ...(album.tags || [])];
  for (const location of album.locations) {
    tags.push(location.description || '');
  }
  tags = Array.from(new Set(tags.filter(Boolean))) as string[];

  return (
    <aside
      className={`p-4
         fixed z-50 pointer-events-none
        rounded-lg bg-gray-100/90 backdrop-blur-sm w-64 text-2xl opacity-85 flex flex-col
        border border-gray-200 shadow-sm
        max-sm:hidden
        overflow-hidden`}
      style={{
        left: `calc(28% + ${randomLeft}px)`,
        top: `calc(32% + ${randomTop}px)`
      }}
    >
      <span className="blink rounded-lg font-medium text-gray-800">{album.title}</span>
      <span className="text-sm text-gray-500 mt-0.5">{album.date}</span>
      <div className="marquee py-3 text-lg text-gray-700">
        <div className="marquee-content">
          {tags.map(tag => (
            <span key={`${tag}-1`}>{tag}</span>
          ))}
        </div>
        <div className="marquee-content" aria-hidden={true}>
          {tags.map(tag => (
            <span key={`${tag}-2`}>{tag}</span>
          ))}
        </div>
      </div>

      <span className="text-sm text-red-700">点击进入相册 &rarr;</span>
    </aside>
  );
}
