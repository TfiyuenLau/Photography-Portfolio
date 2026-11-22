import * as THREE from 'three';
import chinaGeoData from '@/data/china-geo.json';

type LonLat = [number, number];
type GeoRing = LonLat[];
type GeoPolygonCoords = GeoRing[];

interface ChinaGeoFeature {
  type: 'Feature';
  properties?: {
    name?: string;
    adcode?: number | string;
    cp?: LonLat;
  };
  geometry?:
    | {
        type: 'Polygon';
        coordinates: GeoPolygonCoords;
      }
    | {
        type: 'MultiPolygon';
        coordinates: GeoPolygonCoords[];
      };
}

interface ChinaGeoFeatureCollection {
  type: 'FeatureCollection';
  features: ChinaGeoFeature[];
}

interface CleanedPolygon {
  outer: LonLat[];
  holes: LonLat[][];
}

interface ParsedProvince {
  index: number;
  name: string;
  polygons: CleanedPolygon[];
  bboxArea: number;
}

interface IndexedSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  provIdx: number;
  cosLat: number;
}

interface ClosestMatch {
  provIdx: number;
  cx: number;
  cy: number;
  distSq: number;
}

export interface ChinaMapStyleOptions {
  maskColor?: THREE.ColorRepresentation;
  maskOpacity?: number;
  maskAltitudeOffset?: number;
  internalBorderColor?: THREE.ColorRepresentation;
  internalBorderOpacity?: number;
  internalBorderOffset?: number;
  outerBorderColor?: THREE.ColorRepresentation;
  outerBorderOpacity?: number;
  outerBorderOffset?: number;
  highlightBorderColor?: THREE.ColorRepresentation;
  highlightFillColor?: THREE.ColorRepresentation;
  highlightBorderOffset?: number;
  highlightFillOffset?: number;
  maxSegmentAngleDeg?: number;
}

export interface ProvinceHighlightLayer {
  borderLine: THREE.LineSegments;
  fillMesh: THREE.Mesh;
  borderMat: THREE.LineBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
}

export interface ChinaMapBundle {
  group: THREE.Group;
  backingMask: THREE.Mesh;
  internalBorders: THREE.LineSegments;
  outerBorders: THREE.LineSegments;
  highlightsGroup: THREE.Group;
  provinceHighlights: Map<string, ProvinceHighlightLayer>;
  getProvinceHighlight: (
    provinceName: string | null | undefined
  ) => ProvinceHighlightLayer | undefined;
  updateHighlight: (
    targetProvince: string | null | undefined,
    lerpFactor?: number
  ) => boolean;
  dispose: () => void;
}

export interface AmbientParticlesBundle {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  texture: THREE.CanvasTexture | null;
  dispose: () => void;
}

export const PROVINCE_HIGHLIGHT_BORDER_OPACITY = 0.92;
export const PROVINCE_HIGHLIGHT_FILL_OPACITY = 0.12;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const DEFAULT_MAX_SEGMENT_ANGLE_DEG = 1.5;
const MAX_TRIANGLE_EDGE_DEG = 2.2;
const SHARED_EDGE_PROXIMITY_DEG = 0.08;
const GRID_CELL_DEG = 0.16;

// Maps English, pinyin, abbreviated, and Chinese names for all 34 provincial-level
// regions to the exact `properties.name` keys present in `china-geo.json`.
const PROVINCE_ALIASES: ReadonlyArray<[string, ReadonlyArray<string>]> = [
  ['北京市', ['beijing', 'peking', '北京', '北京市']],
  ['天津市', ['tianjin', 'tientsin', '天津', '天津市']],
  ['河北省', ['hebei', '河北', '河北省']],
  ['山西省', ['shanxi', '山西', '山西省']],
  [
    '内蒙古自治区',
    [
      'inner mongolia',
      'innermongolia',
      'nei mongol',
      'neimongol',
      'neimenggu',
      'nei menggu',
      '内蒙古',
      '内蒙古自治区'
    ]
  ],
  ['辽宁省', ['liaoning', '辽宁', '辽宁省']],
  ['吉林省', ['jilin', '吉林', '吉林省']],
  ['黑龙江省', ['heilongjiang', '黑龙江', '黑龙江省']],
  ['上海市', ['shanghai', '上海', '上海市']],
  ['江苏省', ['jiangsu', '江苏', '江苏省']],
  ['浙江省', ['zhejiang', '浙江', '浙江省']],
  ['安徽省', ['anhui', '安徽', '安徽省']],
  ['福建省', ['fujian', '福建', '福建省']],
  ['江西省', ['jiangxi', '江西', '江西省']],
  ['山东省', ['shandong', '山东', '山东省']],
  ['河南省', ['henan', '河南', '河南省']],
  ['湖北省', ['hubei', '湖北', '湖北省']],
  ['湖南省', ['hunan', '湖南', '湖南省']],
  ['广东省', ['guangdong', 'canton', '广东', '广东省']],
  [
    '广西壮族自治区',
    ['guangxi', 'guangxi zhuang', '广西', '广西壮族自治区']
  ],
  ['海南省', ['hainan', '海南', '海南省']],
  ['重庆市', ['chongqing', 'chungking', '重庆', '重庆市']],
  ['四川省', ['sichuan', 'szechuan', '四川', '四川省']],
  ['贵州省', ['guizhou', '贵州', '贵州省']],
  ['云南省', ['yunnan', '云南', '云南省']],
  ['西藏自治区', ['tibet', 'xizang', '西藏', '西藏自治区']],
  ['陕西省', ['shaanxi', '陕西', '陕西省']],
  ['甘肃省', ['gansu', '甘肃', '甘肃省']],
  ['青海省', ['qinghai', '青海', '青海省']],
  [
    '宁夏回族自治区',
    ['ningxia', 'ningxia hui', '宁夏', '宁夏回族自治区']
  ],
  [
    '新疆维吾尔自治区',
    ['xinjiang', 'xinjiang uyghur', 'sinkiang', '新疆', '新疆维吾尔自治区']
  ],
  ['台湾省', ['taiwan', '台湾', '台灣', '台湾省', '台灣省']],
  [
    '香港特别行政区',
    [
      'hong kong',
      'hongkong',
      'hk',
      'hong kong sar',
      '香港',
      '香港特别行政区',
      '香港特別行政區'
    ]
  ],
  [
    '澳门特别行政区',
    [
      'macau',
      'macao',
      'mo',
      'macau sar',
      'macao sar',
      '澳门',
      '澳門',
      '澳门特别行政区',
      '澳門特別行政區'
    ]
  ]
];

const PROVINCE_LOOKUP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of PROVINCE_ALIASES) {
    map.set(canonical, canonical);
    for (const alias of aliases) {
      map.set(normalizeProvinceKey(alias), canonical);
    }
  }
  return map;
})();

function normalizeProvinceKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\b(province|municipality|autonomous region|sar)\b/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve an English, pinyin, abbreviated, or Chinese province name (such as
 * `album.province`) to the exact `properties.name` in `china-geo.json`.
 */
export function resolveProvinceName(
  province: string | null | undefined
): string | null {
  if (!province) return null;
  const trimmed = province.trim();
  if (!trimmed) return null;
  const direct = PROVINCE_LOOKUP.get(trimmed);
  if (direct) return direct;
  const normalized = normalizeProvinceKey(trimmed);
  return PROVINCE_LOOKUP.get(normalized) ?? null;
}

/**
 * Exact spherical projection matching `three-geojson-geometry` / `react-globe.gl`.
 */
function polarToUnitCartesian(lat: number, lng: number): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (90 - lng) * DEG2RAD;
  const sinPhi = Math.sin(phi);
  return [
    sinPhi * Math.cos(theta),
    Math.cos(phi),
    sinPhi * Math.sin(theta)
  ];
}

function cleanRing(rawRing: GeoRing): LonLat[] {
  const cleaned: LonLat[] = [];
  for (let i = 0; i < rawRing.length; i++) {
    const pt = rawRing[i];
    if (!pt || pt.length < 2) continue;
    const lng = pt[0];
    const lat = pt[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (Math.abs(lng - prev[0]) <= 1e-6 && Math.abs(lat - prev[1]) <= 1e-6) {
        continue;
      }
    }
    cleaned.push([lng, lat]);
  }
  while (cleaned.length > 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.abs(first[0] - last[0]) <= 1e-6 && Math.abs(first[1] - last[1]) <= 1e-6) {
      cleaned.pop();
    } else {
      break;
    }
  }
  return cleaned;
}

function signedArea2D(ring: ReadonlyArray<LonLat>): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area * 0.5;
}

function parseChinaProvinces(): ParsedProvince[] {
  const collection = chinaGeoData as unknown as ChinaGeoFeatureCollection;
  const provinces: ParsedProvince[] = [];

  for (const feature of collection.features ?? []) {
    const name = feature.properties?.name?.trim();
    if (!name || !feature.geometry) continue;

    const rawPolys: GeoPolygonCoords[] =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;

    const cleanedPolys: CleanedPolygon[] = [];
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const rawPoly of rawPolys) {
      if (!rawPoly || rawPoly.length === 0) continue;
      const outer = cleanRing(rawPoly[0]);
      if (outer.length < 3) continue;

      for (let i = 0; i < outer.length; i++) {
        const [lng, lat] = outer[i];
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      const holes: LonLat[][] = [];
      for (let h = 1; h < rawPoly.length; h++) {
        const hole = cleanRing(rawPoly[h]);
        if (hole.length >= 3) {
          holes.push(hole);
        }
      }

      cleanedPolys.push({ outer, holes });
    }

    if (cleanedPolys.length === 0) continue;

    provinces.push({
      index: provinces.length,
      name,
      polygons: cleanedPolys,
      bboxArea: Math.max(0, (maxLng - minLng) * (maxLat - minLat))
    });
  }

  return provinces;
}

function cellKey(cx: number, cy: number): number {
  return ((cx + 4096) << 14) | (cy + 4096);
}

function quantizedEdgeKey(
  ax: number,
  ay: number,
  bx: number,
  by: number
): string {
  const qax = Math.round(ax * 1000);
  const qay = Math.round(ay * 1000);
  const qbx = Math.round(bx * 1000);
  const qby = Math.round(by * 1000);
  if (qax < qbx || (qax === qbx && qay <= qby)) {
    return `${qax},${qay}|${qbx},${qby}`;
  }
  return `${qbx},${qby}|${qax},${qay}`;
}

function buildSpatialGrid(
  segments: ReadonlyArray<IndexedSegment>
): Map<number, number[]> {
  const grid = new Map<number, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const minCx = Math.floor(Math.min(s.ax, s.bx) / GRID_CELL_DEG);
    const maxCx = Math.floor(Math.max(s.ax, s.bx) / GRID_CELL_DEG);
    const minCy = Math.floor(Math.min(s.ay, s.by) / GRID_CELL_DEG);
    const maxCy = Math.floor(Math.max(s.ay, s.by) / GRID_CELL_DEG);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = cellKey(cx, cy);
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(i);
      }
    }
  }
  return grid;
}

function findClosestOtherProvince(
  px: number,
  py: number,
  selfProvIdx: number,
  cosLat: number,
  tolDeg: number,
  segments: ReadonlyArray<IndexedSegment>,
  grid: ReadonlyMap<number, number[]>
): ClosestMatch | null {
  const tolSq = tolDeg * tolDeg;
  const padLng = tolDeg / Math.max(0.2, cosLat);
  const minCx = Math.floor((px - padLng) / GRID_CELL_DEG);
  const maxCx = Math.floor((px + padLng) / GRID_CELL_DEG);
  const minCy = Math.floor((py - tolDeg) / GRID_CELL_DEG);
  const maxCy = Math.floor((py + tolDeg) / GRID_CELL_DEG);

  let bestDistSq = tolSq;
  let bestProvIdx = -1;
  let bestCx = 0;
  let bestCy = 0;

  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      const bucket = grid.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (let b = 0; b < bucket.length; b++) {
        const seg = segments[bucket[b]];
        if (seg.provIdx === selfProvIdx) continue;

        const abx = (seg.bx - seg.ax) * cosLat;
        const aby = seg.by - seg.ay;
        const apx = (px - seg.ax) * cosLat;
        const apy = py - seg.ay;
        const abLenSq = abx * abx + aby * aby;
        let t = abLenSq > 1e-12 ? (apx * abx + apy * aby) / abLenSq : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;

        const projX = seg.ax + (seg.bx - seg.ax) * t;
        const projY = seg.ay + (seg.by - seg.ay) * t;
        const dx = (px - projX) * cosLat;
        const dy = py - projY;
        const distSq = dx * dx + dy * dy;

        if (distSq <= bestDistSq) {
          bestDistSq = distSq;
          bestProvIdx = seg.provIdx;
          bestCx = projX;
          bestCy = projY;
        }
      }
    }
  }

  if (bestProvIdx === -1) return null;
  return {
    provIdx: bestProvIdx,
    cx: bestCx,
    cy: bestCy,
    distSq: bestDistSq
  };
}

/**
 * Separate province borders into deduplicated internal provincial boundaries
 * and outer national/coastal borders. Handles both exact shared edges and
 * slightly offset independently simplified edges between adjacent provinces.
 */
function classifyAndDeduplicateBorders(provinces: ReadonlyArray<ParsedProvince>): {
  internalSegments: Array<[number, number, number, number]>;
  outerSegments: Array<[number, number, number, number]>;
} {
  // Prefer smaller, higher-detail provinces (e.g. Beijing/Tianjin/Shanghai/HK/Macau)
  // when deduplicating shared borders against larger neighboring provinces.
  const sortedByArea = [...provinces].sort(
    (a, b) => a.bboxArea - b.bboxArea || a.index - b.index
  );
  const priorityRank = new Int32Array(provinces.length);
  for (let r = 0; r < sortedByArea.length; r++) {
    priorityRank[sortedByArea[r].index] = r;
  }

  const allSegments: IndexedSegment[] = [];
  for (let p = 0; p < provinces.length; p++) {
    const prov = provinces[p];
    for (let k = 0; k < prov.polygons.length; k++) {
      const poly = prov.polygons[k];
      const rings = poly.holes.length > 0 ? [poly.outer, ...poly.holes] : [poly.outer];
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        const len = ring.length;
        for (let i = 0; i < len; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % len];
          const midLat = (a[1] + b[1]) * 0.5;
          allSegments.push({
            ax: a[0],
            ay: a[1],
            bx: b[0],
            by: b[1],
            provIdx: prov.index,
            cosLat: Math.cos(midLat * DEG2RAD)
          });
        }
      }
    }
  }

  const grid = buildSpatialGrid(allSegments);
  const internalSegments: Array<[number, number, number, number]> = [];
  const outerSegments: Array<[number, number, number, number]> = [];
  const emittedInternal = new Set<string>();
  const emittedOuter = new Set<string>();

  const classifySegment = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    provIdx: number,
    cosLat: number,
    depth: number
  ): void => {
    const dx = (bx - ax) * cosLat;
    const dy = by - ay;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) return;

    const p1x = ax + (bx - ax) * 0.25;
    const p1y = ay + (by - ay) * 0.25;
    const p2x = ax + (bx - ax) * 0.75;
    const p2y = ay + (by - ay) * 0.75;

    const m1 = findClosestOtherProvince(
      p1x,
      p1y,
      provIdx,
      cosLat,
      SHARED_EDGE_PROXIMITY_DEG,
      allSegments,
      grid
    );
    const m2 = findClosestOtherProvince(
      p2x,
      p2y,
      provIdx,
      cosLat,
      SHARED_EDGE_PROXIMITY_DEG,
      allSegments,
      grid
    );

    // Split segments that straddle a tri-junction (e.g. inland-to-coast transition)
    if (
      depth < 2 &&
      segLen > 0.12 &&
      (m1?.provIdx ?? -1) !== (m2?.provIdx ?? -1)
    ) {
      const mx = (ax + bx) * 0.5;
      const my = (ay + by) * 0.5;
      classifySegment(ax, ay, mx, my, provIdx, cosLat, depth + 1);
      classifySegment(mx, my, bx, by, provIdx, cosLat, depth + 1);
      return;
    }

    if (m1 !== null && m2 !== null) {
      // Guard against perpendicular coastal edges touching an inland border at a corner:
      // a true shared border projects forward along the neighbor's boundary.
      const ux = dx / segLen;
      const uy = dy / segLen;
      const projDelta =
        (m2.cx - m1.cx) * cosLat * ux + (m2.cy - m1.cy) * uy;

      if (projDelta >= 0.22 * segLen) {
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        const mm = findClosestOtherProvince(
          mx,
          my,
          provIdx,
          cosLat,
          SHARED_EDGE_PROXIMITY_DEG,
          allSegments,
          grid
        );
        if (mm !== null) {
          const neighborIdx = mm.provIdx;
          if (priorityRank[provIdx] < priorityRank[neighborIdx]) {
            const key = quantizedEdgeKey(ax, ay, bx, by);
            if (!emittedInternal.has(key)) {
              emittedInternal.add(key);
              internalSegments.push([ax, ay, bx, by]);
            }
          }
          return;
        }
      }
    }

    const key = quantizedEdgeKey(ax, ay, bx, by);
    if (!emittedOuter.has(key)) {
      emittedOuter.add(key);
      outerSegments.push([ax, ay, bx, by]);
    }
  };

  for (let i = 0; i < allSegments.length; i++) {
    const s = allSegments[i];
    classifySegment(s.ax, s.ay, s.bx, s.by, s.provIdx, s.cosLat, 0);
  }

  return { internalSegments, outerSegments };
}

/**
 * Emit great-circle interpolated spherical line segments (pairs of 3D vertices)
 * with angular step bounded by `maxStepDeg`.
 */
function appendSphericalSegment(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
  radius: number,
  maxStepRad: number,
  outPositions: number[]
): void {
  const [x1, y1, z1] = polarToUnitCartesian(lat1, lng1);
  const [x2, y2, z2] = polarToUnitCartesian(lat2, lng2);
  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
  const omega = Math.acos(dot);
  if (omega < 1e-7) return;

  const steps = Math.max(1, Math.ceil(omega / maxStepRad));
  if (steps === 1) {
    outPositions.push(
      x1 * radius,
      y1 * radius,
      z1 * radius,
      x2 * radius,
      y2 * radius,
      z2 * radius
    );
    return;
  }

  const sinOmega = Math.sin(omega);
  let prevX = x1 * radius;
  let prevY = y1 * radius;
  let prevZ = z1 * radius;

  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    let curX: number;
    let curY: number;
    let curZ: number;

    if (s === steps) {
      curX = x2 * radius;
      curY = y2 * radius;
      curZ = z2 * radius;
    } else if (sinOmega > 1e-6) {
      const w1 = Math.sin((1 - t) * omega) / sinOmega;
      const w2 = Math.sin(t * omega) / sinOmega;
      curX = (w1 * x1 + w2 * x2) * radius;
      curY = (w1 * y1 + w2 * y2) * radius;
      curZ = (w1 * z1 + w2 * z2) * radius;
    } else {
      const lx = x1 + (x2 - x1) * t;
      const ly = y1 + (y2 - y1) * t;
      const lz = z1 + (z2 - z1) * t;
      const invLen = radius / Math.hypot(lx, ly, lz);
      curX = lx * invLen;
      curY = ly * invLen;
      curZ = lz * invLen;
    }

    outPositions.push(prevX, prevY, prevZ, curX, curY, curZ);
    prevX = curX;
    prevY = curY;
    prevZ = curZ;
  }
}

function buildLineGeometryFromSegments(
  segments: ReadonlyArray<[number, number, number, number]>,
  radius: number,
  maxStepDeg: number
): THREE.BufferGeometry {
  const maxStepRad = maxStepDeg * DEG2RAD;
  const positions: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    const [ax, ay, bx, by] = segments[i];
    appendSphericalSegment(ax, ay, bx, by, radius, maxStepRad, positions);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.computeBoundingSphere();
  return geometry;
}

function buildProvinceBorderGeometry(
  province: ParsedProvince,
  radius: number,
  maxStepDeg: number
): THREE.BufferGeometry {
  const maxStepRad = maxStepDeg * DEG2RAD;
  const positions: number[] = [];
  const emitted = new Set<string>();

  for (let k = 0; k < province.polygons.length; k++) {
    const poly = province.polygons[k];
    const rings = poly.holes.length > 0 ? [poly.outer, ...poly.holes] : [poly.outer];
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      const len = ring.length;
      for (let i = 0; i < len; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % len];
        const key = quantizedEdgeKey(a[0], a[1], b[0], b[1]);
        if (emitted.has(key)) continue;
        emitted.add(key);
        appendSphericalSegment(
          a[0],
          a[1],
          b[0],
          b[1],
          radius,
          maxStepRad,
          positions
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Recursively bisect any triangle whose longest edge exceeds `MAX_TRIANGLE_EDGE_DEG`
 * so large western provinces (Xinjiang, Tibet, Inner Mongolia, Qinghai) hug the
 * sphere smoothly with negligible chord sag and zero Z-fighting against the land layer.
 */
function subdivideAndCollectTriangle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  outLonLatTris: number[],
  depth: number
): void {
  const dAB = Math.hypot(bx - ax, by - ay);
  const dBC = Math.hypot(cx - bx, cy - by);
  const dCA = Math.hypot(ax - cx, ay - cy);
  const maxEdge = Math.max(dAB, dBC, dCA);

  if (maxEdge > MAX_TRIANGLE_EDGE_DEG && depth < 10) {
    if (dAB >= dBC && dAB >= dCA) {
      const mx = (ax + bx) * 0.5;
      const my = (ay + by) * 0.5;
      subdivideAndCollectTriangle(ax, ay, mx, my, cx, cy, outLonLatTris, depth + 1);
      subdivideAndCollectTriangle(mx, my, bx, by, cx, cy, outLonLatTris, depth + 1);
    } else if (dBC >= dAB && dBC >= dCA) {
      const mx = (bx + cx) * 0.5;
      const my = (by + cy) * 0.5;
      subdivideAndCollectTriangle(ax, ay, bx, by, mx, my, outLonLatTris, depth + 1);
      subdivideAndCollectTriangle(ax, ay, mx, my, cx, cy, outLonLatTris, depth + 1);
    } else {
      const mx = (cx + ax) * 0.5;
      const my = (cy + ay) * 0.5;
      subdivideAndCollectTriangle(ax, ay, bx, by, mx, my, outLonLatTris, depth + 1);
      subdivideAndCollectTriangle(mx, my, bx, by, cx, cy, outLonLatTris, depth + 1);
    }
    return;
  }

  outLonLatTris.push(ax, ay, bx, by, cx, cy);
}

/**
 * Triangulate all polygons of a province into a flat array of subdivided
 * `[lng0, lat0, lng1, lat1, lng2, lat2, ...]` triangles in geographic space.
 */
function triangulateProvinceLonLat(province: ParsedProvince): number[] {
  const lonLatTris: number[] = [];

  for (let p = 0; p < province.polygons.length; p++) {
    const poly = province.polygons[p];
    if (Math.abs(signedArea2D(poly.outer)) < 1e-10) continue;

    // `THREE.ShapeUtils.triangulateShape` calls `.equals()` on entries, so pass
    // actual `THREE.Vector2` instances (cleaned rings have no duplicate endpoint).
    const contourVecs = poly.outer.map(([lng, lat]) => new THREE.Vector2(lng, lat));
    const holeVecs = poly.holes.map(hole =>
      hole.map(([lng, lat]) => new THREE.Vector2(lng, lat))
    );

    const faces = THREE.ShapeUtils.triangulateShape(contourVecs, holeVecs);
    if (faces.length === 0) continue;

    const allPoints: THREE.Vector2[] = [...contourVecs];
    for (let h = 0; h < holeVecs.length; h++) {
      for (let j = 0; j < holeVecs[h].length; j++) {
        allPoints.push(holeVecs[h][j]);
      }
    }

    for (let f = 0; f < faces.length; f++) {
      const [i0, i1, i2] = faces[f];
      const v0 = allPoints[i0];
      const v1 = allPoints[i1];
      const v2 = allPoints[i2];
      if (!v0 || !v1 || !v2) continue;

      subdivideAndCollectTriangle(
        v0.x,
        v0.y,
        v1.x,
        v1.y,
        v2.x,
        v2.y,
        lonLatTris,
        0
      );
    }
  }

  return lonLatTris;
}

/**
 * Project a flat `[lng0, lat0, lng1, lat1, lng2, lat2, ...]` triangle buffer
 * onto a sphere of `radius` with guaranteed outward-facing CCW winding.
 */
function appendSphericalTriangles(
  lonLatTris: ReadonlyArray<number>,
  radius: number,
  outPositions: number[]
): void {
  for (let i = 0; i < lonLatTris.length; i += 6) {
    const [u0x, u0y, u0z] = polarToUnitCartesian(lonLatTris[i + 1], lonLatTris[i]);
    const [u1x, u1y, u1z] = polarToUnitCartesian(lonLatTris[i + 3], lonLatTris[i + 2]);
    const [u2x, u2y, u2z] = polarToUnitCartesian(lonLatTris[i + 5], lonLatTris[i + 4]);

    const e1x = u1x - u0x;
    const e1y = u1y - u0y;
    const e1z = u1z - u0z;
    const e2x = u2x - u0x;
    const e2y = u2y - u0y;
    const e2z = u2z - u0z;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Outward check against triangle centroid direction
    const dotOutward =
      nx * (u0x + u1x + u2x) + ny * (u0y + u1y + u2y) + nz * (u0z + u1z + u2z);

    if (dotOutward >= 0) {
      outPositions.push(
        u0x * radius,
        u0y * radius,
        u0z * radius,
        u1x * radius,
        u1y * radius,
        u1z * radius,
        u2x * radius,
        u2y * radius,
        u2z * radius
      );
    } else {
      outPositions.push(
        u0x * radius,
        u0y * radius,
        u0z * radius,
        u2x * radius,
        u2y * radius,
        u2z * radius,
        u1x * radius,
        u1y * radius,
        u1z * radius
      );
    }
  }
}

function buildFillGeometryFromLonLatTris(
  lonLatTris: ReadonlyArray<number>,
  radius: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  appendSphericalTriangles(lonLatTris, radius, positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Create the complete minimalist dual-layer China cartographic map bundle:
 * 1. Soft-white spherical backing mask (`radius + 0.08`) eliminating world-map ghosting
 * 2. Deduplicated internal provincial boundaries (`radius + 0.16`)
 * 3. Deduplicated outer national & coastal borders (`radius + 0.22`)
 * 4. Pre-built per-province highlight layers (`Map<string, ProvinceHighlightLayer>`)
 *    ready for zero-re-render RAF opacity lerping
 */
export function createChinaMapLayers(
  radius: number,
  options: ChinaMapStyleOptions = {}
): ChinaMapBundle {
  const {
    maskColor = '#ffffff',
    maskOpacity = 0.96,
    maskAltitudeOffset = 0.08,
    internalBorderColor = '#6b7280',
    internalBorderOpacity = 0.32,
    internalBorderOffset = 0.16,
    outerBorderColor = '#9f1239',
    outerBorderOpacity = 0.72,
    outerBorderOffset = 0.22,
    highlightBorderColor = '#be123c',
    highlightFillColor = '#be123c',
    highlightBorderOffset = 0.26,
    highlightFillOffset = 0.12,
    maxSegmentAngleDeg = DEFAULT_MAX_SEGMENT_ANGLE_DEG
  } = options;

  const provinces = parseChinaProvinces();
  const { internalSegments, outerSegments } =
    classifyAndDeduplicateBorders(provinces);

  // 1. Dual-layer administrative borders
  const internalBorderGeo = buildLineGeometryFromSegments(
    internalSegments,
    radius + internalBorderOffset,
    maxSegmentAngleDeg
  );
  const internalBorderMat = new THREE.LineBasicMaterial({
    color: internalBorderColor,
    transparent: true,
    opacity: internalBorderOpacity,
    depthWrite: false
  });
  const internalBorders = new THREE.LineSegments(
    internalBorderGeo,
    internalBorderMat
  );
  internalBorders.name = 'china-internal-borders';
  internalBorders.renderOrder = 3;

  const outerBorderGeo = buildLineGeometryFromSegments(
    outerSegments,
    radius + outerBorderOffset,
    maxSegmentAngleDeg
  );
  const outerBorderMat = new THREE.LineBasicMaterial({
    color: outerBorderColor,
    transparent: true,
    opacity: outerBorderOpacity,
    depthWrite: false
  });
  const outerBorders = new THREE.LineSegments(outerBorderGeo, outerBorderMat);
  outerBorders.name = 'china-outer-borders';
  outerBorders.renderOrder = 4;

  // 2. China soft-white backing mask + 3. Per-province highlight layers
  // Triangulate each province once and project to both the global mask and highlight fill.
  const maskPositions: number[] = [];
  const highlightsGroup = new THREE.Group();
  highlightsGroup.name = 'china-province-highlights';

  const provinceHighlights = new Map<string, ProvinceHighlightLayer>();

  for (let i = 0; i < provinces.length; i++) {
    const prov = provinces[i];
    const lonLatTris = triangulateProvinceLonLat(prov);
    appendSphericalTriangles(lonLatTris, radius + maskAltitudeOffset, maskPositions);

    const fillGeo = buildFillGeometryFromLonLatTris(
      lonLatTris,
      radius + highlightFillOffset
    );
    const fillMat = new THREE.MeshBasicMaterial({
      color: highlightFillColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.FrontSide
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.name = `china-highlight-fill-${prov.name}`;
    fillMesh.visible = false;
    fillMesh.renderOrder = 2;

    const borderGeo = buildProvinceBorderGeometry(
      prov,
      radius + highlightBorderOffset,
      maxSegmentAngleDeg
    );
    const borderMat = new THREE.LineBasicMaterial({
      color: highlightBorderColor,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const borderLine = new THREE.LineSegments(borderGeo, borderMat);
    borderLine.name = `china-highlight-border-${prov.name}`;
    borderLine.visible = false;
    borderLine.renderOrder = 5;

    highlightsGroup.add(fillMesh, borderLine);
    provinceHighlights.set(prov.name, {
      borderLine,
      fillMesh,
      borderMat,
      fillMat
    });
  }

  const maskGeo = new THREE.BufferGeometry();
  maskGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(maskPositions, 3)
  );
  maskGeo.computeVertexNormals();
  maskGeo.computeBoundingSphere();

  const maskMat = new THREE.MeshBasicMaterial({
    color: maskColor,
    transparent: true,
    opacity: maskOpacity,
    depthWrite: false,
    side: THREE.FrontSide
  });
  const backingMask = new THREE.Mesh(maskGeo, maskMat);
  backingMask.name = 'china-backing-mask';
  backingMask.renderOrder = 1;

  const group = new THREE.Group();
  group.name = 'china-map-layers';
  group.add(backingMask, highlightsGroup, internalBorders, outerBorders);

  // Track only actively fading/lit provinces so idle RAF frames do zero work.
  const activeProvinces = new Set<string>();

  const getProvinceHighlight = (
    provinceName: string | null | undefined
  ): ProvinceHighlightLayer | undefined => {
    const canonical = resolveProvinceName(provinceName);
    if (!canonical) return undefined;
    return provinceHighlights.get(canonical);
  };

  const updateHighlight = (
    targetProvince: string | null | undefined,
    lerpFactor = 0.14
  ): boolean => {
    const targetCanonical = resolveProvinceName(targetProvince);
    if (targetCanonical && provinceHighlights.has(targetCanonical)) {
      activeProvinces.add(targetCanonical);
    }

    if (activeProvinces.size === 0) return false;

    const clampedLerp = Math.max(0.01, Math.min(1, lerpFactor));
    let stillAnimating = false;

    activeProvinces.forEach(canonical => {
      const layer = provinceHighlights.get(canonical);
      if (!layer) {
        activeProvinces.delete(canonical);
        return;
      }

      const isTarget = canonical === targetCanonical;
      const targetBorderOpacity = isTarget
        ? PROVINCE_HIGHLIGHT_BORDER_OPACITY
        : 0;
      const targetFillOpacity = isTarget ? PROVINCE_HIGHLIGHT_FILL_OPACITY : 0;

      const nextBorder =
        layer.borderMat.opacity +
        (targetBorderOpacity - layer.borderMat.opacity) * clampedLerp;
      const nextFill =
        layer.fillMat.opacity +
        (targetFillOpacity - layer.fillMat.opacity) * clampedLerp;

      if (!isTarget && nextBorder < 0.003 && nextFill < 0.002) {
        layer.borderMat.opacity = 0;
        layer.fillMat.opacity = 0;
        layer.borderLine.visible = false;
        layer.fillMesh.visible = false;
        activeProvinces.delete(canonical);
        return;
      }

      const borderDiff = Math.abs(targetBorderOpacity - nextBorder);
      const fillDiff = Math.abs(targetFillOpacity - nextFill);

      layer.borderMat.opacity =
        borderDiff < 0.002 ? targetBorderOpacity : nextBorder;
      layer.fillMat.opacity = fillDiff < 0.001 ? targetFillOpacity : nextFill;
      layer.borderLine.visible = layer.borderMat.opacity > 0;
      layer.fillMesh.visible = layer.fillMat.opacity > 0;

      if (borderDiff >= 0.002 || fillDiff >= 0.001) {
        stillAnimating = true;
      }
    });

    return stillAnimating;
  };

  const dispose = (): void => {
    maskGeo.dispose();
    maskMat.dispose();
    internalBorderGeo.dispose();
    internalBorderMat.dispose();
    outerBorderGeo.dispose();
    outerBorderMat.dispose();

    provinceHighlights.forEach(layer => {
      layer.borderLine.geometry.dispose();
      layer.borderMat.dispose();
      layer.fillMesh.geometry.dispose();
      layer.fillMat.dispose();
    });

    provinceHighlights.clear();
    activeProvinces.clear();
    highlightsGroup.clear();
    group.clear();
  };

  return {
    group,
    backingMask,
    internalBorders,
    outerBorders,
    highlightsGroup,
    provinceHighlights,
    getProvinceHighlight,
    updateHighlight,
    dispose
  };
}

function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCircularSpriteTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const half = size * 0.5;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.72)');
  gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.22)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Create a single-draw-call ambient particle cloud (`THREE.Points`) distributed
 * across spherical shells (`alt` 0.1–1.4 relative to `radius`), replacing 500
 * individual `THREE.Mesh` spheres with one batched GPU draw call.
 */
export function createAmbientParticles(
  radius: number,
  isCompact: boolean
): AmbientParticlesBundle {
  const count = isCompact ? 180 : 380;
  const positions = new Float32Array(count * 3);
  const rand = createMulberry32(0x4c50484f);

  for (let i = 0; i < count; i++) {
    // Uniform spherical distribution avoids polar clumping
    const u = rand() * 2 - 1;
    const lat = Math.asin(u) * RAD2DEG;
    const lng = (rand() - 0.5) * 360;
    const alt = 0.1 + rand() * 1.3;
    const r = radius * (1 + alt);

    const [ux, uy, uz] = polarToUnitCartesian(lat, lng);
    const offset = i * 3;
    positions[offset] = ux * r;
    positions[offset + 1] = uy * r;
    positions[offset + 2] = uz * r;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();

  const texture = createCircularSpriteTexture();
  const material = new THREE.PointsMaterial({
    color: '#64748b',
    map: texture,
    size: isCompact ? 1.55 : 1.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    alphaTest: 0.01
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'globe-ambient-particles';
  points.frustumCulled = false;

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
    texture?.dispose();
  };

  return {
    points,
    geometry,
    material,
    texture,
    dispose
  };
}
