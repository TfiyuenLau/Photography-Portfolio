'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import GlobeGL from 'react-globe.gl';
import type { GlobeProps, GlobeMethods } from 'react-globe.gl';
import { GeoJsonGeometry } from 'three-geojson-geometry';
import { geoGraticule10 } from 'd3-geo';
import * as topojson from 'topojson-client';
import { useWindowSize } from '@/hooks/use-window-size';
import { Album, AlbumTitle, types } from '@/types/albums';
import { titleToSlug } from '@/lib/api/slug';
import Link from 'next/link';
import { AlbumCard } from './card';
import chinaGeoData from '@/data/china-geo.json';

type Ref = CustomGlobeMethods | undefined; // Reference to globe instance
type GlobeEl = React.MutableRefObject<Ref>; // React `ref` passed to globe element

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
};

type Arc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: Array<string>;
};

const DEFAULT_AUTOROTATE_SPEED = 1.75;
// Enlarged globe view focused directly on China
const DEFAULT_POV = { lat: 32, lng: 105, altitude: 1.22 };
const CITY_FOCUS_ALTITUDE = 0.38;

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Stable module-level accessors so react-globe.gl never re-digests layers on hover re-renders
const POLYGON_ALTITUDE = () => 0;
const POLYGON_SIDE_COLOR = () => 'rgba(255, 255, 255, 0)';
const POINT_COLOR = () => 'rgba(255, 0, 0, 0.75)';
const POINT_RADIUS = (point: object) => (point as { radius: number }).radius;
const RING_COLOR_INTERPOLATOR = (t: number) =>
  `rgba(255,100,50,${Math.sqrt(1 - t)})`;
const RING_COLOR = () => RING_COLOR_INTERPOLATOR;
const ARC_DASH_LENGTH = () => randomInRange(0.06, 0.7) / 1;
const ARC_DASH_GAP = () => randomInRange(0.025, 0.4) * 10;
const ARC_DASH_ANIMATE_TIME = () => randomInRange(0.08, 0.8) * 20000 + 500;

function buildChinaMultiLineGeoJson() {
  const lines: number[][][] = [];
  for (const feature of (chinaGeoData as any).features || []) {
    if (!feature.properties?.name || !feature.geometry) continue;
    const polys =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring || ring.length < 14) continue;
      const simplified = ring.filter(
        (_: unknown, i: number) => i % 2 === 0 || i === ring.length - 1
      );
      lines.push(simplified);
    }
  }
  return {
    type: 'MultiLineString',
    coordinates: lines
  };
}

function useLandPolygons() {
  const [landPolygons, setLandPolygons] = useState([]);
  useEffect(() => {
    async function fetchLandPolygons() {
      const landTopo = await import('../../data/land-110m.json');
      const polygons = (
        topojson.feature(
          landTopo as any,
          (landTopo as any).objects.land
        ) as any
      ).features;
      setLandPolygons(polygons);
    }
    fetchLandPolygons();
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

  return { landPolygons, polygonMaterial };
}

function usePoints(albums: Array<Album>) {
  const [altitude, setAltitude] = useState(0.002);
  const points = useMemo(() => {
    const pts = [];
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
  globeElRef: CustomGlobeMethods,
  setPointAltitude: React.Dispatch<React.SetStateAction<number>>,
  isCityFocusedRef: React.MutableRefObject<boolean>
) {
  const [activeAlbumTitle, setActiveAlbumTitle] = useState<AlbumTitle>();
  const [rings, setRings] = useState<Array<Ring>>([]);

  const enterTimeoutRef = useRef<NodeJS.Timeout>();
  const leaveTimeoutRef = useRef<NodeJS.Timeout>();

  function handleMouseEnter({ lat, lng, title, type }: Album) {
    clearTimeout(leaveTimeoutRef.current);
    clearTimeout(enterTimeoutRef.current);

    setActiveAlbumTitle(title);

    enterTimeoutRef.current = setTimeout(() => {
      if (!globeElRef) return;
      if (type === types.LOCATION) {
        isCityFocusedRef.current = true;
        setPointAltitude(0.002);

        globeElRef.pointOfView(
          {
            lat,
            lng,
            altitude: CITY_FOCUS_ALTITUDE
          },
          800
        );

        globeElRef.controls().autoRotate = false;
        globeElRef.controls().autoRotateForced = false;

        setRings([
          { lat, lng, maxR: 4.5, propagationSpeed: 1.15, repeatPeriod: 1300 }
        ]);
      } else if (type === types.CUSTOM) {
        isCityFocusedRef.current = false;
        setPointAltitude(1.4);

        globeElRef.pointOfView(DEFAULT_POV, 800);

        globeElRef.controls().autoRotate = true;
        globeElRef.controls().autoRotateForced = true;
        globeElRef.controls().autoRotateSpeed = 3.5 * DEFAULT_AUTOROTATE_SPEED;

        setRings([
          {
            lat: 90,
            lng: 0,
            maxR: 180,
            propagationSpeed: 27,
            repeatPeriod: 195
          }
        ]);
      }
    }, 0);
  }

  function handleMouseLeave() {
    clearTimeout(enterTimeoutRef.current);
    clearTimeout(leaveTimeoutRef.current);

    leaveTimeoutRef.current = setTimeout(() => {
      isCityFocusedRef.current = false;
      setPointAltitude(0.002);
      setActiveAlbumTitle(undefined);

      if (globeElRef) {
        globeElRef.pointOfView(DEFAULT_POV, 850);

        globeElRef.controls().autoRotate = false;
        globeElRef.controls().autoRotateForced = false;
      }

      setRings([]);
    }, 60);
  }

  return {
    activeAlbumTitle,
    rings,
    handleMouseEnter,
    handleMouseLeave
  };
}

function generateArcs(albums: Array<Album>) {
  const locationAlbums = albums.filter(
    album =>
      album.type === types.LOCATION && (album.lat !== 0 || album.lng !== 0)
  );
  const data = [];
  for (let i = 0; i < locationAlbums.length; i++) {
    for (let j = i + 1; j < locationAlbums.length; j++) {
      data.push({
        startLat: locationAlbums[i].lat,
        startLng: locationAlbums[i].lng,
        endLat: locationAlbums[j].lat,
        endLng: locationAlbums[j].lng,
        color: ['red', 'red']
      });
    }
  }
  return data;
}

function useArcs(albums: Array<Album>) {
  const [arcs, setArcs] = useState<Array<Arc>>([]);
  useEffect(() => {
    setArcs(generateArcs(albums));
  }, [albums]);

  return { arcs };
}

function useCustomLayer(globeEl: GlobeEl) {
  const customLayerData = useMemo(() => {
    const numbers = Array.from(Array(500), (_, index) => index);
    return numbers.map(() => ({
      lat: (Math.random() - 0.5) * 180,
      lng: (Math.random() - 0.5) * 360,
      alt: Math.random() * 1.4 + 0.1
    }));
  }, []);

  const customThreeObject = useCallback(
    () =>
      new THREE.Mesh(
        new THREE.SphereGeometry(0.22),
        new THREE.MeshBasicMaterial({
          color: '#777777',
          opacity: 0.25,
          transparent: true
        })
      ),
    []
  );

  const customThreeObjectUpdate: GlobeProps['customThreeObjectUpdate'] =
    useCallback(
      (object: THREE.Object3D, objectData: object) => {
        const typedObjectData = objectData as {
          lat: number;
          lng: number;
          alt: number;
        };
        const coords = globeEl.current?.getCoords(
          typedObjectData.lat,
          typedObjectData.lng,
          typedObjectData.alt
        );
        if (coords) {
          Object.assign(object.position, coords);
        }
      },
      [globeEl]
    );

  return {
    customLayerData,
    customThreeObject,
    customThreeObjectUpdate
  };
}

function useGlobeReady(globeEl: GlobeEl) {
  const [globeReady, setGlobeReady] = useState(false);

  useEffect(() => {
    if (globeReady && globeEl.current) {
      globeEl.current.controls().enabled = false;
      globeEl.current.controls().enableZoom = false;
      globeEl.current.controls().autoRotate = false;

      globeEl.current.pointOfView(DEFAULT_POV);
    }
  }, [globeEl, globeReady]);

  return {
    handleGlobeReady: () => setGlobeReady(true)
  };
}

function useScene(
  globeElRef: Ref,
  isCityFocusedRef: React.MutableRefObject<boolean>
) {
  const mouseTargetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseTargetRef.current.x =
        (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      mouseTargetRef.current.y =
        (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (!globeElRef) return;

    const scene = globeElRef.scene();

    const radius = 300;
    const graticules = new THREE.LineSegments(
      new GeoJsonGeometry(geoGraticule10(), radius, 2),
      new THREE.LineBasicMaterial({
        color: 'lightgrey',
        transparent: true,
        opacity: 0.47
      })
    );
    scene.add(graticules);

    // Highlight China provincial map directly on the globe sphere in a single static buffer
    const chinaGeoJson = buildChinaMultiLineGeoJson();
    const chinaBorders = new THREE.LineSegments(
      new GeoJsonGeometry(
        chinaGeoJson as any,
        globeElRef.getGlobeRadius() + 0.15,
        5
      ),
      new THREE.LineBasicMaterial({
        color: '#b91c1c',
        transparent: true,
        opacity: 0.6
      })
    );
    scene.add(chinaBorders);

    const innerSphereGeometry = new THREE.SphereGeometry(
      globeElRef.getGlobeRadius() - 6,
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

    // Mouse-driven 3D spherical rotation + subtle ambient breathing around China
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

    const animateSphereRotation = (now: number) => {
      const t = now * 0.001;
      const dampFactor = isCityFocusedRef.current ? 0.2 : 1.0;

      const targetX =
        mouseTargetRef.current.x * 0.34 * dampFactor +
        Math.sin(t * 0.45) * 0.045 * dampFactor;
      const targetY =
        mouseTargetRef.current.y * 0.24 * dampFactor +
        Math.cos(t * 0.35) * 0.03 * dampFactor;

      curX += (targetX - curX) * 0.065;
      curY += (targetY - curY) * 0.065;

      qLon.setFromAxisAngle(upAxis, -curX);
      qLat.setFromAxisAngle(rightAxis, curY);
      scene.quaternion.copy(qLat).multiply(qLon);

      rafId = requestAnimationFrame(animateSphereRotation);
    };
    rafId = requestAnimationFrame(animateSphereRotation);

    return () => {
      cancelAnimationFrame(rafId);
      scene.quaternion.identity();
      scene.remove(graticules);
      scene.remove(chinaBorders);
      scene.remove(innerSphere);
    };
  }, [globeElRef, isCityFocusedRef]);
}

function Globe({
  albums,
  photographerName = 'L. Photography'
}: {
  albums: Array<Album>;
  photographerName?: string;
  copyrightName?: string;
}) {
  // object config
  const globeEl = useRef<Ref>();
  const globeElRef: Ref = globeEl.current;
  const isCityFocusedRef = useRef(false);

  const { handleGlobeReady } = useGlobeReady(globeEl);

  // scene config
  useScene(globeElRef, isCityFocusedRef);

  // land shapes
  const { landPolygons, polygonMaterial } = useLandPolygons();

  // `albums` map points
  const { points, pointAltitude, setPointAltitude } = usePoints(albums);

  // rings animation
  const { rings, handleMouseEnter, handleMouseLeave, activeAlbumTitle } =
    useRings(globeElRef as CustomGlobeMethods, setPointAltitude, isCityFocusedRef);
  const activeAlbum = albums.find(album => album.title === activeAlbumTitle);

  // arcs animation
  const { arcs } = useArcs(albums);

  // resize canvas on resize viewport
  const { width, height } = useWindowSize();

  // stars in the background
  const { customLayerData, customThreeObject, customThreeObjectUpdate } =
    useCustomLayer(globeEl);

  const isMac =
    navigator.platform.toLowerCase().includes('mac') ||
    navigator.userAgent.toLowerCase().includes('mac');

  const polygonStrokeColor = useCallback(
    () => (isMac ? 'black' : 'darkslategray'),
    [isMac]
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
        rendererConfig={{ antialias: true }} // `false` yields much better performance
        onGlobeReady={handleGlobeReady}
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
        polygonStrokeColor={polygonStrokeColor} // compensate for platform's polygon rendering differences
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
        arcColor={'color'}
        arcDashLength={ARC_DASH_LENGTH} // the bigger the ranges, the calmer it looks
        arcDashGap={ARC_DASH_GAP}
        arcDashAnimateTime={ARC_DASH_ANIMATE_TIME}
        customLayerData={customLayerData}
        customThreeObject={customThreeObject}
        customThreeObjectUpdate={customThreeObjectUpdate}
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
              >
                <Link
                  href={`/${titleToSlug(album.title, album.slug)}`}
                  className="hover:text-gray-500"
                >
                  {album.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {activeAlbum && <AlbumCard album={activeAlbum} />}

      <footer className={`tracking-tight content`}>
        <div className="text-3xl text-center md:text-right">
          <p className="m-0 p-0">&copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </section>
  );
}

export default Globe;
