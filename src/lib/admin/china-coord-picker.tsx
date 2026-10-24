'use client';

import React, { useEffect, useRef, useState } from 'react';
import { geoMercator, geoContains } from 'd3-geo';
import chinaGeoData from '@/data/china-geo.json';
import { AlbumLocation } from '@/types';

export const GREATER_CHINA_PRESETS: Array<{
  name: string;
  province: string;
  lat: number;
  lng: number;
}> = [
  { name: 'Hong Kong', province: 'Hong Kong', lat: 22.2819, lng: 114.1581 },
  { name: 'Macau', province: 'Macau', lat: 22.1987, lng: 113.5439 },
  { name: 'Taipei', province: 'Taiwan', lat: 25.033, lng: 121.5654 },
  { name: 'Hualien', province: 'Taiwan', lat: 23.9872, lng: 121.6015 },
  { name: 'Beijing', province: 'Beijing', lat: 39.9042, lng: 116.4074 },
  { name: 'Shanghai', province: 'Shanghai', lat: 31.2304, lng: 121.4737 },
  { name: 'Guangzhou', province: 'Guangdong', lat: 23.1291, lng: 113.2644 },
  { name: 'Shenzhen', province: 'Guangdong', lat: 22.5431, lng: 114.0579 },
  { name: 'Hangzhou', province: 'Zhejiang', lat: 30.2741, lng: 120.1551 },
  { name: 'Suzhou', province: 'Jiangsu', lat: 31.2989, lng: 120.5853 },
  { name: 'Chengdu', province: 'Sichuan', lat: 30.6586, lng: 104.0648 },
  { name: 'Kangding', province: 'Sichuan', lat: 30.051, lng: 101.9625 },
  { name: 'Chongqing', province: 'Chongqing', lat: 29.563, lng: 106.5516 },
  { name: 'Dali', province: 'Yunnan', lat: 25.6065, lng: 100.2676 },
  { name: 'Lijiang', province: 'Yunnan', lat: 26.8721, lng: 100.2299 },
  { name: 'Xian', province: 'Shaanxi', lat: 34.3416, lng: 108.9398 },
  { name: 'Dunhuang', province: 'Gansu', lat: 40.1421, lng: 94.662 },
  { name: 'Urumqi', province: 'Xinjiang', lat: 43.8256, lng: 87.6168 },
  { name: 'Ili', province: 'Xinjiang', lat: 43.9169, lng: 81.3242 },
  { name: 'Lhasa', province: 'Xizang', lat: 29.6525, lng: 91.1721 },
  { name: 'Xiamen', province: 'Fujian', lat: 24.4798, lng: 118.0894 }
];

export default function ChinaCoordPicker({
  lat,
  lng,
  locations,
  onPickMainCoord,
  onAddSubLocation
}: {
  lat: number;
  lng: number;
  locations: AlbumLocation[];
  onPickMainCoord: (lat: number, lng: number, detectedProvince?: string) => void;
  onAddSubLocation: (loc: AlbumLocation) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [clickMode, setClickMode] = useState<'main' | 'sub'>('main');
  const [subPlaceName, setSubPlaceName] = useState('');
  const [hoverCoord, setHoverCoord] = useState<{ lat: number; lng: number } | null>(null);

  const width = 560;
  const height = 340;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const projection = geoMercator()
      .center([105, 35.5])
      .scale(460)
      .translate([width / 2, height / 2]);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    for (const feature of (chinaGeoData as any).features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const drawRings = (coords: number[][][]) => {
        for (const ring of coords) {
          ctx.beginPath();
          let started = false;
          for (const [cLng, cLat] of ring) {
            if (cLat < 14 || cLat > 55 || cLng < 72 || cLng > 138) continue;
            const p = projection([cLng, cLat]);
            if (!p) continue;
            if (!started) {
              ctx.moveTo(p[0], p[1]);
              started = true;
            } else {
              ctx.lineTo(p[0], p[1]);
            }
          }
          if (started) {
            ctx.closePath();
            ctx.fillStyle = '#fafafa';
            ctx.fill();
            ctx.strokeStyle = '#6b7280';
            ctx.lineWidth = 0.75;
            ctx.stroke();
          }
        }
      };
      if (geom.type === 'Polygon') drawRings(geom.coordinates);
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(drawRings);
    }

    for (const loc of locations) {
      const p = projection([loc.lng, loc.lat]);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#52525b';
      ctx.fill();
    }

    if (lat !== 0 || lng !== 0) {
      const p = projection([lng, lat]);
      if (p) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = '#dc2626';
        ctx.fill();
      }
    }

    ctx.restore();
  }, [lat, lng, locations]);

  function getCoordFromMouseEvent(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const projection = geoMercator()
      .center([105, 35.5])
      .scale(460)
      .translate([width / 2, height / 2]);

    const inverted = projection.invert?.([x, y]);
    if (!inverted) return null;
    const [pickedLng, pickedLat] = inverted;
    return {
      lat: Math.round(pickedLat * 10000) / 10000,
      lng: Math.round(pickedLng * 10000) / 10000
    };
  }

  function detectProvinceName(pickedLat: number, pickedLng: number): string | undefined {
    try {
      for (const feature of (chinaGeoData as any).features) {
        if (feature.properties?.name && geoContains(feature, [pickedLng, pickedLat])) {
          return String(feature.properties.name).replace(
            /省|市|自治区|特别行政区|壮族|维吾尔|回族/g,
            ''
          );
        }
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const coord = getCoordFromMouseEvent(e);
    if (!coord) return;
    const prov = detectProvinceName(coord.lat, coord.lng);

    if (clickMode === 'main') {
      onPickMainCoord(coord.lat, coord.lng, prov);
    } else {
      const desc = subPlaceName.trim() || prov || 'Point';
      onAddSubLocation({
        lat: coord.lat,
        lng: coord.lng,
        description: desc,
        date: new Date().getFullYear().toString()
      });
      setSubPlaceName('');
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setClickMode('main')}
            className={`px-2 py-1 rounded transition-colors ${
              clickMode === 'main'
                ? 'bg-black text-white'
                : 'text-gray-500 hover:text-black'
            }`}
          >
            Main Coord
          </button>
          <button
            type="button"
            onClick={() => setClickMode('sub')}
            className={`px-2 py-1 rounded transition-colors ${
              clickMode === 'sub'
                ? 'bg-black text-white'
                : 'text-gray-500 hover:text-black'
            }`}
          >
            + Sub Point
          </button>
        </div>

        {hoverCoord && (
          <span className="font-mono text-gray-400">
            {hoverCoord.lat.toFixed(2)}°N, {hoverCoord.lng.toFixed(2)}°E
          </span>
        )}
      </div>

      {clickMode === 'sub' && (
        <input
          type="text"
          value={subPlaceName}
          onChange={e => setSubPlaceName(e.target.value)}
          placeholder="Sub-location name (optional, then click map)"
          className="w-full px-2.5 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-black"
        />
      )}

      <div className="border border-gray-100 rounded overflow-hidden">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={e => setHoverCoord(getCoordFromMouseEvent(e))}
          onMouseLeave={() => setHoverCoord(null)}
          className="w-full h-auto cursor-crosshair block"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {GREATER_CHINA_PRESETS.map(preset => (
          <button
            key={preset.name}
            type="button"
            onClick={() => {
              if (clickMode === 'main') {
                onPickMainCoord(preset.lat, preset.lng, preset.province);
              } else {
                onAddSubLocation({
                  lat: preset.lat,
                  lng: preset.lng,
                  description: preset.name,
                  date: new Date().getFullYear().toString()
                });
              }
            }}
            className="px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-black border border-gray-200 hover:border-black rounded transition-colors"
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}
