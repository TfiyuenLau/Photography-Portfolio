import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import exifr from 'exifr';

const SOURCE_DIR = 'D:/Document/unRAW';
const DEST_DIR = path.join(process.cwd(), 'public/photos/shenzhen');
const PORTFOLIO_DATA_FILE = path.join(process.cwd(), 'src/data/portfolio-data.json');

const TARGET_FILES = [
  'P1016265.JPG', 'P1016281.JPG', 'P1016295.JPG', 'P1016302.JPG',
  'P1016306.JPG', 'P1016309.JPG', 'P1016322.JPG', 'P1016354.JPG',
  'P1016365.JPG', 'P1016403.JPG', 'P1016428.JPG', 'P1016439.JPG',
  'P1016448.JPG', 'P1016451.JPG', 'P1016459.JPG', 'P1016462.JPG',
  'P1016464.JPG', 'P1016468.JPG'
];

function formatShutterSpeed(exposureTime) {
  if (!exposureTime || exposureTime <= 0) return undefined;
  if (exposureTime >= 1) return `${exposureTime}s`;
  const denom = Math.round(1 / exposureTime);
  return `1/${denom}s`;
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

function sortPhotosByTakenDateDesc(photos) {
  return [...photos].sort((a, b) => {
    const diff = getPhotoShootingTimestamp(b) - getPhotoShootingTimestamp(a);
    if (diff !== 0) return diff;
    return (b.title || '').localeCompare(a.title || '');
  });
}

async function main() {
  console.log(`Starting conversion and upload for ${TARGET_FILES.length} photos...`);
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  const newPhotos = [];

  for (const fileName of TARGET_FILES) {
    const srcPath = path.join(SOURCE_DIR, fileName);
    if (!fs.existsSync(srcPath)) {
      throw new Error(`File not found: ${srcPath}`);
    }

    const baseName = path.basename(fileName, path.extname(fileName)).toLowerCase();
    const destFileName = `${baseName}.webp`;
    const destPath = path.join(DEST_DIR, destFileName);

    const buffer = fs.readFileSync(srcPath);

    // 1. Parse EXIF
    const parsed = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true
    }) || {};

    const rawDate = parsed.DateTimeOriginal || parsed.CreateDate;
    const dateTaken = rawDate instanceof Date && !isNaN(rawDate.getTime())
      ? rawDate.toISOString()
      : new Date().toISOString();
    const year = new Date(dateTaken).getFullYear().toString();

    // 2. Compress via Sharp: max 2048px, quality 88, effort 4
    await sharp(buffer)
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 88, effort: 4 })
      .toFile(destPath);

    const stat = fs.statSync(destPath);
    const meta = await sharp(destPath).metadata();

    const make = parsed.Make ? String(parsed.Make).trim() : '';
    const model = parsed.Model ? String(parsed.Model).trim() : '';
    let camera;
    if (make || model) {
      camera = model.startsWith(make) ? model : `${make} ${model}`.trim();
    }

    const exif = {
      camera: camera || undefined,
      lens: parsed.LensModel ? String(parsed.LensModel).trim() : undefined,
      focalLength: parsed.FocalLength ? `${Math.round(Number(parsed.FocalLength))}mm` : undefined,
      aperture: parsed.FNumber ? `f/${Number(parsed.FNumber)}` : undefined,
      shutterSpeed: formatShutterSpeed(Number(parsed.ExposureTime)),
      iso: parsed.ISO ? Number(parsed.ISO) : undefined,
      dateTaken,
      lat: typeof parsed.latitude === 'number' && !isNaN(parsed.latitude) ? Math.round(parsed.latitude * 10000) / 10000 : undefined,
      lng: typeof parsed.longitude === 'number' && !isNaN(parsed.longitude) ? Math.round(parsed.longitude * 10000) / 10000 : undefined
    };

    // Clean undefined values in exif
    Object.keys(exif).forEach(k => {
      if (exif[k] === undefined) delete exif[k];
    });

    const photoObj = {
      id: `shenzhen-${baseName}`,
      title: baseName.toUpperCase(),
      date: year,
      tags: ['Shenzhen', 'Guangdong', 'Street', year],
      size: stat.size,
      url: `/photos/shenzhen/${destFileName}`,
      width: meta.width || 2048,
      height: meta.height || 1365,
      exif
    };

    newPhotos.push(photoObj);
    console.log(`Converted ${fileName} -> ${destFileName} (${stat.size} bytes, ${photoObj.width}x${photoObj.height}, date: ${dateTaken})`);
  }

  // Read portfolio data
  const portfolioData = JSON.parse(fs.readFileSync(PORTFOLIO_DATA_FILE, 'utf-8'));

  // Ensure albumPhotos['Shenzhen'] exists
  if (!portfolioData.albumPhotos['Shenzhen']) {
    portfolioData.albumPhotos['Shenzhen'] = [];
  }

  // Filter out any existing duplicates by ID
  const newIds = new Set(newPhotos.map(p => p.id));
  const existingShenzhen = portfolioData.albumPhotos['Shenzhen'].filter(p => !newIds.has(p.id));
  portfolioData.albumPhotos['Shenzhen'] = sortPhotosByTakenDateDesc([...newPhotos, ...existingShenzhen]);

  // Ensure folderPhotos['Street'] exists and update
  if (!portfolioData.folderPhotos['Street']) {
    portfolioData.folderPhotos['Street'] = [];
  }
  const existingStreet = portfolioData.folderPhotos['Street'].filter(p => !newIds.has(p.id));
  portfolioData.folderPhotos['Street'] = sortPhotosByTakenDateDesc([...newPhotos, ...existingStreet]);

  // Update albums list order if needed (Shenzhen should already be order 1 as latest)
  console.log(`Shenzhen photos total now: ${portfolioData.albumPhotos['Shenzhen'].length}`);
  console.log(`Street photos total now: ${portfolioData.folderPhotos['Street'].length}`);
  console.log(`Top 1 photo in Shenzhen: ${portfolioData.albumPhotos['Shenzhen'][0].id} (${portfolioData.albumPhotos['Shenzhen'][0].exif?.dateTaken})`);

  fs.writeFileSync(PORTFOLIO_DATA_FILE, JSON.stringify(portfolioData, null, 2), 'utf-8');
  console.log('Successfully updated portfolio-data.json!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
