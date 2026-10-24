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
  { name: '香港中环', province: '香港', lat: 22.2819, lng: 114.1581 },
  { name: '香港旺角', province: '香港', lat: 22.3193, lng: 114.1694 },
  { name: '澳门半岛', province: '澳门', lat: 22.1987, lng: 113.5439 },
  { name: '台北', province: '台湾', lat: 25.033, lng: 121.5654 },
  { name: '九份', province: '台湾', lat: 25.1096, lng: 121.8452 },
  { name: '花莲', province: '台湾', lat: 23.9872, lng: 121.6015 },
  { name: '高雄', province: '台湾', lat: 22.6273, lng: 120.3014 },
  { name: '垦丁', province: '台湾', lat: 21.9483, lng: 120.7798 },
  { name: '北京', province: '北京', lat: 39.9042, lng: 116.4074 },
  { name: '上海', province: '上海', lat: 31.2304, lng: 121.4737 },
  { name: '广州', province: '广东', lat: 23.1291, lng: 113.2644 },
  { name: '深圳', province: '广东', lat: 22.5431, lng: 114.0579 },
  { name: '杭州', province: '浙江', lat: 30.2741, lng: 120.1551 },
  { name: '苏州', province: '江苏', lat: 31.2989, lng: 120.5853 },
  { name: '南京', province: '江苏', lat: 32.0603, lng: 118.7969 },
  { name: '成都', province: '四川', lat: 30.6586, lng: 104.0648 },
  { name: '康定', province: '四川', lat: 30.051, lng: 101.9625 },
  { name: '稻城亚丁', province: '四川', lat: 28.4628, lng: 100.2981 },
  { name: '重庆', province: '重庆', lat: 29.563, lng: 106.5516 },
  { name: '大理', province: '云南', lat: 25.6065, lng: 100.2676 },
  { name: '丽江', province: '云南', lat: 26.8721, lng: 100.2299 },
  { name: '香格里拉', province: '云南', lat: 27.8251, lng: 99.7082 },
  { name: '西安', province: '陕西', lat: 34.3416, lng: 108.9398 },
  { name: '敦煌', province: '甘肃', lat: 40.1421, lng: 94.662 },
  { name: '青海湖', province: '青海', lat: 36.8927, lng: 100.1804 },
  { name: '乌鲁木齐', province: '新疆', lat: 43.8256, lng: 87.6168 },
  { name: '伊犁那拉提', province: '新疆', lat: 43.9169, lng: 81.3242 },
  { name: '拉萨', province: '西藏', lat: 29.6525, lng: 91.1721 },
  { name: '三亚', province: '海南', lat: 18.2528, lng: 109.512 },
  { name: '厦门', province: '福建', lat: 24.4798, lng: 118.0894 },
  { name: '哈尔滨', province: '黑龙江', lat: 45.8038, lng: 126.535 }
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

  const width = 580;
  const height = 400;

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
      .scale(520)
      .translate([width / 2, height / 2]);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.strokeStyle = '#eceef2';
    ctx.lineWidth = 0.7;
    for (let x = 0; x <= width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw China provinces
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
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#4b5563';
            ctx.lineWidth = 0.85;
            ctx.stroke();
          }
        }
      };
      if (geom.type === 'Polygon') drawRings(geom.coordinates);
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(drawRings);
    }

    // Draw sub-locations
    for (const loc of locations) {
      const p = projection([loc.lng, loc.lat]);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ea580c';
      ctx.fill();
      if (loc.description) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#9a3412';
        ctx.fillText(loc.description, p[0] + 6, p[1] + 3);
      }
    }

    // Draw main coordinate
    if (lat !== 0 || lng !== 0) {
      const p = projection([lng, lat]);
      if (p) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 11, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(185, 28, 28, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
        ctx.fillStyle = '#b91c1c';
        ctx.fill();

        ctx.strokeStyle = 'rgba(185, 28, 28, 0.6)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p[0] - 15, p[1]);
        ctx.lineTo(p[0] + 15, p[1]);
        ctx.moveTo(p[0], p[1] - 15);
        ctx.lineTo(p[0], p[1] + 15);
        ctx.stroke();
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
      .scale(520)
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
      const desc = subPlaceName.trim() || prov || '拍摄点';
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
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/70 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">
            大中华区地图可视化选点器
          </span>
          {hoverCoord && (
            <span className="text-xs font-mono text-gray-400">
              ({hoverCoord.lat.toFixed(2)}°N, {hoverCoord.lng.toFixed(2)}°E)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg p-1 text-xs">
          <button
            type="button"
            onClick={() => setClickMode('main')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              clickMode === 'main'
                ? 'bg-red-700 text-white font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            点击设为主坐标
          </button>
          <button
            type="button"
            onClick={() => setClickMode('sub')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              clickMode === 'sub'
                ? 'bg-orange-600 text-white font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            点击添加子地点
          </button>
        </div>
      </div>

      {clickMode === 'sub' && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">新增子地点名称：</span>
          <input
            type="text"
            value={subPlaceName}
            onChange={e => setSubPlaceName(e.target.value)}
            placeholder="例如：九份 / 旺角 / 稻城亚丁（选填，点击地图即添加）"
            className="flex-1 px-2.5 py-1 border border-gray-300 rounded bg-white"
          />
        </div>
      )}

      <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={e => setHoverCoord(getCoordFromMouseEvent(e))}
          onMouseLeave={() => setHoverCoord(null)}
          className="w-full h-auto cursor-crosshair block"
        />
        <div className="absolute bottom-2 left-2.5 flex items-center gap-3 text-[11px] text-gray-500 bg-white/85 px-2 py-1 rounded">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-red-700" /> 主坐标
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-orange-600" /> 子地点 ({locations.length})
          </span>
        </div>
      </div>

      <div>
        <div className="text-[11px] text-gray-400 mb-1.5">
          热门摄影城市一键定位（点击即填入坐标）：
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
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
              className="px-2 py-0.5 text-xs bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-gray-200 rounded text-gray-600 transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
