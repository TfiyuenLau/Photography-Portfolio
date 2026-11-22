'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import GlobeGL from 'react-globe.gl';
import type { GlobeMethods } from 'react-globe.gl';
import { GeoJsonGeometry } from 'three-geojson-geometry';
import { geoGraticule10 } from 'd3-geo';
import * as topojson from 'topojson-client';
import { useWindowSize } from '@/hooks/use-window-size';
import { Album, AlbumTitle, types } from '@/types/albums';
import { titleToSlug } from '@/lib/api/slug';
import { GitHubLogo, XiaohongshuLogo } from '@/lib/icons/social-logos';
import Link from 'next/link';
import { AlbumCard } from './card';
import { createAmbientParticles, createChinaMapLayers } from './china-geometry';

type Ref = CustomGlobeMethods | undefined;
type GlobeEl = React.MutableRefObject<Ref>;

interface CustomGlobeMethods extends GlobeMethods {
  controls(): ReturnType<GlobeMethods['controls']> & {
    autoRotateForced: boolean;
  };
}

type Ring = {
  lat: number;
  lng: number;
  maxR: number;
  propagationSpeed: number;
  repeatPeriod: number;
  variant: 'primary' | 'secondary';
};

type Arc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startTitle: AlbumTitle;
  endTitle: AlbumTitle;
  dashLength: number;
  dashGap: number;
  dashAnimateTime: number;
};

const DEFAULT_AUTOROTATE_SPEED = 1.75;
// Enlarged globe view focused directly on China
const DEFAULT_POV = { lat: 32, lng: 105, altitude: 1.22 };
const CITY_FOCUS_ALTITUDE = 0.38;

const XIAOHONGSHU_URL =
  'https://www.xiaohongshu.com/user/profile/614967fc000000000201de95';
const GITHUB_URL = 'https://github.com/TfiyuenLau/Photography-Portfolio';

// Focus-linked crimson palette
const ARC_COLOR_DEFAULT: [string, string] = [
  'rgba(159, 18, 57, 0.22)',
  'rgba(159, 18, 57, 0.04)'
];
const ARC_COLOR_FOCUSED: [string, string] = [
  'rgba(185, 28, 28, 0.9)',
  'rgba(185, 28, 28, 0.15)'
];
const ARC_COLOR_DIMMED: [string, string] = [
  'rgba(159, 18, 57, 0.06)',
  'rgba(159, 18, 57, 0.02)'
];

// Stable module-level accessors so react-globe.gl never re-digests layers needlessly
const POLYGON_ALTITUDE = () => 0;
const POLYGON_SIDE_COLOR = () => 'rgba(255, 255, 255, 0)';
const POINT_COLOR = () => 'rgba(159, 18, 57, 0.85)';
const POINT_RADIUS = (point: object) => (point as { radius: number }).radius;
const RING_COLOR_PRIMARY = (t: number) =>
  `rgba(185, 28, 28, ${Math.sqrt(Math.max(0, 1 - t)) * 0.85})`;
const RING_COLOR_SECONDARY = (t: number) =>
  `rgba(185, 28, 28, ${Math.sqrt(Math.max(0, 1 - t)) * 0.5})`;
const RING_COLOR = (ring: object) =>
  (ring as Ring).variant === 'secondary'
    ? RING_COLOR_SECONDARY
    : RING_COLOR_PRIMARY;
const ARC_DASH_LENGTH = (arc: object) => (arc as Arc).dashLength;
const ARC_DASH_GAP = (arc: object) => (arc as Arc).dashGap;
const ARC_DASH_ANIMATE_TIME_STATIC = () => 0;
const ARC_DASH_ANIMATE_TIME_DYNAMIC = (arc: object) =>
  (arc as Arc).dashAnimateTime;

function deterministicUnit(seed: number): number {
  let x = (seed + 0x6d2b79f5) | 0;
  x = Math.imul(x ^ (x >>> 15), 1 | x);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function hashPair(a: string, b: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  const combined = `${a}|${b}`;
  for (let i = 0; i < combined.length; i++) {
    h ^= combined.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

function isCoarseChinaIslandPolygon(rings: number[][][]): boolean {
  const outer = rings[0];
  if (!outer || outer.length === 0 || outer.length > 24) return false;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < outer.length; i++) {
    const [lng, lat] = outer[i];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  // Filter out 110m Hainan and Taiwan polygons so high-detail china-geo.json
  // renders them cleanly without coarse double-coastline outlines on zoom.
  const isHainan =
    minLng >= 108.2 && maxLng <= 111.5 && minLat >= 17.8 && maxLat <= 20.4;
  const isTaiwan =
    minLng >= 119.5 && maxLng <= 122.4 && minLat >= 21.5 && maxLat <= 25.6;
  return isHainan || isTaiwan;
}

function useLandPolygons() {
  const [landPolygons, setLandPolygons] = useState<object[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchLandPolygons() {
      const landTopo = await import('../../data/land-110m.json');
      const topoAny = landTopo as unknown as {
        objects: { land: Parameters<typeof topojson.feature>[1] };
      };
      const featureCollection = topojson.feature(
        topoAny as unknown as Parameters<typeof topojson.feature>[0],
        topoAny.objects.land
      ) as unknown as {
        features: Array<{
          geometry?: {
            type?: string;
            coordinates?: number[][][][];
          };
        }>;
      };
      const filteredFeatures = featureCollection.features.map(feature => {
        if (
          feature.geometry?.type === 'MultiPolygon' &&
          Array.isArray(feature.geometry.coordinates)
        ) {
          return {
            ...feature,
            geometry: {
              ...feature.geometry,
              coordinates: feature.geometry.coordinates.filter(
                poly => !isCoarseChinaIslandPolygon(poly)
              )
            }
          };
        }
        return feature;
      });
      if (!cancelled) {
        setLandPolygons(filteredFeatures);
      }
    }
    fetchLandPolygons();
    return () => {
      cancelled = true;
    };
  }, []);

  const polygonMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        opacity: 0.77,
        transparent: true
      }),
    []
  );

  useEffect(() => {
    return () => {
      polygonMaterial.dispose();
    };
  }, [polygonMaterial]);

  return { landPolygons, polygonMaterial };
}

function usePoints(albums: Array<Album>) {
  const [altitude, setAltitude] = useState(0.002);
  const points = useMemo(() => {
    const pts: Array<{ lat: number; lng: number; radius: number }> = [];
    const locations = albums.filter(
      album =>
        album.type === types.LOCATION && (album.lat !== 0 || album.lng !== 0)
    );
    for (const album of locations) {
      pts.push(
        { lat: album.lat, lng: album.lng, radius: 0.19 },
        ...album.locations.map(location => ({
          lat: location.lat,
          lng: location.lng,
          radius: 0.135
        }))
      );
    }
    return pts;
  }, [albums]);

  return {
    pointAltitude: altitude,
    setPointAltitude: setAltitude,
    points
  };
}

function useRings(
  globeEl: GlobeEl,
  setPointAltitude: React.Dispatch<React.SetStateAction<number>>,
  isCityFocusedRef: React.MutableRefObject<boolean>,
  hoveredProvinceRef: React.MutableRefObject<string | null>,
  syncHighlightRef: React.MutableRefObject<{ sync: (() => void) | null }>,
  prefersReducedMotion: boolean
) {
  const [activeAlbumTitle, setActiveAlbumTitle] = useState<AlbumTitle>();
  const [rings, setRings] = useState<Array<Ring>>([]);

  const timersRef = useRef<{
    enter?: ReturnType<typeof setTimeout>;
    leave?: ReturnType<typeof setTimeout>;
  }>({});

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      clearTimeout(timers.enter);
      clearTimeout(timers.leave);
    };
  }, []);

  const handleMouseEnter = useCallback(
    ({ lat, lng, title, type, province }: Album) => {
      clearTimeout(timersRef.current.leave);
      clearTimeout(timersRef.current.enter);

      setActiveAlbumTitle(title);
      hoveredProvinceRef.current =
        type === types.LOCATION ? (province ?? null) : null;
      syncHighlightRef.current.sync?.();

      timersRef.current.enter = setTimeout(() => {
        const globe = globeEl.current;
        if (!globe) return;

        const transitionMs = prefersReducedMotion ? 0 : 800;

        if (type === types.LOCATION) {
          isCityFocusedRef.current = true;
          setPointAltitude(0.002);

          globe.pointOfView(
            {
              lat,
              lng,
              altitude: CITY_FOCUS_ALTITUDE
            },
            transitionMs
          );

          globe.controls().autoRotate = false;
          globe.controls().autoRotateForced = false;

          setRings(
            prefersReducedMotion
              ? []
              : [
                  {
                    lat,
                    lng,
                    maxR: 4.6,
                    propagationSpeed: 1.25,
                    repeatPeriod: 1450,
                    variant: 'primary'
                  },
                  {
                    lat,
                    lng,
                    maxR: 3.0,
                    propagationSpeed: 0.9,
                    repeatPeriod: 1450,
                    variant: 'secondary'
                  }
                ]
          );
        } else if (type === types.CUSTOM) {
          isCityFocusedRef.current = false;
          setPointAltitude(1.4);

          globe.pointOfView(DEFAULT_POV, transitionMs);

          globe.controls().autoRotate = !prefersReducedMotion;
          globe.controls().autoRotateForced = !prefersReducedMotion;
          globe.controls().autoRotateSpeed = 3.5 * DEFAULT_AUTOROTATE_SPEED;

          setRings(
            prefersReducedMotion
              ? []
              : [
                  {
                    lat: 90,
                    lng: 0,
                    maxR: 180,
                    propagationSpeed: 24,
                    repeatPeriod: 240,
                    variant: 'secondary'
                  }
                ]
          );
        }
      }, 0);
    },
    [
      globeEl,
      hoveredProvinceRef,
      isCityFocusedRef,
      prefersReducedMotion,
      setPointAltitude,
      syncHighlightRef
    ]
  );

  const handleMouseLeave = useCallback(() => {
    clearTimeout(timersRef.current.enter);
    clearTimeout(timersRef.current.leave);

    timersRef.current.leave = setTimeout(() => {
      isCityFocusedRef.current = false;
      hoveredProvinceRef.current = null;
      syncHighlightRef.current.sync?.();
      setPointAltitude(0.002);
      setActiveAlbumTitle(undefined);

      const globe = globeEl.current;
      if (globe) {
        globe.pointOfView(DEFAULT_POV, prefersReducedMotion ? 0 : 850);
        globe.controls().autoRotate = false;
        globe.controls().autoRotateForced = false;
      }

      setRings([]);
    }, 60);
  }, [
    globeEl,
    hoveredProvinceRef,
    isCityFocusedRef,
    prefersReducedMotion,
    setPointAltitude,
    syncHighlightRef
  ]);

  return {
    activeAlbumTitle,
    rings,
    handleMouseEnter,
    handleMouseLeave
  };
}

function generateArcs(albums: Array<Album>): Array<Arc> {
  const locationAlbums = albums.filter(
    album =>
      album.type === types.LOCATION && (album.lat !== 0 || album.lng !== 0)
  );
  const data: Array<Arc> = [];
  for (let i = 0; i < locationAlbums.length; i++) {
    for (let j = i + 1; j < locationAlbums.length; j++) {
      const a = locationAlbums[i];
      const b = locationAlbums[j];
      const uLen = deterministicUnit(hashPair(a.title, b.title, 1));
      const uGap = deterministicUnit(hashPair(a.title, b.title, 2));
      const uTime = deterministicUnit(hashPair(a.title, b.title, 3));

      data.push({
        startLat: a.lat,
        startLng: a.lng,
        endLat: b.lat,
        endLng: b.lng,
        startTitle: a.title,
        endTitle: b.title,
        dashLength: 0.24 + uLen * 0.36,
        dashGap: 0.4 + uGap * 1.15,
        dashAnimateTime: Math.round(3600 + uTime * 5400)
      });
    }
  }
  return data;
}

function useArcs(albums: Array<Album>) {
  const arcs = useMemo(() => generateArcs(albums), [albums]);
  return { arcs };
}

function useGlobeReady(globeEl: GlobeEl, isCompact: boolean) {
  const [globeReady, setGlobeReady] = useState(false);

  useEffect(() => {
    if (globeReady && globeEl.current) {
      globeEl.current.controls().enabled = false;
      globeEl.current.controls().enableZoom = false;
      globeEl.current.controls().autoRotate = false;

      globeEl.current.pointOfView(DEFAULT_POV);
    }
  }, [globeEl, globeReady]);

  useEffect(() => {
    if (!globeReady || !globeEl.current) return;
    const renderer = globeEl.current.renderer();
    if (renderer) {
      const maxDpr = isCompact ? 1.5 : 2;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    }
  }, [globeEl, globeReady, isCompact]);

  const handleGlobeReady = useCallback(() => {
    setGlobeReady(true);
  }, []);

  return {
    globeReady,
    handleGlobeReady
  };
}

function useScene(
  globeEl: GlobeEl,
  globeReady: boolean,
  isCompact: boolean,
  isCityFocusedRef: React.MutableRefObject<boolean>,
  hoveredProvinceRef: React.MutableRefObject<string | null>,
  syncHighlightRef: React.MutableRefObject<{ sync: (() => void) | null }>,
  prefersReducedMotion: boolean
) {
  const mouseTargetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (prefersReducedMotion) {
      mouseTargetRef.current.x = 0;
      mouseTargetRef.current.y = 0;
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseTargetRef.current.x =
        (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      mouseTargetRef.current.y =
        (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [prefersReducedMotion]);

  // Ambient single-draw-call particle field sized for desktop vs compact viewports
  useEffect(() => {
    const globe = globeEl.current;
    if (!globeReady || !globe) return;

    const scene = globe.scene();
    const globeRadius = globe.getGlobeRadius();
    const particles = createAmbientParticles(globeRadius, isCompact);
    scene.add(particles.points);

    return () => {
      scene.remove(particles.points);
      particles.dispose();
    };
  }, [globeEl, globeReady, isCompact]);

  // Core scene geometry (graticules, dual-layer China map + highlights, inner sphere) & damped RAF
  useEffect(() => {
    const globe = globeEl.current;
    if (!globeReady || !globe) return;

    const scene = globe.scene();
    const globeRadius = globe.getGlobeRadius();

    const graticuleGeometry = new GeoJsonGeometry(geoGraticule10(), 300, 2);
    const graticuleMaterial = new THREE.LineBasicMaterial({
      color: 'lightgrey',
      transparent: true,
      opacity: 0.42
    });
    const graticules = new THREE.LineSegments(
      graticuleGeometry,
      graticuleMaterial
    );
    scene.add(graticules);

    // Dual-layer deduplicated China borders + soft-white backing mask + per-province highlights
    const chinaMap = createChinaMapLayers(globeRadius);
    scene.add(chinaMap.group);

    const innerSphereGeometry = new THREE.SphereGeometry(
      globeRadius - 6,
      64,
      32
    );
    const innerSphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.47,
      transparent: true
    });
    const innerSphere = new THREE.Mesh(
      innerSphereGeometry,
      innerSphereMaterial
    );
    innerSphere.renderOrder = Number.MAX_SAFE_INTEGER;
    scene.add(innerSphere);

    // Mouse-driven 3D spherical parallax + subtle ambient breathing around China
    const chinaTheta = ((90 - DEFAULT_POV.lng) * Math.PI) / 180;
    const rightAxis = new THREE.Vector3(
      -Math.sin(chinaTheta),
      0,
      Math.cos(chinaTheta)
    ).normalize();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const qLon = new THREE.Quaternion();
    const qLat = new THREE.Quaternion();

    let curX = 0;
    let curY = 0;
    let rafId = 0;
    let lastTime = performance.now();
    let isDisposed = false;

    const animateFrame = (now: number) => {
      if (isDisposed || document.hidden) {
        rafId = 0;
        return;
      }

      const dt = Math.min(0.05, Math.max(0, (now - lastTime) * 0.001));
      lastTime = now;

      const t = now * 0.001;
      const parallaxDamp = 1 - Math.exp(-5.2 * dt);
      const highlightDamp = 1 - Math.exp(-10 * dt);

      const targetX = isCityFocusedRef.current
        ? 0
        : mouseTargetRef.current.x * 0.3 + Math.sin(t * 0.42) * 0.04;
      const targetY = isCityFocusedRef.current
        ? 0
        : mouseTargetRef.current.y * 0.22 + Math.cos(t * 0.34) * 0.028;

      curX += (targetX - curX) * parallaxDamp;
      curY += (targetY - curY) * parallaxDamp;

      qLon.setFromAxisAngle(upAxis, -curX);
      qLat.setFromAxisAngle(rightAxis, curY);
      scene.quaternion.copy(qLat).multiply(qLon);

      chinaMap.updateHighlight(hoveredProvinceRef.current, highlightDamp);

      rafId = requestAnimationFrame(animateFrame);
    };

    const startLoop = () => {
      if (isDisposed || prefersReducedMotion || document.hidden || rafId !== 0) {
        return;
      }
      lastTime = performance.now();
      rafId = requestAnimationFrame(animateFrame);
    };

    const stopLoop = () => {
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const syncHighlight = syncHighlightRef.current;

    if (prefersReducedMotion) {
      scene.quaternion.identity();
      chinaMap.updateHighlight(hoveredProvinceRef.current, 1);
      syncHighlight.sync = () => {
        chinaMap.updateHighlight(hoveredProvinceRef.current, 1);
      };
    } else {
      syncHighlight.sync = null;
      startLoop();
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
        globe.pauseAnimation();
      } else {
        globe.resumeAnimation();
        if (prefersReducedMotion) {
          chinaMap.updateHighlight(hoveredProvinceRef.current, 1);
        } else {
          startLoop();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isDisposed = true;
      stopLoop();
      syncHighlight.sync = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      scene.quaternion.identity();

      scene.remove(graticules);
      graticuleGeometry.dispose();
      graticuleMaterial.dispose();

      scene.remove(chinaMap.group);
      chinaMap.dispose();

      scene.remove(innerSphere);
      innerSphereGeometry.dispose();
      innerSphereMaterial.dispose();
    };
  }, [
    globeEl,
    globeReady,
    hoveredProvinceRef,
    isCityFocusedRef,
    prefersReducedMotion,
    syncHighlightRef
  ]);
}

function Globe({
  albums,
  photographerName = 'L. Photography'
}: {
  albums: Array<Album>;
  photographerName?: string;
  copyrightName?: string;
}) {
  const globeEl = useRef<Ref>();
  const isCityFocusedRef = useRef(false);
  const hoveredProvinceRef = useRef<string | null>(null);
  const syncHighlightRef = useRef<{ sync: (() => void) | null }>({
    sync: null
  });

  const { width, height } = useWindowSize();
  const isCompact =
    (width ?? (typeof window !== 'undefined' ? window.innerWidth : 1024)) < 768;
  const prefersReducedMotion = usePrefersReducedMotion();

  const { globeReady, handleGlobeReady } = useGlobeReady(globeEl, isCompact);

  useScene(
    globeEl,
    globeReady,
    isCompact,
    isCityFocusedRef,
    hoveredProvinceRef,
    syncHighlightRef,
    prefersReducedMotion
  );

  const { landPolygons, polygonMaterial } = useLandPolygons();
  const { points, pointAltitude, setPointAltitude } = usePoints(albums);

  const { rings, handleMouseEnter, handleMouseLeave, activeAlbumTitle } =
    useRings(
      globeEl,
      setPointAltitude,
      isCityFocusedRef,
      hoveredProvinceRef,
      syncHighlightRef,
      prefersReducedMotion
    );

  const activeAlbum = useMemo(
    () => albums.find(album => album.title === activeAlbumTitle),
    [albums, activeAlbumTitle]
  );

  const activeLocationTitle =
    activeAlbum?.type === types.LOCATION ? activeAlbum.title : undefined;

  const { arcs } = useArcs(albums);

  const arcColor = useCallback(
    (arc: object) => {
      if (!activeLocationTitle) return ARC_COLOR_DEFAULT;
      const typedArc = arc as Arc;
      const isConnected =
        typedArc.startTitle === activeLocationTitle ||
        typedArc.endTitle === activeLocationTitle;
      return isConnected ? ARC_COLOR_FOCUSED : ARC_COLOR_DIMMED;
    },
    [activeLocationTitle]
  );

  const polygonStrokeColor = useCallback(
    () => 'rgba(100, 116, 139, 0.34)',
    []
  );

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
      <GlobeGL
        ref={globeEl}
        width={width}
        height={height}
        rendererConfig={{ antialias: true }}
        onGlobeReady={handleGlobeReady}
        enablePointerInteraction={false}
        animateIn={false}
        backgroundColor="rgba(0,0,0,0)"
        atmosphereColor="rgba(255, 255, 255, 1)"
        showGlobe={false}
        showAtmosphere={false}
        showGraticules={false}
        polygonsData={landPolygons}
        polygonCapMaterial={polygonMaterial}
        polygonsTransitionDuration={0}
        polygonAltitude={POLYGON_ALTITUDE}
        polygonSideColor={POLYGON_SIDE_COLOR}
        polygonStrokeColor={polygonStrokeColor}
        pointsData={points}
        pointColor={POINT_COLOR}
        pointAltitude={pointAltitude}
        pointRadius={POINT_RADIUS}
        pointsMerge={true}
        ringsData={rings}
        ringColor={RING_COLOR}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        arcsData={arcs}
        arcColor={arcColor}
        arcsTransitionDuration={0}
        arcDashLength={ARC_DASH_LENGTH}
        arcDashGap={ARC_DASH_GAP}
        arcDashAnimateTime={
          prefersReducedMotion
            ? ARC_DASH_ANIMATE_TIME_STATIC
            : ARC_DASH_ANIMATE_TIME_DYNAMIC
        }
      />

      <section className="content-container grow text-3xl">
        <h1 className="font-bold mb-12 sm:mb-20 text-center md:text-left">
          {photographerName}
        </h1>

        <ul
          className={`flex flex-col items-center
            md:items-start tracking-tight`}
        >
          {albums.map(album => {
            const isActive = activeAlbumTitle === album.title;
            const hasOtherActive = Boolean(activeAlbumTitle) && !isActive;

            return (
              <li
                key={album.title}
                className="max-w-fit"
                onMouseEnter={() => {
                  handleMouseEnter(album);
                }}
                onMouseLeave={() => {
                  handleMouseLeave();
                }}
                onFocus={() => {
                  handleMouseEnter(album);
                }}
                onBlur={() => {
                  handleMouseLeave();
                }}
              >
                <Link
                  href={`/${titleToSlug(album.title, album.slug)}`}
                  className={`inline-flex items-center transition-all duration-200 ease-out ${
                    isActive
                      ? 'text-gray-900 md:translate-x-1.5'
                      : hasOtherActive
                        ? 'text-gray-400/70'
                        : 'text-gray-900 hover:text-gray-700'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`hidden md:inline-block h-[1.5px] bg-red-800 rounded-full transition-all duration-200 ease-out ${
                      isActive ? 'w-3.5 mr-2.5 opacity-100' : 'w-0 mr-0 opacity-0'
                    }`}
                  />
                  <span>{album.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {activeAlbum && <AlbumCard key={activeAlbum.title} album={activeAlbum} />}

      <footer className="tracking-tight content z-10">
        <div className="flex items-center justify-center md:justify-end gap-4 text-3xl">
          <p className="m-0 p-0 leading-none">
            &copy; {new Date().getFullYear()}
          </p>
          <span
            className="h-5 w-px bg-gray-300/80"
            aria-hidden="true"
          />
          <div className="flex items-center gap-3.5 text-gray-500">
            <a
              href={XIAOHONGSHU_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Xiaohongshu"
              title="Xiaohongshu"
              className="inline-flex items-center justify-center transition-colors duration-200 hover:text-[#ff2442]"
            >
              <XiaohongshuLogo className="size-5" />
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              title="GitHub"
              className="inline-flex items-center justify-center transition-colors duration-200 hover:text-black"
            >
              <GitHubLogo className="size-5" />
            </a>
          </div>
        </div>
      </footer>
    </section>
  );
}

export default Globe;
