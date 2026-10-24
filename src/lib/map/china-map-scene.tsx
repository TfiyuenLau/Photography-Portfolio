'use client';

import React, { useEffect, useRef, useState } from 'react';
import { geoMercator } from 'd3-geo';
import * as topojson from 'topojson-client';
import Link from 'next/link';
import { Album, AlbumTitle, types } from '@/types/albums';
import { titleToSlug } from '@/lib/api/slug';
import { AlbumCard } from '@/lib/globes/card';
import chinaGeoData from '@/data/china-geo.json';
import landTopoData from '@/data/land-110m.json';

type Vec3 = { x: number; y: number; z: number };

type ProjectedRing = {
  name: string;
  points: Array<[number, number]>; // [x, y] in map plane coordinates
};

type Arc3D = {
  start: [number, number];
  end: [number, number];
  height: number;
  speed: number;
  offset: number;
  dashLen: number;
  gapLen: number;
};

type Particle3D = {
  x: number;
  y: number;
  z: number;
  radius: number;
  alpha: number;
  vx: number;
  vy: number;
};

// Map projection centered on Greater China (Mainland, HK, Macau, Taiwan)
const MAP_CENTER: [number, number] = [106.5, 33.2];
const MAP_SCALE = 760;

function matchProvince(featureName: string, albumProvince?: string, albumTitle?: string): boolean {
  if (!featureName) return false;
  const targets = [albumProvince, albumTitle].filter(Boolean) as string[];
  for (const t of targets) {
    const clean = t.trim();
    if (!clean) continue;
    if (featureName.includes(clean) || clean.includes(featureName.replace(/省|市|自治区|特别行政区|壮族|维吾尔|回族/g, ''))) {
      const shortName = featureName.replace(/省|市|自治区|特别行政区|壮族|维吾尔|回族/g, '');
      if (shortName.length >= 2 && (clean.includes(shortName) || featureName.includes(clean))) {
        return true;
      }
    }
    // Special regional group mappings (e.g. 江南 -> 上海/江苏/浙江, 西北 -> 新疆/甘肃/青海/陕西, 川西 -> 四川)
    if (clean.includes('江南') && ['上海市', '江苏省', '浙江省'].includes(featureName)) return true;
    if (clean.includes('川西') && ['四川省', '西藏自治区'].includes(featureName)) return true;
    if (clean.includes('西北') && ['新疆维吾尔自治区', '甘肃省', '青海省', '陕西省'].includes(featureName)) return true;
  }
  return false;
}

export default function ChinaMapScene({
  albums,
  photographerName = 'L. PHOTOGRAPHY',
  copyrightName
}: {
  albums: Array<Album>;
  photographerName?: string;
  copyrightName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeAlbumTitle, setActiveAlbumTitle] = useState<AlbumTitle | undefined>();
  const activeAlbum = albums.find(a => a.title === activeAlbumTitle);
  const activeAlbumRef = useRef<Album | undefined>(undefined);
  activeAlbumRef.current = activeAlbum;

  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoverStartRef = useRef<number>(0);

  function handleMouseEnter(album: Album) {
    setActiveAlbumTitle(album.title);
    hoverStartRef.current = performance.now();
  }

  function handleMouseLeave() {
    setActiveAlbumTitle(undefined);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const projection = geoMercator()
      .center(MAP_CENTER)
      .scale(MAP_SCALE)
      .translate([0, 0]);

    // 1. Pre-project China provincial polygons
    const chinaRings: ProjectedRing[] = [];
    for (const feature of (chinaGeoData as any).features) {
      const name: string = feature.properties?.name || '';
      const geom = feature.geometry;
      if (!geom) continue;

      const extractPolygon = (coords: number[][][]) => {
        for (const ring of coords) {
          const pts: Array<[number, number]> = [];
          for (const [lng, lat] of ring) {
            if (lat < 3 || lat > 56 || lng < 70 || lng > 140) continue;
            const p = projection([lng, lat]);
            if (p) pts.push([p[0], p[1]]);
          }
          if (pts.length > 2) {
            chinaRings.push({ name, points: pts });
          }
        }
      };

      if (geom.type === 'Polygon') {
        extractPolygon(geom.coordinates);
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          extractPolygon(poly);
        }
      }
    }

    // 2. Pre-project surrounding East Asia coastline context from land-110m.json
    const contextRings: Array<Array<[number, number]>> = [];
    try {
      const landFeatures = (
        topojson.feature(
          landTopoData as any,
          (landTopoData as any).objects.land
        ) as any
      ).features;
      for (const feat of landFeatures) {
        const geom = feat.geometry;
        const processRing = (ring: number[][]) => {
          let currentSegment: Array<[number, number]> = [];
          for (const [lng, lat] of ring) {
            if (lng >= 65 && lng <= 152 && lat >= 5 && lat <= 60) {
              const p = projection([lng, lat]);
              if (p) currentSegment.push([p[0], p[1]]);
            } else if (currentSegment.length > 1) {
              contextRings.push(currentSegment);
              currentSegment = [];
            } else {
              currentSegment = [];
            }
          }
          if (currentSegment.length > 1) {
            contextRings.push(currentSegment);
          }
        };
        if (geom.type === 'Polygon') {
          geom.coordinates.forEach(processRing);
        } else if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach((poly: number[][][]) => poly.forEach(processRing));
        }
      }
    } catch {
      // ignore context land parse errors
    }

    // 3. Pre-project Graticule lines (Lng: 70E to 140E step 5, Lat: 15N to 55N step 5)
    const graticuleLines: Array<{
      pts: Array<[number, number]>;
      label?: string;
      labelPos?: [number, number];
    }> = [];

    for (let lng = 75; lng <= 135; lng += 5) {
      const pts: Array<[number, number]> = [];
      for (let lat = 12; lat <= 54; lat += 2) {
        const p = projection([lng, lat]);
        if (p) pts.push([p[0], p[1]]);
      }
      const labelPt = projection([lng, 54]);
      graticuleLines.push({
        pts,
        label: lng % 10 === 0 ? `${lng}°E` : undefined,
        labelPos: labelPt ? [labelPt[0], labelPt[1]] : undefined
      });
    }

    for (let lat = 15; lat <= 50; lat += 5) {
      const pts: Array<[number, number]> = [];
      for (let lng = 72; lng <= 138; lng += 2) {
        const p = projection([lng, lat]);
        if (p) pts.push([p[0], p[1]]);
      }
      const labelPt = projection([72, lat]);
      graticuleLines.push({
        pts,
        label: lat % 10 === 0 ? `${lat}°N` : undefined,
        labelPos: labelPt ? [labelPt[0], labelPt[1]] : undefined
      });
    }

    // 4. Pre-compute album nodes & 3D arcs
    const locationAlbums = albums.filter(a => a.type === types.LOCATION && (a.lat !== 0 || a.lng !== 0));
    const projectedAlbums = locationAlbums.map(album => {
      const mainPt = projection([album.lng, album.lat]) || [0, 0];
      const subPts = album.locations.map(loc => ({
        ...loc,
        pt: projection([loc.lng, loc.lat]) || [0, 0]
      }));
      return {
        album,
        pt: mainPt as [number, number],
        subPts
      };
    });

    const arcs: Arc3D[] = [];
    for (let i = 0; i < projectedAlbums.length; i++) {
      for (let j = i + 1; j < projectedAlbums.length; j++) {
        const a = projectedAlbums[i].pt;
        const b = projectedAlbums[j].pt;
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        arcs.push({
          start: a,
          end: b,
          height: Math.min(95, Math.max(24, dist * 0.22)),
          speed: 0.25 + ((i * 7 + j * 3) % 10) * 0.04,
          offset: (i * 1.7 + j * 0.9) % 10,
          dashLen: 4 + ((i + j) % 5),
          gapLen: 6 + ((i * 2 + j) % 7)
        });
      }
      // Also connect main album coordinate to its sub-locations
      for (const sub of projectedAlbums[i].subPts) {
        const a = projectedAlbums[i].pt;
        const b = sub.pt;
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (dist > 3) {
          arcs.push({
            start: a,
            end: b,
            height: Math.max(12, dist * 0.28),
            speed: 0.45,
            offset: i * 0.5,
            dashLen: 3,
            gapLen: 4
          });
        }
      }
    }

    // 5. Generate 3D floating ambient particles
    const particles: Particle3D[] = Array.from({ length: 140 }, (_, i) => ({
      x: ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 900 - 450,
      y: ((Math.cos(i * 78.233) * 23421.631) % 1) * 700 - 350,
      z: (i % 2 === 0 ? 1 : -1) * (15 + (i % 70)),
      radius: 1 + (i % 3) * 0.65,
      alpha: 0.12 + (i % 5) * 0.05,
      vx: ((i % 7) - 3) * 0.03,
      vy: ((i % 5) - 2) * 0.025
    }));

    // Camera state for smooth 2.5D damping
    const camState = {
      focusX: -45, // Slightly shifted so map sits nicely to the right of the nav
      focusY: 10,
      zoom: 1.05,
      pitch: 0.36, // ~20.6 degrees 2.5D editorial tilt
      yaw: -0.06,
      customElevation: 0
    };

    let width = window.innerWidth;
    let height = window.innerHeight;
    const handleResize = () => {
      if (!canvas) return;
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const handlePointerMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / Math.max(1, width) - 0.5) * 2,
        y: (e.clientY / Math.max(1, height) - 0.5) * 2
      };
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handlePointerMove);

    let animId = 0;

    // 3D -> 2D Screen Projection with Camera Tilt, Yaw, Focus, and Perspective
    const project3D = (wx: number, wy: number, wz: number): { x: number; y: number; scale: number } => {
      // Translate relative to camera focus
      const rx = wx - camState.focusX;
      const ry = wy - camState.focusY;
      const rz = wz;

      // Rotate around Z (Yaw)
      const cosZ = Math.cos(camState.yaw);
      const sinZ = Math.sin(camState.yaw);
      const yx = rx * cosZ - ry * sinZ;
      const yy = rx * sinZ + ry * cosZ;

      // Rotate around X (Pitch / 2.5D Isometric Tilt)
      const cosX = Math.cos(camState.pitch);
      const sinX = Math.sin(camState.pitch);
      const py = yy * cosX - rz * sinX;
      const pz = yy * sinX + rz * cosX;

      const fovDist = 1100;
      const perspective = fovDist / Math.max(250, fovDist + pz);
      const responsiveBase = Math.min(width, height) / 860;
      const finalScale = perspective * camState.zoom * Math.max(0.62, responsiveBase);

      const screenCenterX = width * (width >= 768 ? 0.56 : 0.5);
      const screenCenterY = height * 0.5;

      return {
        x: screenCenterX + yx * finalScale,
        y: screenCenterY + py * finalScale,
        scale: finalScale
      };
    };

    const render = (now: number) => {
      const t = now * 0.001;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Compute target camera state based on hovered album
      const hovered = activeAlbumRef.current;
      let targetFocusX = -20 + Math.sin(t * 0.35) * 12 + mouseRef.current.x * 18;
      let targetFocusY = 15 + Math.cos(t * 0.28) * 8 + mouseRef.current.y * 14;
      let targetZoom = 1.08;
      let targetPitch = 0.36 + Math.sin(t * 0.3) * 0.025 - mouseRef.current.y * 0.05;
      let targetYaw = -0.05 + Math.cos(t * 0.22) * 0.03 + mouseRef.current.x * 0.06;
      let targetCustomElev = 0;

      if (hovered) {
        if (hovered.type === types.LOCATION && (hovered.lat !== 0 || hovered.lng !== 0)) {
          const p = projection([hovered.lng, hovered.lat]);
          if (p) {
            targetFocusX = p[0];
            targetFocusY = p[1];
            targetZoom = 1.85;
            targetPitch = 0.44;
            targetYaw = mouseRef.current.x * 0.03;
          }
        } else if (hovered.type === types.CUSTOM) {
          // Special panoramic elevation mode for non-geographic thematic albums (Street / Film)
          targetFocusX = 0;
          targetFocusY = 10;
          targetZoom = 0.96;
          targetPitch = 0.52;
          targetYaw = Math.sin(t * 0.8) * 0.12;
          targetCustomElev = 1;
        }
      }

      // Smooth exponential damping
      const lerp = 0.055;
      camState.focusX += (targetFocusX - camState.focusX) * lerp;
      camState.focusY += (targetFocusY - camState.focusY) * lerp;
      camState.zoom += (targetZoom - camState.zoom) * lerp;
      camState.pitch += (targetPitch - camState.pitch) * lerp;
      camState.yaw += (targetYaw - camState.yaw) * lerp;
      camState.customElevation += (targetCustomElev - camState.customElevation) * lerp;

      // --- LAYER 1: Graticule Grid & Coordinate Labels ---
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = 'rgba(200, 204, 210, 0.52)';
      ctx.fillStyle = 'rgba(160, 165, 175, 0.75)';
      ctx.font = '10px monospace';

      for (const line of graticuleLines) {
        ctx.beginPath();
        for (let i = 0; i < line.pts.length; i++) {
          const s = project3D(line.pts[i][0], line.pts[i][1], -4);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();

        if (line.label && line.labelPos) {
          const lp = project3D(line.labelPos[0], line.labelPos[1], -4);
          ctx.fillText(line.label, lp.x + 3, lp.y - 3);
        }
      }

      // --- LAYER 2: Surrounding East Asia Coastline Context (Subtle Wireframe) ---
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(212, 216, 220, 0.65)';
      for (const ring of contextRings) {
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const s = project3D(ring[i][0], ring[i][1], -2);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
      }

      // --- LAYER 3: Greater China Provincial Polygons (with 3D Elevation on Active Region) ---
      const activeRings: ProjectedRing[] = [];

      for (const ring of chinaRings) {
        const isMatched =
          hovered &&
          hovered.type === types.LOCATION &&
          matchProvince(ring.name, hovered.province, hovered.title);

        if (isMatched) {
          activeRings.push(ring);
          continue;
        }

        ctx.beginPath();
        for (let i = 0; i < ring.points.length; i++) {
          const s = project3D(ring.points[i][0], ring.points[i][1], 0);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
        ctx.fill();
        ctx.lineWidth = 0.95;
        ctx.strokeStyle = 'rgba(47, 56, 66, 0.72)';
        ctx.stroke();
      }

      // Render elevated highlighted province(s) on top with 3D extrusion shadow & lifted plate
      for (const ring of activeRings) {
        // Base shadow on z = 0
        ctx.beginPath();
        for (let i = 0; i < ring.points.length; i++) {
          const s = project3D(ring.points[i][0], ring.points[i][1], 0);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(136, 8, 8, 0.08)';
        ctx.fill();

        // Lifted plate at z = 14
        ctx.beginPath();
        for (let i = 0; i < ring.points.length; i++) {
          const s = project3D(ring.points[i][0], ring.points[i][1], 14);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 248, 248, 0.95)';
        ctx.fill();
        ctx.lineWidth = 1.65;
        ctx.strokeStyle = 'rgba(136, 8, 8, 0.85)';
        ctx.stroke();
      }

      // --- LAYER 4: 3D Parabolic Journey Arcs (Animated Dashed Red Trajectories) ---
      for (const arc of arcs) {
        ctx.beginPath();
        const steps = 28;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const wx = arc.start[0] + (arc.end[0] - arc.start[0]) * u;
          const wy = arc.start[1] + (arc.end[1] - arc.start[1]) * u;
          const wz = Math.sin(u * Math.PI) * arc.height;
          const p = project3D(wx, wy, wz);
          if (s === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.save();
        ctx.setLineDash([arc.dashLen, arc.gapLen]);
        ctx.lineDashOffset = -(t * 18 * arc.speed + arc.offset * 10);
        ctx.lineWidth = 1.05;
        ctx.strokeStyle = hovered
          ? 'rgba(210, 30, 30, 0.28)'
          : 'rgba(220, 25, 25, 0.55)';
        ctx.stroke();
        ctx.restore();
      }

      // --- LAYER 5: Custom Album Panoramic Ripple Wave (when hovering Street / Film) ---
      if (camState.customElevation > 0.02) {
        const center = project3D(0, 10, 0);
        for (let rIdx = 0; rIdx < 4; rIdx++) {
          const phase = ((t * 0.65 + rIdx * 0.25) % 1);
          const radius = phase * 380 * center.scale;
          const alpha = (1 - phase) * 0.45 * camState.customElevation;
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(220, 38, 38, ${alpha})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }

      // --- LAYER 6: Album Coordinate Nodes, Sub-locations, and Radar Pulse Rings ---
      for (const item of projectedAlbums) {
        const isCurrentActive = hovered?.title === item.album.title;
        const baseZ = isCurrentActive ? 14 : camState.customElevation * 28;
        const mainScreen = project3D(item.pt[0], item.pt[1], baseZ);

        // If elevated, draw vertical pin stem to z=0
        if (baseZ > 1) {
          const groundScreen = project3D(item.pt[0], item.pt[1], 0);
          ctx.beginPath();
          ctx.moveTo(groundScreen.x, groundScreen.y);
          ctx.lineTo(mainScreen.x, mainScreen.y);
          ctx.strokeStyle = 'rgba(220, 20, 20, 0.45)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw sub-location points
        for (const sub of item.subPts) {
          const subScreen = project3D(sub.pt[0], sub.pt[1], isCurrentActive ? 14 : 0);
          ctx.beginPath();
          ctx.arc(
            subScreen.x,
            subScreen.y,
            (isCurrentActive ? 3.2 : 2.2) * subScreen.scale,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = isCurrentActive
            ? 'rgba(220, 20, 20, 0.9)'
            : 'rgba(220, 20, 20, 0.55)';
          ctx.fill();

          if (isCurrentActive && sub.description) {
            ctx.font = '11px sans-serif';
            ctx.fillStyle = 'rgba(60, 64, 70, 0.85)';
            ctx.fillText(
              sub.description.split(' ')[0],
              subScreen.x + 6,
              subScreen.y + 3
            );
          }
        }

        // Draw main album marker dot
        ctx.beginPath();
        ctx.arc(
          mainScreen.x,
          mainScreen.y,
          (isCurrentActive ? 5.2 : 3.6) * mainScreen.scale,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = isCurrentActive
          ? 'rgba(185, 10, 10, 0.98)'
          : 'rgba(235, 15, 15, 0.78)';
        ctx.fill();

        // Subtle permanent halo
        ctx.beginPath();
        ctx.arc(
          mainScreen.x,
          mainScreen.y,
          8.5 * mainScreen.scale,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = 'rgba(220, 20, 20, 0.24)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // City label on map
        const shortLabel = item.album.title.split(' ')[0];
        ctx.font = isCurrentActive ? 'bold 12px sans-serif' : '11px sans-serif';
        ctx.fillStyle = isCurrentActive
          ? 'rgba(136, 8, 8, 0.95)'
          : 'rgba(85, 90, 98, 0.75)';
        ctx.fillText(
          shortLabel,
          mainScreen.x + 8 * mainScreen.scale,
          mainScreen.y + 4
        );

        // Active Hover Radar Ripple Rings & Cartographic Crosshair Telemetry
        if (isCurrentActive) {
          const elapsed = (now - hoverStartRef.current) * 0.001;
          for (let r = 0; r < 3; r++) {
            const prog = (elapsed * 0.65 + r * 0.33) % 1;
            const ringR = (10 + prog * 78) * mainScreen.scale;
            const alpha = Math.pow(1 - prog, 1.4) * 0.75;
            ctx.beginPath();
            ctx.arc(mainScreen.x, mainScreen.y, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(235, 45, 25, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // Precision target crosshair & GPS telemetry
          const chSize = 18 * mainScreen.scale;
          ctx.strokeStyle = 'rgba(136, 8, 8, 0.45)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(mainScreen.x - chSize, mainScreen.y);
          ctx.lineTo(mainScreen.x + chSize, mainScreen.y);
          ctx.moveTo(mainScreen.x, mainScreen.y - chSize);
          ctx.lineTo(mainScreen.x, mainScreen.y + chSize);
          ctx.stroke();

          ctx.font = '10px monospace';
          ctx.fillStyle = 'rgba(136, 8, 8, 0.75)';
          ctx.fillText(
            `${item.album.lat.toFixed(2)}°N  ${item.album.lng.toFixed(2)}°E`,
            mainScreen.x + 8 * mainScreen.scale,
            mainScreen.y + 17
          );
        }
      }

      // --- LAYER 7: 3D Floating Depth-of-Field Dust Particles ---
      for (const pt of particles) {
        pt.x += pt.vx;
        pt.y += pt.vy;
        if (pt.x > 450) pt.x = -450;
        if (pt.x < -450) pt.x = 450;
        if (pt.y > 350) pt.y = -350;
        if (pt.y < -350) pt.y = 350;

        const sp = project3D(pt.x, pt.y, pt.z);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, pt.radius * sp.scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(115, 120, 128, ${pt.alpha})`;
        ctx.fill();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
    };
  }, [albums]);

  return (
    <section
      className={`globe-container
        py-24
        sm:py-28
        md:py-32 md:px-24
        lg:py-36 lg:px-36
        xl:py-40 xl:px-48
        2xl:px-64`}
    >
      <div className="fixed inset-0 pointer-events-none z-0 fade-in">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      <section className="content-container grow text-3xl relative z-10">
        <h1 className="font-bold mb-10 sm:mb-16 text-center md:text-left tracking-tight">
          {photographerName}
        </h1>

        <ul
          className={`flex flex-col items-center
            md:items-start tracking-tight space-y-1`}
        >
          {albums.map(album => {
            const isHovered = activeAlbumTitle === album.title;
            return (
              <li
                key={album.title}
                className="max-w-fit"
                onMouseEnter={() => handleMouseEnter(album)}
                onMouseLeave={() => handleMouseLeave()}
              >
                <Link
                  href={`/${titleToSlug(album.title, album.slug)}`}
                  className={`transition-colors duration-200 ${
                    isHovered ? 'text-red-700 font-medium' : 'hover:text-gray-500'
                  }`}
                >
                  {album.title}
                </Link>
              </li>
            );
          })}

          <li className="pt-6 flex flex-wrap gap-4 text-base text-gray-400">
            <Link
              href="/folders"
              className="hover:text-gray-700 transition-colors"
            >
              专题归档 / Folders
            </Link>
            <span>·</span>
            <Link
              href="/tags/2024"
              className="hover:text-gray-700 transition-colors"
            >
              标签检索 / Tags
            </Link>
            <span>·</span>
            <Link
              href="/about"
              className="hover:text-gray-700 transition-colors"
            >
              关于 / About
            </Link>
          </li>
        </ul>
      </section>

      {activeAlbum && <AlbumCard album={activeAlbum} />}

      <footer className="tracking-tight content relative z-10">
        <div className="text-2xl sm:text-3xl text-center md:text-right text-gray-700">
          <p className="m-0 p-0">
            &copy; {new Date().getFullYear()} {copyrightName || photographerName}
          </p>
        </div>
      </footer>
    </section>
  );
}
