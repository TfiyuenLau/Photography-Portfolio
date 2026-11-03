const fs = require('fs');
const path = require('path');

const dataPath = 'D:/Project/Photography-Portfolio/src/data/portfolio-data.json';
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Define the exact set of IDs for Street (Human Candid Street Documentary)
const streetIds = new Set([
  'shenzhen-p1016428',
  'shenzhen-p1016365',
  'shenzhen-p1016354',
  'shenzhen-p1016198',
  'shenzhen-p1016126',
  'shenzhen-p1016093',
  'shenzhen-p1016085',
  'shenzhen-p1015980',
  'shenzhen-p1015242',
  'shenzhen-p1015114',
  'shenzhen-p1015086',
  'shenzhen-p1015082',
  'shenzhen-p1015071',
  'shenzhen-p1015060',
  'shenzhen-p1015004',
  'shenzhen-p1014965',
  'shenzhen-p1014946',
  'ganzhou-p1015534',
  'ganzhou-p1015498',
  'ganzhou-p1015488',
  'ganzhou-p1015408',
  'ganzhou-p1110393',
  'ganzhou-p1110372',
  'shiyan-p1110228',
  'beijing-p1110582',
  'tianjin-p1110516'
]);

// Define the exact set of IDs for Architecture
const architectureIds = new Set([
  // Shenzhen
  'shenzhen-p1016459',
  'shenzhen-p1016448',
  'shenzhen-p1016322',
  'shenzhen-p1016281',
  'shenzhen-p1016265',
  'shenzhen-p1016225',
  'shenzhen-p1016183',
  'shenzhen-p1016150',
  'shenzhen-p1016148',
  'shenzhen-p1016042',
  'shenzhen-p1016024',
  'shenzhen-p1016020',
  'shenzhen-p1016006',
  'shenzhen-p1015927',
  'shenzhen-p1015917',
  'shenzhen-p1015876',
  'shenzhen-p1015873',
  'shenzhen-p1015866',
  'shenzhen-p1015861',
  'shenzhen-p1015831',
  'shenzhen-p1015363',
  'shenzhen-p1015345',
  'shenzhen-p1015338',
  'shenzhen-p1015335',
  'shenzhen-p1015303',
  'shenzhen-p1015302',
  'shenzhen-p1015299',
  'shenzhen-p1015294',
  'shenzhen-p1015286',
  'shenzhen-p1015277',
  'shenzhen-p1015275',
  'shenzhen-p1015271',
  'shenzhen-p1015268',
  'shenzhen-p1015266',
  'shenzhen-p1015264',
  'shenzhen-p1015252',
  'shenzhen-p1015249',
  'shenzhen-p1015230',
  'shenzhen-p1015227',
  'shenzhen-p1015219',
  'shenzhen-p1015212',
  'shenzhen-p1015203',
  'shenzhen-p1015165',
  'shenzhen-p1015162',
  'shenzhen-p1015148',
  'shenzhen-p1015055',
  'shenzhen-p1015038',
  'shenzhen-p1015024',
  'shenzhen-p1015001',
  'shenzhen-p1014916',
  'shenzhen-p1014904',
  'shenzhen-p1014892',
  'shenzhen-p1014883',
  'shenzhen-p1014868',
  'shenzhen-p1014842',
  'shenzhen-p1014838',

  // Guangzhou
  'guangzhou-p1015789',

  // Beijing
  'beijing-p1110667',
  'beijing-p1110642',
  'beijing-p1110639',
  'beijing-p1110632',
  'beijing-p1110630',
  'beijing-p1110615',
  'beijing-p1110610',
  'beijing-p1110598',
  'beijing-p1110588',
  'beijing-p1110586',
  'beijing-p1110577',
  'beijing-p1110567',
  'beijing-p1110560',
  'beijing-p1110554',
  'beijing-p1110548',

  // Tianjin
  'tianjin-p1110543',
  'tianjin-p1110535',
  'tianjin-p1110528',
  'tianjin-p1110521',
  'tianjin-p1110514',
  'tianjin-p1110509',
  'tianjin-p1110501',
  'tianjin-p1110500',
  'tianjin-p1110495',

  // Ganzhou
  'ganzhou-p1015443',
  'ganzhou-p1015430',
  'ganzhou-p1015398',
  'ganzhou-p1015396',
  'ganzhou-p1110388',
  'ganzhou-p1110409',
  'ganzhou-p1110406',
  'ganzhou-p1110404',
  'ganzhou-p1110403',
  'ganzhou-p1110394',
  'ganzhou-p1110391',
  'ganzhou-p1110401',
  'ganzhou-p1110427',
  'ganzhou-p1110421',
  'ganzhou-p1110420',
  'ganzhou-p1110417',
  'ganzhou-p1110381',
  'ganzhou-p1110373',
  'ganzhou-p1110370',
  'ganzhou-p1110367',
  'ganzhou-p1110362',
  'ganzhou-p1110193',
  'ganzhou-p1110188',
  'ganzhou-p1110185',
  'ganzhou-p1110796',

  // Shiyan
  'shiyan-p1110342',
  'shiyan-p1110325',
  'shiyan-p1110324',
  'shiyan-p1110249',
  'shiyan-p1110245',
  'shiyan-p1110236',
  'shiyan-p1110226',

  // Wuhan
  'wuhan-p1110320',
  'wuhan-p1110314',
  'wuhan-p1110312',

  // Nanchang
  'nanchang-dsc03244',
  'nanchang-dsc03238',
  'nanchang-dsc03227',
  'nanchang-dsc03213',
  'nanchang-dsc03204',
  'nanchang-dsc03185'
]);

// Helper to sort photos descending by dateTaken
function sortDesc(photos) {
  return [...photos].sort((a, b) => {
    const da = a.exif?.dateTaken ? new Date(a.exif.dateTaken).getTime() : 0;
    const db = b.exif?.dateTaken ? new Date(b.exif.dateTaken).getTime() : 0;
    return db - da;
  });
}

// Find master photo by id from all album photos
const masterMap = new Map();
for (const city of Object.keys(data.albumPhotos)) {
  for (const p of data.albumPhotos[city]) {
    masterMap.set(p.id, p);
  }
}

// Update photo tags in albums and build folder lists
const newStreetPhotos = [];
const newArchPhotos = [];

for (const [id, photo] of masterMap.entries()) {
  const isStreet = streetIds.has(id);
  const isArch = architectureIds.has(id);

  // Update tags
  let tags = photo.tags || [];
  if (isStreet) {
    if (!tags.includes('Street')) tags.push('Street');
  } else {
    tags = tags.filter(t => t !== 'Street');
  }

  if (isArch) {
    if (!tags.includes('Architecture')) tags.push('Architecture');
  } else {
    tags = tags.filter(t => t !== 'Architecture');
  }

  photo.tags = tags;

  if (isStreet) {
    newStreetPhotos.push({ ...photo });
  }
  if (isArch) {
    newArchPhotos.push({ ...photo });
  }
}

// Check counts
console.log(`Street photos count: ${newStreetPhotos.length}`);
console.log(`Architecture photos count: ${newArchPhotos.length}`);

// Ensure folders definition
const existingFolders = data.folders || [];
const streetFolder = existingFolders.find(f => f.slug === 'street' || f.title.toLowerCase() === 'street');
if (streetFolder) {
  streetFolder.title = 'Street';
  streetFolder.slug = 'street';
  streetFolder.description = 'Candid street documentary & human moments across cities';
  streetFolder.order = 2;
}

let archFolder = existingFolders.find(f => f.slug === 'architecture' || f.title.toLowerCase() === 'architecture');
if (!archFolder) {
  archFolder = {
    title: 'Architecture',
    slug: 'architecture',
    parentTitle: null,
    description: 'Urban architecture, classical pavilions & structural aesthetics',
    date: '2023-2026',
    order: 3
  };
  existingFolders.push(archFolder);
} else {
  archFolder.title = 'Architecture';
  archFolder.slug = 'architecture';
  archFolder.description = 'Urban architecture, classical pavilions & structural aesthetics';
  archFolder.order = 3;
}

data.folders = existingFolders;

// Update folderPhotos
data.folderPhotos['Street'] = sortDesc(newStreetPhotos);
data.folderPhotos['Architecture'] = sortDesc(newArchPhotos);

// Write back to file
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Successfully updated portfolio-data.json!');
