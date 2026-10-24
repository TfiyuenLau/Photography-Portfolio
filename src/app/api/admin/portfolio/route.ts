import fs from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { sortPhotosByTakenDateDesc } from '@/lib/api';

export const dynamic = 'force-dynamic';

const PORTFOLIO_PATH = path.join(process.cwd(), 'src/data/portfolio-data.json');
const SITE_CONFIG_PATH = path.join(process.cwd(), 'src/data/site-config.json');

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

    if (portfolioData) {
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
      fs.writeFileSync(
        PORTFOLIO_PATH,
        JSON.stringify(portfolioData, null, 2),
        'utf-8'
      );
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
      message: '已成功保存至本地数据仓库'
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || '写入本地数据失败' },
      { status: 500 }
    );
  }
}
