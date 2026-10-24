import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import exifr from 'exifr';

const SOURCE_ROOT = 'D:/Document/待整理';
const DEST_ROOT = path.join(process.cwd(), 'public/photos');
const PORTFOLIO_DATA_FILE = path.join(process.cwd(), 'src/data/portfolio-data.json');

const CITY_CONFIGS = [
  {
    name: 'Beijing',
    slug: 'beijing',
    province: 'Beijing',
    lat: 39.9042,
    lng: 116.4074,
    color: '#880808',
    description: 'Beiping alleys & historical urban fabric',
    date: '2023.09',
    tags: ['Beijing', 'Street', '2023'],
    order: 1
  },
  {
    name: 'Tianjin',
    slug: 'tianjin',
    province: 'Tianjin',
    lat: 39.0842,
    lng: 117.2009,
    color: '#d97706',
    description: 'Haihe riverfront promenade & concession architecture',
    date: '2023.08',
    tags: ['Tianjin', 'Street', '2023'],
    order: 2
  },
  {
    name: 'Shiyan',
    slug: 'shiyan',
    province: 'Hubei',
    lat: 32.6294,
    lng: 110.7981,
    color: '#059669',
    description: 'Wudang mountain foothills & local mountain city rhythms',
    date: '2021-2022',
    tags: ['Shiyan', 'Hubei', 'Street', '2021'],
    order: 3
  },
  {
    name: 'Wuhan',
    slug: 'wuhan',
    province: 'Hubei',
    lat: 30.5928,
    lng: 114.3055,
    color: '#e11d48',
    description: 'Yangtze river crossing & historic neighborhood corners',
    date: '2021.11',
    tags: ['Wuhan', 'Hubei', 'Street', '2021'],
    order: 4
  },
  {
    name: 'Nanchang',
    slug: 'nanchang',
    province: 'Jiangxi',
    lat: 28.6820,
    lng: 115.8579,
    color: '#2563eb',
    description: 'Tengwang Pavilion & Gan River everyday scenes',
    date: '2013',
    tags: ['Nanchang', 'Jiangxi', 'Street'],
    order: 5
  },
  {
    name: 'Ganzhou',
    slug: 'ganzhou',
    province: 'Jiangxi',
    lat: 25.8318,
    lng: 114.9348,
    color: '#9a3412',
    description: 'Song Dynasty ancient city walls & riverfront life',
    date: '2021-2026',
    tags: ['Ganzhou', 'Jiangxi', 'Street', '2026'],
    order: 6
  },
  {
    name: 'Guangzhou',
    slug: 'guangzhou',
    province: 'Guangdong',
    lat: 23.1291,
    lng: 113.2644,
    color: '#c026d3',
    description: 'ACG Cosplay culture & Canton Tower nightscape',
    date: '2026.07',
    tags: ['Guangzhou', 'Guangdong', 'Cosplay', '2026'],
    order: 7
  },
  {
    name: 'Shenzhen',
    slug: 'shenzhen',
    province: 'Guangdong',
    lat: 22.5431,
    lng: 114.0579,
    color: '#0d9488',
    description: 'Cyber metropolis, coastal architecture & street moments',
    date: '2025-2026',
    tags: ['Shenzhen', 'Guangdong', 'Street', '2026'],
    order: 8
  }
];

function formatShutterSpeed(exposureTime) {
  if (!exposureTime || exposureTime <= 0) return undefined;
  if (exposureTime >= 1) return `${exposureTime}s`;
  const denom = Math.round(1 / exposureTime);
  return `1/${denom}s`;
}

async function processImage(srcPath, destDir, destFileName) {
  const buf = fs.readFileSync(srcPath);

  // Parse EXIF
  let exif = {};
  let dateTaken = '';
  let year = '';

  try {
    const p = await exifr.parse(buf, {
      tiff: true,
      exif: true,
      gps: true
    });
    if (p) {
      const make = p.Make ? String(p.Make).trim() : '';
      const model = p.Model ? String(p.Model).trim() : '';
      if (make || model) {
        exif.camera = model.startsWith(make) ? model : `${make} ${model}`.trim();
      }
      if (p.LensModel) {
        exif.lens = String(p.LensModel).trim();
      }
      if (p.FocalLength) {
        exif.focalLength = `${Math.round(Number(p.FocalLength))}mm`;
      }
      if (p.FNumber) {
        exif.aperture = `f/${Number(p.FNumber)}`;
      }
      if (p.ExposureTime) {
        exif.shutterSpeed = formatShutterSpeed(Number(p.ExposureTime));
      }
      if (p.ISO) {
        exif.iso = Number(p.ISO);
      }
      const rawDate = p.DateTimeOriginal || p.CreateDate;
      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        dateTaken = rawDate.toISOString().split('T')[0];
        year = rawDate.getFullYear().toString();
        exif.dateTaken = dateTaken;
      }
    }
  } catch (err) {
    // Ignore exif error
  }

  // Compress & rotate with Sharp
  const img = sharp(buf).rotate();
  const meta = await img.metadata();

  const outDest = path.join(destDir, destFileName);
  await img
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 85 })
    .toFile(outDest);

  const stat = fs.statSync(outDest);
  const finalMeta = await sharp(outDest).metadata();

  return {
    size: stat.size,
    width: finalMeta.width || meta.width || 2048,
    height: finalMeta.height || meta.height || 1365,
    exif: Object.keys(exif).length > 0 ? exif : undefined,
    dateTaken,
    year
  };
}

async function main() {
  console.log('Starting full photo migration from:', SOURCE_ROOT);

  if (!fs.existsSync(SOURCE_ROOT)) {
    console.error('Source root directory does not exist:', SOURCE_ROOT);
    process.exit(1);
  }

  // Ensure public/photos directory exists
  if (!fs.existsSync(DEST_ROOT)) {
    fs.mkdirSync(DEST_ROOT, { recursive: true });
  }

  const albumPhotos = {};
  const folderPhotos = {
    Cosplay: [],
    Street: []
  };

  const albums = [];

  for (const cfg of CITY_CONFIGS) {
    const cityDir = path.join(SOURCE_ROOT, cfg.name);
    if (!fs.existsSync(cityDir)) {
      console.warn(`Folder ${cityDir} not found, skipping.`);
      continue;
    }

    const cityDestDir = path.join(DEST_ROOT, cfg.slug);
    if (!fs.existsSync(cityDestDir)) {
      fs.mkdirSync(cityDestDir, { recursive: true });
    }

    const files = fs
      .readdirSync(cityDir)
      .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b));

    console.log(`Processing ${cfg.name}: ${files.length} photos...`);

    const cityPhotosList = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const srcPath = path.join(cityDir, file);
      const baseName = path.basename(file, path.extname(file)).toLowerCase();
      const destFileName = `${baseName}.webp`;

      const result = await processImage(srcPath, cityDestDir, destFileName);

      const photoUrl = `/photos/${cfg.slug}/${destFileName}`;
      const photoId = `${cfg.slug}-${baseName}`;

      // Determine categorization
      const isGuangzhouCosplay =
        cfg.name === 'Guangzhou' &&
        file.toUpperCase() !== 'P1015789.JPG'; // P1015789.JPG is city nightscape

      let photoTags = [...cfg.tags];
      if (cfg.name === 'Guangzhou') {
        if (isGuangzhouCosplay) {
          photoTags = ['Cosplay', 'Guangzhou', 'Portrait', '2026'];
        } else {
          photoTags = ['Guangzhou', 'Street', 'Nightscape', '2026'];
        }
      }

      const photoItem = {
        id: photoId,
        title: baseName.toUpperCase(),
        date: result.year || cfg.tags.find(t => /^\d{4}/.test(t)) || '2026',
        tags: photoTags,
        size: result.size,
        url: photoUrl,
        width: result.width,
        height: result.height,
        exif: result.exif
      };

      cityPhotosList.push(photoItem);

      // Add to Folders
      if (isGuangzhouCosplay) {
        folderPhotos.Cosplay.push(photoItem);
      } else {
        folderPhotos.Street.push(photoItem);
      }

      if ((i + 1) % 15 === 0 || i === files.length - 1) {
        console.log(`  [${cfg.name}] ${i + 1}/${files.length} done`);
      }
    }

    albumPhotos[cfg.name] = cityPhotosList;

    albums.push({
      title: cfg.name,
      slug: cfg.slug,
      province: cfg.province,
      color: cfg.color,
      type: 'location',
      description: cfg.description,
      date: cfg.date,
      lat: cfg.lat,
      lng: cfg.lng,
      locations: [],
      tags: cfg.tags,
      order: cfg.order
    });
  }

  const folders = [
    {
      title: 'Cosplay',
      slug: 'cosplay',
      parentTitle: null,
      description: 'Coser portraits & Anime Expo documentation',
      date: '2026',
      order: 1
    },
    {
      title: 'Street',
      slug: 'street',
      parentTitle: null,
      description: 'Urban documentary, street moments & architecture across 8 cities',
      date: '2013-2026',
      order: 2
    }
  ];

  const fullPortfolioData = {
    albums,
    albumPhotos,
    folders,
    folderPhotos
  };

  fs.writeFileSync(
    PORTFOLIO_DATA_FILE,
    JSON.stringify(fullPortfolioData, null, 2),
    'utf-8'
  );

  console.log('\n================ MIGRATION COMPLETE ================');
  console.log(`Albums created (${albums.length}):`, albums.map(a => `${a.title} (${albumPhotos[a.title]?.length || 0})`));
  console.log(`Folders created (${folders.length}):`, folders.map(f => `${f.title} (${folderPhotos[f.title]?.length || 0})`));
  console.log('Saved to:', PORTFOLIO_DATA_FILE);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
