import fs from 'fs';
import path from 'path';
import exifr from 'exifr';

const RAW_ROOT = 'D:/Document/待整理';
const PORTFOLIO_DATA_FILE = path.join(process.cwd(), 'src/data/portfolio-data.json');

async function getRawDatesMap() {
  const dateMap = new Map();
  if (!fs.existsSync(RAW_ROOT)) return dateMap;

  for (const dir of fs.readdirSync(RAW_ROOT)) {
    const p = path.join(RAW_ROOT, dir);
    if (!fs.statSync(p).isDirectory()) continue;

    for (const file of fs.readdirSync(p)) {
      const id = `${dir.toLowerCase()}-${path.basename(file, path.extname(file)).toLowerCase()}`;
      try {
        const m = await exifr.parse(path.join(p, file), {
          tiff: true,
          exif: true,
          xmp: true
        });
        const d =
          m?.DateTimeOriginal ||
          m?.CreateDate ||
          m?.DateCreated ||
          m?.MetadataDate ||
          m?.ModifyDate;
        if (d) {
          const iso = new Date(d).toISOString();
          dateMap.set(id, iso);
        }
      } catch (e) {
        // ignore
      }
    }
  }

  // Fallback for Ganzhou P1015433
  if (!dateMap.has('ganzhou-p1015433')) {
    dateMap.set('ganzhou-p1015433', '2026-02-04T10:01:00.000Z');
  }

  return dateMap;
}

function getPhotoShootingTimestamp(photo) {
  if (photo.exif?.dateTaken) {
    const t = new Date(photo.exif.dateTaken).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (photo.date) {
    const t = new Date(photo.date.replace(/\./g, '-')).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

function sortDesc(a, b) {
  const diff = getPhotoShootingTimestamp(b) - getPhotoShootingTimestamp(a);
  if (diff !== 0) return diff;
  return (b.title || '').localeCompare(a.title || '');
}

async function main() {
  console.log('Reading existing portfolio data...');
  const portfolioData = JSON.parse(fs.readFileSync(PORTFOLIO_DATA_FILE, 'utf-8'));
  const rawDates = await getRawDatesMap();

  console.log(`Extracted exact camera timestamps for ${rawDates.size} photos.`);

  // Update timestamps on all photos
  const updatePhoto = photo => {
    const exactDate = rawDates.get(photo.id);
    if (exactDate) {
      if (!photo.exif) photo.exif = {};
      photo.exif.dateTaken = exactDate;
      const year = new Date(exactDate).getFullYear().toString();
      photo.date = year;
    }
    return photo;
  };

  // Sort each album's photos descending
  for (const albumName of Object.keys(portfolioData.albumPhotos)) {
    const list = portfolioData.albumPhotos[albumName].map(updatePhoto);
    list.sort(sortDesc);
    portfolioData.albumPhotos[albumName] = list;
    console.log(
      `Album [${albumName}]: ${list.length} photos sorted. Newest: ${list[0]?.exif?.dateTaken || list[0]?.date} | Oldest: ${list[list.length - 1]?.exif?.dateTaken || list[list.length - 1]?.date}`
    );
  }

  // Sort folder photos descending
  for (const folderName of Object.keys(portfolioData.folderPhotos)) {
    const list = portfolioData.folderPhotos[folderName].map(updatePhoto);
    list.sort(sortDesc);
    portfolioData.folderPhotos[folderName] = list;
    console.log(
      `Folder [${folderName}]: ${list.length} photos sorted. Newest: ${list[0]?.exif?.dateTaken || list[0]?.date} | Oldest: ${list[list.length - 1]?.exif?.dateTaken || list[list.length - 1]?.date}`
    );
  }

  // Re-order Albums so cities with latest shooting dates come first
  portfolioData.albums.sort((a, b) => {
    const photosA = portfolioData.albumPhotos[a.title] || [];
    const photosB = portfolioData.albumPhotos[b.title] || [];
    const latestA = photosA.length > 0 ? getPhotoShootingTimestamp(photosA[0]) : 0;
    const latestB = photosB.length > 0 ? getPhotoShootingTimestamp(photosB[0]) : 0;
    return latestB - latestA;
  });

  portfolioData.albums.forEach((album, idx) => {
    album.order = idx + 1;
  });

  console.log(
    'Albums re-ordered by latest shooting date:',
    portfolioData.albums.map(a => `${a.title} (${portfolioData.albumPhotos[a.title]?.[0]?.exif?.dateTaken?.slice(0, 10)})`)
  );

  fs.writeFileSync(
    PORTFOLIO_DATA_FILE,
    JSON.stringify(portfolioData, null, 2),
    'utf-8'
  );
  console.log('Saved updated portfolio-data.json successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
