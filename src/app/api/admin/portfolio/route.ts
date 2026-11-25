import fs from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { sortPhotosByTakenDateDesc } from '@/lib/api';

export const dynamic = 'force-dynamic';

const PORTFOLIO_PATH = path.join(process.cwd(), 'src/data/portfolio-data.json');
const SITE_CONFIG_PATH = path.join(process.cwd(), 'src/data/site-config.json');
const PHOTOS_ROOT = path.resolve(process.cwd(), 'public', 'photos');

type PhotoMap = Record<string, Array<{ url?: string }>>;

function collectPhotoUrls(data: unknown): Map<string, string> {
  const urls = new Map<string, string>();
  if (!data || typeof data !== 'object') return urls;

  const record = data as {
    albumPhotos?: PhotoMap;
    folderPhotos?: PhotoMap;
  };

  for (const collection of [record.albumPhotos, record.folderPhotos]) {
    if (!collection || typeof collection !== 'object') continue;
    for (const photos of Object.values(collection)) {
      if (!Array.isArray(photos)) continue;
      for (const photo of photos) {
        if (typeof photo?.url !== 'string') continue;
        const trimmed = photo.url.trim();
        if (!trimmed) continue;
        urls.set(trimmed.toLowerCase(), trimmed);
      }
    }
  }

  return urls;
}

function resolveSafePhotoPath(photoUrl: string): string | null {
  const trimmed = photoUrl.trim();
  if (!trimmed.toLowerCase().startsWith('/photos/')) return null;

  const relative = trimmed.slice('/photos/'.length);
  if (!relative) return null;

  const resolved = path.resolve(PHOTOS_ROOT, relative);
  if (!resolved.startsWith(PHOTOS_ROOT + path.sep)) {
    return null;
  }

  return resolved;
}

export async function GET() {
  try {
    const portfolioRaw = fs.readFileSync(PORTFOLIO_PATH, 'utf-8');
    const siteConfigRaw = fs.readFileSync(SITE_CONFIG_PATH, 'utf-8');

    return NextResponse.json({
      success: true,
      portfolioData: JSON.parse(portfolioRaw),
      siteConfig: JSON.parse(siteConfigRaw)
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || '读取本地数据失败' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { portfolioData, siteConfig } = body;
    let deletedFiles = 0;

    if (portfolioData) {
      let prevUrls = new Map<string, string>();
      try {
        if (fs.existsSync(PORTFOLIO_PATH)) {
          const prevRaw = fs.readFileSync(PORTFOLIO_PATH, 'utf-8');
          prevUrls = collectPhotoUrls(JSON.parse(prevRaw));
        }
      } catch {
        // Ignore previous data parse errors
      }

      if (portfolioData.albumPhotos && typeof portfolioData.albumPhotos === 'object') {
        for (const key of Object.keys(portfolioData.albumPhotos)) {
          if (Array.isArray(portfolioData.albumPhotos[key])) {
            portfolioData.albumPhotos[key] = sortPhotosByTakenDateDesc(portfolioData.albumPhotos[key]);
          }
        }
      }
      if (portfolioData.folderPhotos && typeof portfolioData.folderPhotos === 'object') {
        for (const key of Object.keys(portfolioData.folderPhotos)) {
          if (Array.isArray(portfolioData.folderPhotos[key])) {
            portfolioData.folderPhotos[key] = sortPhotosByTakenDateDesc(portfolioData.folderPhotos[key]);
          }
        }
      }

      const nextUrls = collectPhotoUrls(portfolioData);

      fs.writeFileSync(
        PORTFOLIO_PATH,
        JSON.stringify(portfolioData, null, 2),
        'utf-8'
      );

      for (const [lowerUrl, originalUrl] of Array.from(prevUrls.entries())) {
        if (nextUrls.has(lowerUrl)) continue;
        const resolved = resolveSafePhotoPath(originalUrl);
        if (!resolved) continue;
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          fs.unlinkSync(resolved);
          deletedFiles += 1;
        }
      }
    }

    if (siteConfig) {
      fs.writeFileSync(
        SITE_CONFIG_PATH,
        JSON.stringify(siteConfig, null, 2),
        'utf-8'
      );
    }

    try {
      revalidatePath('/', 'layout');
    } catch {
      // ignore revalidation errors in static context
    }

    return NextResponse.json({
      success: true,
      deletedFiles,
      message: '已成功保存至本地数据仓库'
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || '写入本地数据失败' },
      { status: 500 }
    );
  }
}
