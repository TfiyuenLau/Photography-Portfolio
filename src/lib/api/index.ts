import { Client } from './client';
import { Album, Folder, Photo } from '@/types';
import sampleData from '@/data/sample-data.json';

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
      console.warn('Failed to fetch albums from Contentful, falling back to local data.', error);
    }
  }
  return [...(sampleData.albums as Album[])].sort((a, b) => a.order - b.order);
}

export async function getAlbum(slug: string): Promise<{ album: Album; photos: Photo[] }> {
  if (process.env.CONTENTFUL_SPACE_ID && process.env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const client = new Client();
      const data = await client.album(slug).get();
      if (data.success && data.data.photoGalleryCollection.items.length > 0) {
        const album = data.data.photoGalleryCollection.items[0];
        const photos = album.photosCollection.items;
        return { album, photos };
      }
    } catch (error) {
      console.warn(`Failed to fetch album ${slug} from Contentful, falling back to local data.`, error);
    }
  }
  const albums = sampleData.albums as Album[];
  const album =
    albums.find(a => a.title.toLowerCase() === slug.toLowerCase()) ||
    albums.find(a => a.title.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase()) ||
    albums[0];
  const albumPhotos = (sampleData.albumPhotos as Record<string, Photo[]>)[album.title] || [];
  return { album, photos: albumPhotos };
}

export async function getPhotos(tag: string): Promise<Photo[]> {
  if (process.env.CONTENTFUL_SPACE_ID && process.env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const client = new Client();
      const data = await client.photos.findBy(tag);
      if (data.success) {
        return data.data.assetCollection.items;
      }
    } catch (error) {
      console.warn(`Failed to fetch photos tagged '${tag}' from Contentful, falling back to local data.`, error);
    }
  }
  const allPhotos: Photo[] = Object.values(sampleData.albumPhotos).flat();
  const seen = new Set<string>();
  const uniquePhotos: Photo[] = [];
  for (const photo of allPhotos) {
    if (!seen.has(photo.url)) {
      seen.add(photo.url);
      uniquePhotos.push(photo);
    }
  }
  if (tag.match(/2\d{3}/)) {
    return uniquePhotos.filter(asset => {
      const urlParts = asset.url.split('/');
      const filename = urlParts[urlParts.length - 1];
      const year = filename.match(/2\d{3}/)?.[0];
      return year === tag;
    });
  }
  return uniquePhotos.filter(asset =>
    asset.url.toLowerCase().includes(tag.toLowerCase())
  );
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
      console.warn('Failed to fetch folders from Contentful, falling back to local data.', error);
    }
  }
  return [...(sampleData.folders as Folder[])].sort((a, b) => a.order - b.order);
}

export async function getFolder(folderName: string): Promise<{ folder: Folder; photos: Photo[] }> {
  if (process.env.CONTENTFUL_SPACE_ID && process.env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const client = new Client();
      const data = await client.folder(folderName).get();
      if (data.success && data.data.photoFoldersCollection.items.length > 0) {
        const folder = data.data.photoFoldersCollection.items[0];
        const photos = folder.photosCollection.items;
        return { folder, photos };
      }
    } catch (error) {
      console.warn(`Failed to fetch folder '${folderName}' from Contentful, falling back to local data.`, error);
    }
  }
  const folders = sampleData.folders as Folder[];
  const folder =
    folders.find(f => f.title.toLowerCase() === folderName.toLowerCase()) ||
    folders.find(f => f.title.toLowerCase().replace(/\s+/g, '-') === folderName.toLowerCase()) ||
    folders[0];
  const photos = (sampleData.folderPhotos as Record<string, Photo[]>)[folder.title] || [];
  return { folder, photos };
}
