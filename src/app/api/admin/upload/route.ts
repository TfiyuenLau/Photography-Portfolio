import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import exifr from 'exifr';
import { Photo, PhotoExif } from '@/types';

const PHOTOS_ROOT = path.resolve(process.cwd(), 'public', 'photos');

function formatShutterSpeed(exposureTime?: number): string | undefined {
  if (!exposureTime || exposureTime <= 0) return undefined;
  if (exposureTime >= 1) return `${exposureTime}s`;
  const denom = Math.round(1 / exposureTime);
  return `1/${denom}s`;
}

function resolveSafeReplacePath(replaceUrl: string): string | null {
  const trimmed = replaceUrl.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('/photos/') || !lower.endsWith('.webp')) {
    return null;
  }

  const relative = trimmed.slice('/photos/'.length);
  if (!relative) return null;

  const resolved = path.resolve(PHOTOS_ROOT, relative);
  if (!resolved.startsWith(PHOTOS_ROOT + path.sep)) {
    return null;
  }

  return resolved;
}

async function extractPhotoExif(
  buffer: Buffer,
  filename: string
): Promise<{ exifData: PhotoExif; detectedYear: string }> {
  const exifData: PhotoExif = {};
  let detectedYear = new Date().getFullYear().toString();

  try {
    const parsed = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true
    });
    if (parsed) {
      const make = parsed.Make ? String(parsed.Make).trim() : '';
      const model = parsed.Model ? String(parsed.Model).trim() : '';
      if (make || model) {
        exifData.camera = model.startsWith(make)
          ? model
          : `${make} ${model}`.trim();
      }
      if (parsed.LensModel) {
        exifData.lens = String(parsed.LensModel).trim();
      }
      if (parsed.FocalLength) {
        exifData.focalLength = `${Math.round(Number(parsed.FocalLength))}mm`;
      }
      if (parsed.FNumber) {
        exifData.aperture = `f/${Number(parsed.FNumber)}`;
      }
      if (parsed.ExposureTime) {
        exifData.shutterSpeed = formatShutterSpeed(Number(parsed.ExposureTime));
      }
      if (parsed.ISO) {
        exifData.iso = Number(parsed.ISO);
      }
      const rawDate = parsed.DateTimeOriginal || parsed.CreateDate;
      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        exifData.dateTaken = rawDate.toISOString();
        detectedYear = rawDate.getFullYear().toString();
      }
      if (
        typeof parsed.latitude === 'number' &&
        typeof parsed.longitude === 'number' &&
        !isNaN(parsed.latitude) &&
        !isNaN(parsed.longitude)
      ) {
        exifData.lat = Math.round(parsed.latitude * 10000) / 10000;
        exifData.lng = Math.round(parsed.longitude * 10000) / 10000;
      }
    }
  } catch {
    // Ignore EXIF parse failures for stripped images
  }

  const fileYearMatch = filename.match(/20\d{2}/);
  if (fileYearMatch && !exifData.dateTaken) {
    detectedYear = fileYearMatch[0];
  }

  return { exifData, detectedYear };
}

async function processWebpToFile(buffer: Buffer, outputPath: string) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  return sharp(buffer)
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 88, effort: 4 })
    .toFile(outputPath);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const replaceUrlRaw = formData.get('replaceUrl');
    const replaceUrl =
      typeof replaceUrlRaw === 'string' ? replaceUrlRaw.trim() : '';
    const defaultTagsRaw = (formData.get('tags') as string) || '';
    const defaultTags = defaultTagsRaw
      .split(/[,，\s]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, message: '请选择要上传的图片文件' },
        { status: 400 }
      );
    }

    if (replaceUrl) {
      if (files.length !== 1) {
        return NextResponse.json(
          { success: false, message: '原位替换一次仅支持上传 1 个文件' },
          { status: 400 }
        );
      }

      const resolvedPath = resolveSafeReplacePath(replaceUrl);
      if (!resolvedPath) {
        return NextResponse.json(
          { success: false, message: '无效的替换目标路径' },
          { status: 400 }
        );
      }

      const file = files[0];
      const buffer = Buffer.from(await file.arrayBuffer());
      const { exifData } = await extractPhotoExif(buffer, file.name);
      const webpInfo = await processWebpToFile(buffer, resolvedPath);
      const exif = Object.keys(exifData).length > 0 ? exifData : undefined;

      return NextResponse.json({
        success: true,
        url: replaceUrl,
        size: webpInfo.size,
        width: webpInfo.width,
        height: webpInfo.height,
        exif,
        message: '照片已原位替换'
      });
    }

    const uploadedPhotos: Photo[] = [];

    for (const file of files) {
      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const { exifData, detectedYear } = await extractPhotoExif(
        buffer,
        file.name
      );

      // Compress & convert to WebP via Sharp (max dimension <= 2048px)
      const baseName = path
        .basename(file.name, path.extname(file.name))
        .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_')
        .slice(0, 40);
      const uniqueName = `${detectedYear}_${Date.now()}_${baseName}.webp`;
      const outputPath = path.join(PHOTOS_ROOT, detectedYear, uniqueName);
      const webpInfo = await processWebpToFile(buffer, outputPath);

      const photoTags = Array.from(new Set([...defaultTags, detectedYear]));

      uploadedPhotos.push({
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: baseName,
        date: exifData.dateTaken || detectedYear,
        tags: photoTags,
        exif: Object.keys(exifData).length > 0 ? exifData : undefined,
        size: webpInfo.size,
        url: `/photos/${detectedYear}/${uniqueName}`,
        width: webpInfo.width,
        height: webpInfo.height
      });
    }

    return NextResponse.json({
      success: true,
      photos: uploadedPhotos,
      message: `成功转换并压缩 ${uploadedPhotos.length} 张 WebP 照片`
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || '图片处理失败' },
      { status: 500 }
    );
  }
}
