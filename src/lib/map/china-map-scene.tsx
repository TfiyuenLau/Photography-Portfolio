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

type ProjectedRing = {
  name: string;
  points: Array<[number, number]>;
};

type RouteArc = {
  fromIdx: number;
  toIdx: number;
  start: [number, number];
  end: [number, number];
  height: number;
  speed: number;
  phaseOffset: number;
};

type OrbitalParticle = {
  angle: number;
  dist: number;
  z: number;
  angularSpeed: number;
  radius: number;
  alpha: number;
};

const MAP_CENTER: [number, number] = [106.0, 33.5];
const MAP_SCALE = 750;

const PINYIN_PROVINCE_MAP: Record<string, string[]> = {
  'hong kong': ['香港特别行政区', '广东省'],
  hongkong: ['香港特别行政区', '广东省'],
  taiwan: ['台湾省'],
  macau: ['澳门特别行政区', '广东省'],
  macao: ['澳门特别行政区', '广东省'],
  sichuan: ['四川省'],
  chuanxi: ['四川省', '西藏自治区'],
  jiangnan: ['上海市', '江苏省', '浙江省'],
  shanghai: ['上海市', '江苏省', '浙江省'],
  beijing: ['北京市', '河北省', '山西省'],
  yunnan: ['云南省'],
  xinjiang: ['新疆维吾尔自治区', '甘肃省', '青海省'],
  northwest: ['新疆维吾尔自治区', '甘肃省', '青海省', '陕西省'],
  guangdong: ['广东省'],
  tibet: ['西藏自治区'],
  xizang: ['西藏自治区'],
  fujian: ['福建省'],
  hainan: ['海南省'],
  chongqing: ['重庆市']
};

function matchProvince(
  featureName: string,
  albumProvince?: string,
  albumTitle?: string
): boolean {
  if (!featureName) return false;
  const targets = [albumProvince, albumTitle].filter(Boolean) as string[];
  for (const t of targets) {
    const clean = t.trim();
    const lower = clean.toLowerCase();
    if (!clean) continue;

    if (PINYIN_PROVINCE_MAP[lower]?.includes(featureName)) {
      return true;
    }

    const shortFeature = featureName.replace(
      /省|市|自治区|特别行政区|壮族|维吾尔|回族/g,
      ''
    );
    if (
      shortFeature.length >= 2 &&
      (clean.includes(shortFeature) || featureName.includes(clean))
    ) {
      return true;
    }
    if (
      clean.includes('江南') &&
      ['上海市', '江苏省', '浙江省'].includes(featureName)
    ) {
      return true;
    }
    if (
      clean.includes('川西') &&
      ['四川省', '西藏自治区'].includes(featureName)
    ) {
      return true;
    }
    if (
      clean.includes('西北') &&
      ['新疆维吾尔自治区', '甘肃省', '青海省', '陕西省'].includes(featureName)
    ) {
      return true;
    }
  }
  return false;
}

export default function ChinaMapScene({
  albums,
  photographerName = 'L. Photography',
  copyrightName
}: {
  albums: Array<Album>;
  photographerName?: string;
  copyrightName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeAlbumTitle, setActiveAlbumTitle] = useState<
    AlbumTitle | undefined
  >();
  const activeAlbum = albums.find(a => a.title === activeAlbumTitle);
  const activeAlbumRef = useRef<Album | undefined>(undefined);
  activeAlbumRef.current = activeAlbum;

  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hoverStartRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  function handleMouseEnter(album: Album) {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setActiveAlbumTitle(album.title);
      hoverStartRef.current = performance.now();
    }, 75);
  }

  function handleMouseLeave() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setActiveAlbumTitle(undefined);
    }, 60);
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
            if (lat < 4 || lat > 55.5 || lng < 71 || lng > 138) continue;
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

    // 2. Pre-project surrounding East Asia coastline context
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
            if (lng >= 66 && lng <= 148 && lat >= 6 && lat <= 58) {
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
          geom.coordinates.forEach((poly: number[][][]) =>
            poly.forEach(processRing)
          );
        }
      }
    } catch {
      // ignore context land parse errors
    }

    // 3. Pre-project Graticule lines
    const graticuleLines: Array<{
      pts: Array<[number, number]>;
      label?: string;
      labelPos?: [number, number];
    }> = [];

    for (let lng = 75; lng <= 135; lng += 5) {
      const pts: Array<[number, number]> = [];
      for (let lat = 15; lat <= 54; lat += 2) {
        const p = projection([lng, lat]);
        if (p) pts.push([p[0], p[1]]);
      }
      const labelPt = projection([lng, 54]);
      graticuleLines.push({
        pts,
        label: lng % 15 === 0 ? `${lng}°E` : undefined,
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
        label: lat % 15 === 0 ? `${lat}°N` : undefined,
        labelPos: labelPt ? [labelPt[0], labelPt[1]] : undefined
      });
    }

    // 4. Project albums & build curated route network (Comet flight paths)
    const locationAlbums = albums.filter(
      a => a.type === types.LOCATION && (a.lat !== 0 || a.lng !== 0)
    );
    const projectedAlbums = locationAlbums.map(album => {
      const mainPt = projection([album.lng, album.lat]) || [0, 0];
      const subPts = album.locations.map(loc => ({
        ...loc,
        pt: (projection([loc.lng, loc.lat]) || [0, 0]) as [number, number]
      }));
      return {
        album,
        pt: mainPt as [number, number],
        subPts
      };
    });

    const routeArcs: RouteArc[] = [];
    for (let i = 0; i < projectedAlbums.length; i++) {
      // Connect each destination to the next 2 destinations to form a clean geodesic network
      const targets = [
        (i + 1) % projectedAlbums.length,
        (i + 3) % projectedAlbums.length
      ];
      for (const j of targets) {
        if (i === j) continue;
        const a = projectedAlbums[i].pt;
        const b = projectedAlbums[j].pt;
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        routeArcs.push({
          fromIdx: i,
          toIdx: j,
          start: a,
          end: b,
          height: Math.min(82, Math.max(22, dist * 0.2)),
          speed: 0.22 + ((i + j) % 4) * 0.04,
          phaseOffset: (i * 0.37 + j * 0.19) % 1
        });
      }
    }

    // 5. Generate calm orbital 3D particles (revolving around the map)
    const particles: OrbitalParticle[] = Array.from({ length: 110 }, (_, i) => ({
      angle: (i / 110) * Math.PI * 2 + (i % 7) * 0.3,
      dist: 120 + ((i * 29) % 360),
      z: (i % 2 === 0 ? 1 : -1) * (18 + (i % 65)),
      angularSpeed: (i % 2 === 0 ? 1 : -1) * (0.04 + (i % 5) * 0.012),
      radius: 1.0 + (i % 3) * 0.55,
      alpha: 0.14 + (i % 4) * 0.05
    }));

    // Camera state with gentle velocity-capped damping
    const camState = {
      focusX: -25,
      focusY: 12,
      zoom: 1.04,
      pitch: 0.34,
      yaw: -0.04,
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
    let lastTime = performance.now();

    const project3D = (
      wx: number,
      wy: number,
      wz: number
    ): { x: number; y: number; scale: number } => {
      const rx = wx - camState.focusX;
      const ry = wy - camState.focusY;
      const rz = wz;

      const cosZ = Math.cos(camState.yaw);
      const sinZ = Math.sin(camState.yaw);
      const yx = rx * cosZ - ry * sinZ;
      const yy = rx * sinZ + ry * cosZ;

      const cosX = Math.cos(camState.pitch);
      const sinX = Math.sin(camState.pitch);
      const py = yy * cosX - rz * sinX;
      const pz = yy * sinX + rz * cosX;

      const fovDist = 1200;
      const perspective = fovDist / Math.max(300, fovDist + pz);
      const responsiveBase = Math.min(width, height) / 860;
      const finalScale =
        perspective * camState.zoom * Math.max(0.64, responsiveBase);

      const screenCenterX = width * (width >= 768 ? 0.56 : 0.5);
      const screenCenterY = height * 0.5;

      return {
        x: screenCenterX + yx * finalScale,
        y: screenCenterY + py * finalScale,
        scale: finalScale
      };
    };

    // Helper for smooth velocity-capped approach
    const smoothApproach = (
      current: number,
      target: number,
      rate: number,
      maxStep: number
    ) => {
      const diff = target - current;
      const step = diff * rate;
      if (Math.abs(step) > maxStep) {
        return current + Math.sign(step) * maxStep;
      }
      return current + step;
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) * 0.001));
      lastTime = now;
      const t = now * 0.001;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const hovered = activeAlbumRef.current;

      // Determine ambient auto-tour spotlight album when idle (cycles every 4.2s)
      const tourCycleDuration = 4.2;
      const tourIndex =
        projectedAlbums.length > 0
          ? Math.floor(t / tourCycleDuration) % projectedAlbums.length
          : 0;
      const tourPhase = (t % tourCycleDuration) / tourCycleDuration; // 0..1 within current stop
      const ambientTourAlbum = !hovered
        ? projectedAlbums[tourIndex]?.album
        : undefined;

      // Target camera state (gentle, calm, never dizzying)
      let targetFocusX = -20 + mouseRef.current.x * 8;
      let targetFocusY = 12 + mouseRef.current.y * 6;
      let targetZoom = 1.04;
      let targetPitch = 0.34 - mouseRef.current.y * 0.025;
      let targetYaw = -0.03 + Math.sin(t * 0.18) * 0.035 + mouseRef.current.x * 0.03;
      let targetCustomElev = 0;

      if (hovered) {
        if (
          hovered.type === types.LOCATION &&
          (hovered.lat !== 0 || hovered.lng !== 0)
        ) {
          const p = projection([hovered.lng, hovered.lat]);
          if (p) {
            // Pan 55% of the way toward the city with a gentle 1.32x zoom so it feels silky & grounded
            targetFocusX = p[0] * 0.55;
            targetFocusY = p[1] * 0.55;
            targetZoom = 1.32;
            targetPitch = 0.38;
            targetYaw = 0;
          }
        } else if (hovered.type === types.CUSTOM) {
          targetFocusX = -10;
          targetFocusY = 10;
          targetZoom = 0.98;
          targetPitch = 0.44;
          targetYaw = Math.sin(t * 0.35) * 0.06;
          targetCustomElev = 1;
        }
      }

      // Gentle frame-rate independent damping with velocity cap (prevents fast jarring jumps)
      const panRate = 1 - Math.exp(-2.1 * dt);
      const zoomRate = 1 - Math.exp(-1.9 * dt);
      camState.focusX = smoothApproach(
        camState.focusX,
        targetFocusX,
        panRate,
        140 * dt
      );
      camState.focusY = smoothApproach(
        camState.focusY,
        targetFocusY,
        panRate,
        110 * dt
      );
      camState.zoom = smoothApproach(
        camState.zoom,
        targetZoom,
        zoomRate,
        0.42 * dt
      );
      camState.pitch = smoothApproach(
        camState.pitch,
        targetPitch,
        zoomRate,
        0.25 * dt
      );
      camState.yaw = smoothApproach(
        camState.yaw,
        targetYaw,
        zoomRate,
        0.25 * dt
      );
      camState.customElevation = smoothApproach(
        camState.customElevation,
        targetCustomElev,
        zoomRate,
        1.2 * dt
      );

      // --- LAYER 0: Rotating Cartographic Astrolabe / Compass Bezel ---
      const bezelRadius = 345;
      const bezelRotation = t * 0.045;
      ctx.lineWidth = 0.85;
      ctx.strokeStyle = 'rgba(195, 200, 208, 0.55)';

      // Outer & inner compass rings in 3D map plane
      for (const r of [bezelRadius, bezelRadius + 16]) {
        ctx.beginPath();
        const segs = 90;
        for (let i = 0; i <= segs; i++) {
          const ang = (i / segs) * Math.PI * 2;
          const p = project3D(Math.cos(ang) * r, Math.sin(ang) * r, -6);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Rotating degree ticks on the compass bezel
      for (let deg = 0; deg < 360; deg += 5) {
        const ang = (deg * Math.PI) / 180 + bezelRotation;
        const isMajor = deg % 30 === 0;
        const innerR = bezelRadius + (isMajor ? 2 : 6);
        const outerR = bezelRadius + (isMajor ? 14 : 11);
        const p1 = project3D(
          Math.cos(ang) * innerR,
          Math.sin(ang) * innerR,
          -6
        );
        const p2 = project3D(
          Math.cos(ang) * outerR,
          Math.sin(ang) * outerR,
          -6
        );
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isMajor
          ? 'rgba(136, 8, 8, 0.45)'
          : 'rgba(190, 195, 205, 0.5)';
        ctx.lineWidth = isMajor ? 1.1 : 0.65;
        ctx.stroke();
      }

      // Ambient slow-expanding cartographic pulse wave from map center
      const ambientWavePhase = (t * 0.18) % 1;
      const ambientWaveR = ambientWavePhase * bezelRadius;
      const ambientWaveAlpha = Math.sin(ambientWavePhase * Math.PI) * 0.22;
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) {
        const ang = (i / 72) * Math.PI * 2;
        const p = project3D(
          Math.cos(ang) * ambientWaveR,
          Math.sin(ang) * ambientWaveR,
          -5
        );
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = `rgba(185, 28, 28, ${ambientWaveAlpha})`;
      ctx.lineWidth = 1.0;
      ctx.stroke();

      // --- LAYER 1: Graticule Grid & Coordinate Labels ---
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(208, 212, 218, 0.48)';
      ctx.fillStyle = 'rgba(165, 170, 180, 0.72)';
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

      // --- LAYER 2: Surrounding East Asia Coastline Context ---
      ctx.lineWidth = 0.55;
      ctx.strokeStyle = 'rgba(214, 218, 224, 0.6)';
      for (const ring of contextRings) {
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const s = project3D(ring[i][0], ring[i][1], -2);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
      }

      // --- LAYER 3: Greater China Provincial Polygons ---
      const activeRings: Array<{ ring: ProjectedRing; isHovered: boolean }> = [];

      for (const ring of chinaRings) {
        const isHoverMatched =
          hovered &&
          hovered.type === types.LOCATION &&
          matchProvince(ring.name, hovered.province, hovered.title);

        const isTourMatched =
          !hovered &&
          ambientTourAlbum &&
          matchProvince(
            ring.name,
            ambientTourAlbum.province,
            ambientTourAlbum.title
          );

        if (isHoverMatched || isTourMatched) {
          activeRings.push({ ring, isHovered: Boolean(isHoverMatched) });
          continue;
        }

        ctx.beginPath();
        for (let i = 0; i < ring.points.length; i++) {
          const s = project3D(ring.points[i][0], ring.points[i][1], 0);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.fill();
        ctx.lineWidth = 0.92;
        ctx.strokeStyle = 'rgba(47, 56, 66, 0.7)';
        ctx.stroke();
      }

      // Render elevated province(s) (either hovered or ambient auto-tour)
      for (const { ring, isHovered } of activeRings) {
        const liftZ = isHovered
          ? 11
          : Math.sin(tourPhase * Math.PI) * 5.5;

        // Ground shadow
        ctx.beginPath();
        for (let i = 0; i < ring.points.length; i++) {
          const s = project3D(ring.points[i][0], ring.points[i][1], 0);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = isHovered
          ? 'rgba(136, 8, 8, 0.08)'
          : 'rgba(136, 8, 8, 0.04)';
        ctx.fill();

        // Lifted plate
        ctx.beginPath();
        for (let i = 0; i < ring.points.length; i++) {
          const s = project3D(ring.points[i][0], ring.points[i][1], liftZ);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = isHovered
          ? 'rgba(255, 248, 248, 0.96)'
          : 'rgba(255, 252, 252, 0.94)';
        ctx.fill();
        ctx.lineWidth = isHovered ? 1.55 : 1.25;
        ctx.strokeStyle = isHovered
          ? 'rgba(136, 8, 8, 0.88)'
          : 'rgba(136, 8, 8, 0.55)';
        ctx.stroke();
      }

      // --- LAYER 4: Curated Geodesic Routes & Luminous Comet Trails ---
      for (const arc of routeArcs) {
        // Subtle base guide arc
        ctx.beginPath();
        const totalSteps = 32;
        for (let s = 0; s <= totalSteps; s++) {
          const u = s / totalSteps;
          const wx = arc.start[0] + (arc.end[0] - arc.start[0]) * u;
          const wy = arc.start[1] + (arc.end[1] - arc.start[1]) * u;
          const wz = Math.sin(u * Math.PI) * arc.height;
          const p = project3D(wx, wy, wz);
          if (s === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.14)';
        ctx.lineWidth = 0.85;
        ctx.stroke();

        // Animated glowing comet traveling along the 3D arc
        const headU = (t * arc.speed + arc.phaseOffset) % 1;
        const tailLen = 0.24;
        const cometSegments = 14;
        for (let c = 0; c < cometSegments; c++) {
          const u0 = headU - (c / cometSegments) * tailLen;
          const u1 = headU - ((c + 1) / cometSegments) * tailLen;
          if (u1 < 0 || u0 > 1) continue;
          const clampedU0 = Math.max(0, Math.min(1, u0));
          const clampedU1 = Math.max(0, Math.min(1, u1));

          const p0 = project3D(
            arc.start[0] + (arc.end[0] - arc.start[0]) * clampedU0,
            arc.start[1] + (arc.end[1] - arc.start[1]) * clampedU0,
            Math.sin(clampedU0 * Math.PI) * arc.height
          );
          const p1 = project3D(
            arc.start[0] + (arc.end[0] - arc.start[0]) * clampedU1,
            arc.start[1] + (arc.end[1] - arc.start[1]) * clampedU1,
            Math.sin(clampedU1 * Math.PI) * arc.height
          );

          const fade = 1 - c / cometSegments;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = `rgba(220, 20, 20, ${fade * 0.72})`;
          ctx.lineWidth = 0.8 + fade * 1.1;
          ctx.stroke();
        }

        // Comet glowing head particle
        const headPos = project3D(
          arc.start[0] + (arc.end[0] - arc.start[0]) * headU,
          arc.start[1] + (arc.end[1] - arc.start[1]) * headU,
          Math.sin(headU * Math.PI) * arc.height
        );
        ctx.beginPath();
        ctx.arc(headPos.x, headPos.y, 1.9 * headPos.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 20, 20, 0.85)';
        ctx.fill();
      }

      // --- LAYER 5: Custom Album Panoramic Ripple Wave (Street / Film) ---
      if (camState.customElevation > 0.02) {
        for (let rIdx = 0; rIdx < 4; rIdx++) {
          const phase = (t * 0.45 + rIdx * 0.25) % 1;
          const waveR = phase * 340;
          const alpha = (1 - phase) * 0.48 * camState.customElevation;
          ctx.beginPath();
          for (let i = 0; i <= 64; i++) {
            const ang = (i / 64) * Math.PI * 2;
            const p = project3D(
              Math.cos(ang) * waveR,
              Math.sin(ang) * waveR,
              4
            );
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.strokeStyle = `rgba(220, 38, 38, ${alpha})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }

      // --- LAYER 6: Album Coordinate Nodes, Sub-locations & Radar Pulses ---
      for (const item of projectedAlbums) {
        const isCurrentHovered = hovered?.title === item.album.title;
        const isCurrentToured =
          !hovered && ambientTourAlbum?.title === item.album.title;

        const baseZ = isCurrentHovered
          ? 11
          : isCurrentToured
            ? Math.sin(tourPhase * Math.PI) * 5.5
            : camState.customElevation * 24;

        const mainScreen = project3D(item.pt[0], item.pt[1], baseZ);

        if (baseZ > 1) {
          const groundScreen = project3D(item.pt[0], item.pt[1], 0);
          ctx.beginPath();
          ctx.moveTo(groundScreen.x, groundScreen.y);
          ctx.lineTo(mainScreen.x, mainScreen.y);
          ctx.strokeStyle = 'rgba(220, 20, 20, 0.4)';
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }

        // Sub-location points
        for (const sub of item.subPts) {
          const subScreen = project3D(sub.pt[0], sub.pt[1], baseZ);
          ctx.beginPath();
          ctx.arc(
            subScreen.x,
            subScreen.y,
            (isCurrentHovered ? 3.0 : 2.1) * subScreen.scale,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = isCurrentHovered
            ? 'rgba(220, 20, 20, 0.88)'
            : 'rgba(220, 20, 20, 0.52)';
          ctx.fill();

          if (isCurrentHovered && sub.description) {
            ctx.font = '10px sans-serif';
            ctx.fillStyle = 'rgba(70, 75, 82, 0.85)';
            ctx.fillText(sub.description, subScreen.x + 5, subScreen.y + 3);
          }
        }

        // Main album marker dot
        ctx.beginPath();
        ctx.arc(
          mainScreen.x,
          mainScreen.y,
          (isCurrentHovered || isCurrentToured ? 4.8 : 3.4) * mainScreen.scale,
          0,
          Math.PI * 2
        );
        ctx.fillStyle =
          isCurrentHovered || isCurrentToured
            ? 'rgba(185, 10, 10, 0.95)'
            : 'rgba(235, 15, 15, 0.78)';
        ctx.fill();

        // Subtle permanent halo
        ctx.beginPath();
        ctx.arc(
          mainScreen.x,
          mainScreen.y,
          8 * mainScreen.scale,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = 'rgba(220, 20, 20, 0.24)';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // Clean Pinyin/English label on map when hovered or toured
        if (isCurrentHovered || isCurrentToured) {
          const labelAlpha = isCurrentHovered
            ? 0.95
            : Math.sin(tourPhase * Math.PI) * 0.85;
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = `rgba(136, 8, 8, ${labelAlpha})`;
          ctx.fillText(
            item.album.title.toUpperCase(),
            mainScreen.x + 9 * mainScreen.scale,
            mainScreen.y - 3
          );
          ctx.font = '10px monospace';
          ctx.fillStyle = `rgba(110, 115, 125, ${labelAlpha * 0.9})`;
          ctx.fillText(
            `${item.album.lat.toFixed(1)}°N ${item.album.lng.toFixed(1)}°E`,
            mainScreen.x + 9 * mainScreen.scale,
            mainScreen.y + 9
          );
        }

        // Radar Ripple Rings (both on active hover and subtle ambient tour)
        if (isCurrentHovered || isCurrentToured) {
          const ringCount = isCurrentHovered ? 3 : 2;
          const speed = isCurrentHovered ? 0.55 : 0.42;
          const maxRadius = isCurrentHovered ? 72 : 48;
          const baseTime = isCurrentHovered
            ? (now - hoverStartRef.current) * 0.001
            : t;

          for (let r = 0; r < ringCount; r++) {
            const prog = (baseTime * speed + r / ringCount) % 1;
            const ringR = (8 + prog * maxRadius) * mainScreen.scale;
            const alpha =
              Math.pow(1 - prog, 1.5) * (isCurrentHovered ? 0.72 : 0.45);
            ctx.beginPath();
            ctx.arc(mainScreen.x, mainScreen.y, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(235, 45, 25, ${alpha})`;
            ctx.lineWidth = isCurrentHovered ? 1.4 : 1.1;
            ctx.stroke();
          }
        }
      }

      // --- LAYER 7: Revolving 3D Orbital Particles ---
      for (const pt of particles) {
        const currentAngle = pt.angle + t * pt.angularSpeed;
        const wx = Math.cos(currentAngle) * pt.dist;
        const wy = Math.sin(currentAngle) * pt.dist * 0.78;
        const sp = project3D(wx, wy, pt.z);

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
        py-36
        sm:py-36
        md:py-32 md:px-24
        lg:py-40 lg:px-36
        xl:py-48 xl:px-48
        2xl:px-64
        3xl:py-56`}
    >
      <div className="fixed inset-0 pointer-events-none z-0 fade-in">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      <section className="content-container grow text-3xl relative z-10">
        <h1 className="font-bold mb-12 sm:mb-20 text-center md:text-left">
          {photographerName}
        </h1>

        <ul
          className={`flex flex-col items-center
            md:items-start tracking-tight`}
        >
          {albums.map(album => {
            return (
              <li
                key={album.title}
                className="max-w-fit"
                onMouseEnter={() => handleMouseEnter(album)}
                onMouseLeave={() => handleMouseLeave()}
              >
                <Link
                  href={`/${titleToSlug(album.title, album.slug)}`}
                  className="hover:text-gray-500 transition-colors"
                >
                  {album.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {activeAlbum && <AlbumCard album={activeAlbum} />}

      <footer className="tracking-tight content relative z-10">
        <div className="text-3xl text-center md:text-right">
          <p className="m-0 p-0">
            &copy; {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </section>
  );
}
