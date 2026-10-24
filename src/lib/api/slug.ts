import { AlbumTitle, FolderName } from '@/types';
import portfolioData from '@/data/portfolio-data.json';

const capitalize = (str: string) =>
  str ? str[0].toUpperCase() + str.slice(1).toLowerCase() : '';

export function titleToSlug(title: string, customSlug?: string): string {
  if (customSlug && customSlug.trim()) {
    return customSlug.trim().toLowerCase();
  }

  const matchedAlbum = portfolioData.albums.find(
    a => a.title.toLowerCase() === title.toLowerCase()
  );
  if (matchedAlbum?.slug) {
    return matchedAlbum.slug;
  }

  const matchedFolder = portfolioData.folders.find(
    f => f.title.toLowerCase() === title.toLowerCase()
  );
  if (matchedFolder?.slug) {
    return matchedFolder.slug;
  }

  // Extract ASCII words if mixed Chinese + English (e.g. "香港 Hong Kong" -> "hong-kong")
  const asciiMatch = title.match(/[a-zA-Z0-9]+/g);
  if (asciiMatch && asciiMatch.length > 0) {
    return asciiMatch.join('-').toLowerCase();
  }

  return title.trim().toLowerCase().replace(/\s+/g, '-');
}

export function slugToAlbumTitle(slug: string): AlbumTitle {
  const decoded = decodeURIComponent(slug).toLowerCase();

  const matched = portfolioData.albums.find(
    a =>
      a.slug?.toLowerCase() === decoded ||
      titleToSlug(a.title, a.slug) === decoded ||
      a.title.toLowerCase() === decoded
  );
  if (matched) {
    return matched.title as AlbumTitle;
  }

  return decoded
    .split('-')
    .map(capitalize)
    .map(s => s.replace(/%c3%a7/g, 'ç'))
    .join(' ') as AlbumTitle;
}

export function slugToFolderName(slug: string): FolderName {
  const decoded = decodeURIComponent(slug).toLowerCase();

  const matched = portfolioData.folders.find(
    f =>
      f.slug?.toLowerCase() === decoded ||
      titleToSlug(f.title, f.slug) === decoded ||
      f.title.toLowerCase() === decoded
  );
  if (matched) {
    return matched.title as FolderName;
  }

  let name = decoded.split('-').map(capitalize).join(' ');
  if (name.length < 4) name = name.toUpperCase();
  return name as FolderName;
}
