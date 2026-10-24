'use client';

import React, { useEffect, useRef } from 'react';
import { geoMercator } from 'd3-geo';
import cn from 'classnames';
import { Album, types } from '@/types';
import chinaGeoData from '@/data/china-geo.json';

export default function MiniChinaMap({
  albums,
  className
}: {
  albums: Array<Album>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef<number | null>(null);
  const yawOffsetRef = useRef<number>(0);
  const yawVelocityRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 900;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const projection = geoMercator()
      .center([106.5, 33.5])
      .scale(680)
      .translate([0, 0]);

    const rings: Array<Array<[number, number]>> = [];
    for (const feature of (chinaGeoData as any).features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const addRings = (coords: number[][][]) => {
        for (const ring of coords) {
          const pts: Array<[number, number]> = [];
          for (const [lng, lat] of ring) {
            if (lat < 5 || lat > 56 || lng < 70 || lng > 140) continue;
            const p = projection([lng, lat]);
            if (p) pts.push([p[0], p[1]]);
          }
          if (pts.length > 2) rings.push(pts);
        }
      };
      if (geom.type === 'Polygon') addRings(geom.coordinates);
      else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(addRings);
      }
    }

    const markers: Array<{ x: number; y: number; label: string }> = [];
    for (const album of albums) {
      if (album.type === types.LOCATION && (album.lat !== 0 || album.lng !== 0)) {
        const p = projection([album.lng, album.lat]);
        if (p) {
          markers.push({
            x: p[0],
            y: p[1],
            label: album.title.split(' ')[0]
          });
        }
      }
      for (const loc of album.locations) {
        const p = projection([loc.lng, loc.lat]);
        if (p) {
          markers.push({
            x: p[0],
            y: p[1],
            label: (loc.description || '').split(' ')[0]
          });
        }
      }
    }

    let animId = 0;
    const render = (now: number) => {
      const t = now * 0.001;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      if (draggingRef.current === null) {
        yawOffsetRef.current += yawVelocityRef.current;
        yawVelocityRef.current *= 0.94;
      }

      const yaw = Math.sin(t * 0.45) * 0.14 + yawOffsetRef.current;
      const pitch = 0.42 + Math.cos(t * 0.35) * 0.04;

      const project = (wx: number, wy: number, wz = 0) => {
        const cosZ = Math.cos(yaw);
        const sinZ = Math.sin(yaw);
        const rx = wx * cosZ - wy * sinZ;
        const ry = wx * sinZ + wy * cosZ;

        const cosX = Math.cos(pitch);
        const sinX = Math.sin(pitch);
        const py = ry * cosX - wz * sinX;
        const pz = ry * sinX + wz * cosX;

        const perspective = 900 / Math.max(300, 900 + pz);
        return {
          x: size * 0.5 + rx * perspective,
          y: size * 0.52 + py * perspective,
          s: perspective
        };
      };

      // Subtle concentric radar circles
      const center = project(0, 0, -5);
      for (let r = 120; r <= 360; r += 80) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, r * center.s, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(180, 185, 195, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Provincial polygons
      for (const ring of rings) {
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const p = project(ring[i][0], ring[i][1], 0);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(75, 85, 99, 0.55)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      // Photography markers
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const p = project(m.x, m.y, 6);
        const pulse = (Math.sin(t * 2.5 + i) + 1) * 0.5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, (4 + pulse * 5) * p.s, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(235, 25, 25, ${0.4 - pulse * 0.3})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2 * p.s, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 20, 20, 0.88)';
        ctx.fill();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.style.opacity = window.innerWidth <= 640 ? '0.55' : '0.88';
      }
    }, 50);

    return () => cancelAnimationFrame(animId);
  }, [albums]);

  return (
    <div className={cn('absolute aspect-[1/1] w-full', className)}>
      <canvas
        ref={canvasRef}
        className="h-full w-full opacity-0 transition-opacity duration-500 cursor-grab active:cursor-grabbing"
        onPointerDown={e => {
          draggingRef.current = e.clientX;
        }}
        onPointerUp={() => {
          draggingRef.current = null;
        }}
        onPointerOut={() => {
          draggingRef.current = null;
        }}
        onMouseMove={e => {
          if (draggingRef.current !== null) {
            const delta = e.clientX - draggingRef.current;
            draggingRef.current = e.clientX;
            yawOffsetRef.current += delta * 0.003;
            yawVelocityRef.current = delta * 0.0005;
          }
        }}
      />
    </div>
  );
}
