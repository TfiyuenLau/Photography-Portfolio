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
        rounded-lg bg-gray-100/90 backdrop-blur-sm w-60 text-2xl opacity-75 flex flex-col
        border border-gray-200
        max-sm:hidden
        overflow-hidden`}
      style={{
        left: `calc(30% + ${randomLeft}px)`,
        top: `calc(33% + ${randomTop}px)`
      }}
    >
      <span className="blink rounded-lg">{album.title}</span>
      <span className="text-base text-gray-500">{album.date}</span>
      <div className="marquee py-4 text-xl">
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

      <span className="text-base text-gray-600">Click to enter &rarr;</span>
    </aside>
  );
}
