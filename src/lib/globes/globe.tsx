'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
};

type Arc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: Array<string>;
};

type GlobePolygon = {
  type: string;
  properties?: Record<string, any>;
  geometry: any;
  isChina?: boolean;
};

const DEFAULT_AUTOROTATE_SPEED = 1.75;
const DEFAULT_POV = { lat: 30, lng: 106, altitude: 1.95 };
const CITY_FOCUS_ALTITUDE = 0.35;
const CITY_TRANSITION_MS = 780;
const LEAVE_TRANSITION_MS = 850;

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function useLandPolygons() {
  const [landPolygons, setLandPolygons] = useState<Array<GlobePolygon>>([]);
  const [polygonMaterial] = useState(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        opacity: 0.77,
        transparent: true
      })
  );

  useEffect(() => {
    async function fetchLandPolygons() {
      const [landTopo, chinaGeo] = await Promise.all([
        import('../../data/land-110m.json'),
        import('../../data/china-geo.json')
      ]);
      const worldFeatures = (
        topojson.feature(
          landTopo as any,
          (landTopo as any).objects.land
        ) as any
      ).features.map((f: any) => ({
        ...f,
        isChina: false
      }));

      const chinaFeatures = ((chinaGeo as any).features || [])
        .filter((f: any) => Boolean(f.properties?.name))
        .map((f: any) => ({
          ...f,
          isChina: true
        }));

      setLandPolygons([...worldFeatures, ...chinaFeatures]);
    }
    fetchLandPolygons();
  }, []);

  const getPolygonAltitude = useCallback(
    (d: object) => ((d as GlobePolygon).isChina ? 0.0015 : 0),
    []
  );

  return { landPolygons, polygonMaterial, getPolygonAltitude };
}

function usePoints(albums: Array<Album>) {
  const [altitude, setAltitude] = useState(0.003);
  const points = [];
  const locations = albums.filter(
    album => album.type === types.LOCATION && (album.lat !== 0 || album.lng !== 0)
  );
  for (const album of locations) {
    points.push(
      { lat: album.lat, lng: album.lng, radius: 0.22 },
      ...album.locations.map(location => ({
        lat: location.lat,
        lng: location.lng,
        radius: 0.14
      }))
    );
  }
  return {
    pointAltitude: altitude,
    setPointAltitude: setAltitude,
    points
  };
}

function useRings(
  globeEl: GlobeEl,
  setPointAltitude: React.Dispatch<React.SetStateAction<number>>
) {
  const [activeAlbumTitle, setActiveAlbumTitle] = useState<AlbumTitle>();
  const [rings, setRings] = useState<Array<Ring>>([]);
  const colorInterpolator = useCallback(
    (t: number) => `rgba(255,100,50,${Math.sqrt(1 - t)})`,
    []
  );

  const enterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function handleMouseEnter({ lat, lng, title, type }: Album) {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    if (enterTimeoutRef.current) {
      clearTimeout(enterTimeoutRef.current);
    }

    setActiveAlbumTitle(title);

    enterTimeoutRef.current = setTimeout(() => {
      const globe = globeEl.current;
      if (!globe) return;

      if (type === types.LOCATION) {
        setPointAltitude(0.003);

        globe.pointOfView(
          {
            lat,
            lng,
            altitude: CITY_FOCUS_ALTITUDE
          },
          CITY_TRANSITION_MS
        );

        globe.controls().autoRotateForced = true;
        globe.controls().autoRotateSpeed = 0.12;

        setRings([
          { lat, lng, maxR: 4.2, propagationSpeed: 1.35, repeatPeriod: 1100 }
        ]);
      } else if (type === types.CUSTOM) {
        setPointAltitude(1.4);

        globe.pointOfView(
          {
            lat: DEFAULT_POV.lat,
            lng: DEFAULT_POV.lng,
            altitude: DEFAULT_POV.altitude
          },
          CITY_TRANSITION_MS
        );

        globe.controls().autoRotateForced = true;
        globe.controls().autoRotateSpeed = 3.7 * DEFAULT_AUTOROTATE_SPEED;

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
    }, 35);
  }

  function handleMouseLeave() {
    if (enterTimeoutRef.current) {
      clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
    }

    leaveTimeoutRef.current = setTimeout(() => {
      setPointAltitude(0.003);
      setActiveAlbumTitle(undefined);

      const globe = globeEl.current;
      if (globe) {
        globe.pointOfView(
          {
            lat: DEFAULT_POV.lat,
            lng: DEFAULT_POV.lng,
            altitude: DEFAULT_POV.altitude
          },
          LEAVE_TRANSITION_MS
        );

        globe.controls().autoRotateForced = false;
        globe.controls().autoRotateSpeed = DEFAULT_AUTOROTATE_SPEED;
      }

      setRings([]);
    }, 90);
  }

  return {
    activeAlbumTitle,
    rings,
    colorInterpolator,
    handleMouseEnter,
    handleMouseLeave
  };
}

function generateArcs(albums: Array<Album>) {
  const locationAlbums = albums.filter(
    album => album.type === types.LOCATION && (album.lat !== 0 || album.lng !== 0)
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
  const [customLayerData] = useState(() =>
    Array.from({ length: 500 }, () => ({
      lat: (Math.random() - 0.5) * 180,
      lng: (Math.random() - 0.5) * 360,
      alt: Math.random() * 1.4 + 0.1
    }))
  );

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
    if (!globeReady || !globeEl.current) return;

    let rafId = 0;

    // Faster autoRotate speed over empty oceans outside Asia-Pacific
    const autoRotateSpeed = () => {
      if (globeEl.current) {
        const { lng } = globeEl.current.pointOfView();
        let newSpeed = DEFAULT_AUTOROTATE_SPEED;

        const distFromChina = Math.abs(
          ((lng - DEFAULT_POV.lng + 540) % 360) - 180
        );
        if (distFromChina > 120) {
          newSpeed = 2.25 * DEFAULT_AUTOROTATE_SPEED;
        } else if (distFromChina > 90) {
          newSpeed = 1.85 * DEFAULT_AUTOROTATE_SPEED;
        } else if (distFromChina > 60) {
          newSpeed = 1.45 * DEFAULT_AUTOROTATE_SPEED;
        } else if (distFromChina > 40) {
          newSpeed = 1.2 * DEFAULT_AUTOROTATE_SPEED;
        }

        if (!globeEl.current.controls().autoRotateForced) {
          globeEl.current.controls().autoRotateSpeed = newSpeed;
        }
      }
      rafId = requestAnimationFrame(autoRotateSpeed);
    };

    globeEl.current.controls().enabled = false;
    globeEl.current.controls().enableZoom = false;
    globeEl.current.controls().autoRotate = true;
    globeEl.current.controls().autoRotateSpeed = DEFAULT_AUTOROTATE_SPEED;

    globeEl.current.pointOfView(DEFAULT_POV);

    rafId = requestAnimationFrame(autoRotateSpeed);

    return () => cancelAnimationFrame(rafId);
  }, [globeEl, globeReady]);

  return {
    globeReady,
    handleGlobeReady: () => setGlobeReady(true)
  };
}

function useScene(globeEl: GlobeEl, globeReady: boolean) {
  useEffect(() => {
    const globeElRef = globeEl.current;
    if (!globeReady || !globeElRef) return;

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

    return () => {
      scene.remove(graticules);
      scene.remove(innerSphere);
    };
  }, [globeEl, globeReady]);
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

  const { globeReady, handleGlobeReady } = useGlobeReady(globeEl);

  useScene(globeEl, globeReady);

  const { landPolygons, polygonMaterial, getPolygonAltitude } =
    useLandPolygons();

  const { points, pointAltitude, setPointAltitude } = usePoints(albums);

  const {
    rings,
    colorInterpolator,
    handleMouseEnter,
    handleMouseLeave,
    activeAlbumTitle
  } = useRings(globeEl, setPointAltitude);
  const activeAlbum = albums.find(album => album.title === activeAlbumTitle);

  const { arcs } = useArcs(albums);

  const { width, height } = useWindowSize();

  const { customLayerData, customThreeObject, customThreeObjectUpdate } =
    useCustomLayer(globeEl);

  const isMac =
    navigator.platform.toLowerCase().includes('mac') ||
    navigator.userAgent.toLowerCase().includes('mac');

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
        animateIn={false}
        backgroundColor="rgba(0,0,0,0)"
        atmosphereColor="rgba(255, 255, 255, 1)"
        showGlobe={false}
        showAtmosphere={false}
        showGraticules={false}
        polygonsData={landPolygons}
        polygonCapMaterial={polygonMaterial}
        polygonsTransitionDuration={0}
        polygonAltitude={getPolygonAltitude}
        polygonSideColor={() => 'rgba(255, 255, 255, 0)'}
        polygonStrokeColor={() => (isMac ? 'black' : 'darkslategray')}
        pointsData={points}
        pointColor={() => 'rgba(255, 0, 0, 0.75)'}
        pointAltitude={pointAltitude}
        pointRadius={point => (point as { radius: number }).radius}
        pointsMerge={true}
        ringsData={rings}
        ringColor={() => colorInterpolator}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        arcsData={arcs}
        arcColor={'color'}
        arcAltitudeAutoScale={0.42}
        arcDashLength={() => randomInRange(0.06, 0.7) / 1}
        arcDashGap={() => randomInRange(0.025, 0.4) * 10}
        arcDashAnimateTime={() => randomInRange(0.08, 0.8) * 20000 + 500}
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
          onMouseLeave={handleMouseLeave}
        >
          {albums.map(album => {
            return (
              <li
                key={album.title}
                className="max-w-fit"
                onMouseEnter={() => {
                  handleMouseEnter(album);
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

      <footer className="tracking-tight content">
        <div className="text-3xl text-center md:text-right">
          <p className="m-0 p-0">&copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </section>
  );
}

export default Globe;
