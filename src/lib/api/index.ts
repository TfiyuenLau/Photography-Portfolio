import fs from 'fs';
import path from 'path';
import { Client } from './client';
import { Album, Folder, Photo, SiteConfig } from '@/types';
import defaultPortfolioData from '@/data/portfolio-data.json';
import defaultSiteConfig from '@/data/site-config.json';
import { titleToSlug } from './slug';

type PortfolioStore = {
  albums: Album[];
  albumPhotos: Record<string, Photo[]>;
  folders: Folder[];
  folderPhotos: Record<string, Photo[]>;
};

function readPortfolioStore(): PortfolioStore {
  try {
    const filePath = path.join(process.cwd(), 'src/data/portfolio-data.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as PortfolioStore;
    }
  } catch {
    // Fallback to static bundle import
  }
  return defaultPortfolioData as unknown as PortfolioStore;
}

export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const filePath = path.join(process.cwd(), 'src/data/site-config.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as SiteConfig;
    }
  } catch {
    // Fallback to static bundle import
  }
  return defaultSiteConfig as SiteConfig;
}

export async function getAlbums(): Promise<Album[]> {
  if (process.env.CONTENTFUL_SPACE_ID && process.env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const client = new Client();
      const data = await client.albums.get();
      if (data.success) {
        const albums = data.data.photoGalleryCollection.items;
        return [...albums].sort((a, b) => a.order - b.order);
      }
    } catch (error) {
      console.warn('Failed to fetch albums from Contentful, using local portfolio data.', error);
    }
  }
  const store = readPortfolioStore();
  return [...store.albums].sort((a, b) => a.order - b.order);
}

export async function getAlbum(slugOrTitle: string): Promise<{ album: Album; photos: Photo[] }> {
  const decoded = decodeURIComponent(slugOrTitle).toLowerCase();

  if (process.env.CONTENTFUL_SPACE_ID && process.env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const client = new Client();
      const data = await client.album(slugOrTitle).get();
      if (data.success && data.data.photoGalleryCollection.items.length > 0) {
        const album = data.data.photoGalleryCollection.items[0];
        const photos = album.photosCollection.items;
        return { album, photos };
      }
    } catch (error) {
      console.warn(`Failed to fetch album ${slugOrTitle} from Contentful, using local portfolio data.`, error);
    }
  }

  const store = readPortfolioStore();
  const albums = store.albums;
  const album =
    albums.find(
      a =>
        a.title.toLowerCase() === decoded ||
        a.slug?.toLowerCase() === decoded ||
        titleToSlug(a.title, a.slug) === decoded
    ) || albums[0];
  const albumPhotos = store.albumPhotos[album.title] || [];
  return { album, photos: albumPhotos };
}

export async function getPhotos(tag: string): Promise<Photo[]> {
  const decodedTag = decodeURIComponent(tag).trim().toLowerCase();

  if (process.env.CONTENTFUL_SPACE_ID && process.env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const client = new Client();
      const data = await client.photos.findBy(decodedTag);
      if (data.success) {
        return data.data.assetCollection.items;
      }
    } catch (error) {
      console.warn(`Failed to fetch photos tagged '${decodedTag}' from Contentful, using local portfolio data.`, error);
    }
  }

  const store = readPortfolioStore();
  const seen = new Set<string>();
  const matchedPhotos: Photo[] = [];

  for (const album of store.albums) {
    const photos = store.albumPhotos[album.title] || [];
    const albumTags = [
      ...(album.tags || []),
      album.province || '',
      album.date || '',
      album.description || '',
      ...album.locations.map(l => l.description || ''),
      ...album.locations.map(l => l.date || '')
    ]
      .filter(Boolean)
      .map(t => t.toLowerCase());

    const albumMatches = albumTags.some(
      t => t === decodedTag || t.includes(decodedTag)
    );

    for (const photo of photos) {
      if (seen.has(photo.url)) continue;

      const photoTags = (photo.tags || []).map(t => t.toLowerCase());
      const photoDate = (photo.date || '').toLowerCase();
      const urlParts = photo.url.split('/');
      const filename = urlParts[urlParts.length - 1].toLowerCase();

      const explicitMatch =
        photoTags.some(t => t === decodedTag || t.includes(decodedTag)) ||
        photoDate.includes(decodedTag);

      let yearMatch = false;
      if (decodedTag.match(/^2\d{3}$/)) {
        const fileYear = filename.match(/2\d{3}/)?.[0];
        yearMatch = fileYear === decodedTag || photoDate.includes(decodedTag);
      }

      if (explicitMatch || albumMatches || yearMatch) {
        seen.add(photo.url);
        matchedPhotos.push(photo);
      }
    }
  }

  return matchedPhotos;
}

export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const store = readPortfolioStore();
  const counts = new Map<string, number>();

  const addTag = (raw: string | undefined | null, weight = 1) => {
    if (!raw) return;
    const clean = raw.trim();
    if (!clean) return;
    counts.set(clean, (counts.get(clean) || 0) + weight);
  };

  for (const album of store.albums) {
    const photos = store.albumPhotos[album.title] || [];
    const photoCount = Math.max(photos.length, 1);

    for (const t of album.tags || []) {
      addTag(t, photoCount);
    }
    if (album.date) {
      const year = album.date.match(/20\d{2}/)?.[0];
      if (year) addTag(year, photoCount);
    }
    for (const photo of photos) {
      for (const pt of photo.tags || []) {
        if (!(album.tags || []).includes(pt)) {
          addTag(pt, 1);
        }
      }
    }
  }

  for (const year of ['2025', '2024', '2023', '2022', '2021']) {
    if (!counts.has(year)) {
      counts.set(year, 0);
    }
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getFolders(): Promise<Folder[]> {
  if (process.env.CONTENTFUL_SPACE_ID && process.env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const client = new Client();
      const data = await client.folders.get();
      if (data.success) {
        const folders = data.data.photoFoldersCollection.items;
        return [...folders].sort((a, b) => a.order - b.order);
      }
    } catch (error) {
      console.warn('Failed to fetch folders from Contentful, using local portfolio data.', error);
    }
  }
  const store = readPortfolioStore();
  return [...store.folders].sort((a, b) => a.order - b.order);
}

export async function getFolder(folderSlugOrName: string): Promise<{ folder: Folder; photos: Photo[] }> {
  const decoded = decodeURIComponent(folderSlugOrName).toLowerCase();

  if (process.env.CONTENTFUL_SPACE_ID && process.env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const client = new Client();
      const data = await client.folder(folderSlugOrName).get();
      if (data.success && data.data.photoFoldersCollection.items.length > 0) {
        const folder = data.data.photoFoldersCollection.items[0];
        const photos = folder.photosCollection.items;
        return { folder, photos };
      }
    } catch (error) {
      console.warn(`Failed to fetch folder '${folderSlugOrName}' from Contentful, using local portfolio data.`, error);
    }
  }

  const store = readPortfolioStore();
  const folders = store.folders;
  const folder =
    folders.find(
      f =>
        f.title.toLowerCase() === decoded ||
        f.slug?.toLowerCase() === decoded ||
        titleToSlug(f.title, f.slug) === decoded
    ) || folders[0];
  const photos = store.folderPhotos[folder.title] || [];
  return { folder, photos };
}
