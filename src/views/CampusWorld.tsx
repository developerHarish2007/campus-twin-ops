import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Billboard, Environment, Html, Line, OrbitControls, Splat, Text, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing';
import {
  ACESFilmicToneMapping, Box3, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, FrontSide, Matrix3, NoColorSpace,
  InstancedMesh, MeshPhongMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RepeatWrapping, Shape, ShapeGeometry, SRGBColorSpace,
  Texture, TextureLoader, TubeGeometry, Vector3, PCFSoftShadowMap, VSMShadowMap
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CampusMapStatusResponse, CampusNode } from '../contracts';
import { nodeStatusStyle } from '../adapters/campusMapAdapter';
import { osmBuildingAssignments } from '../data/osmBuildingAssignments';
import { BuildingCutaway } from './cutaway/BuildingCutaway';
import { ClassroomDiorama } from './classroom/ClassroomDiorama';
import { ProjectorSimPanel } from './classroom/ProjectorSimPanel';
import { projectorSim, PG_PROJECTOR_IDS, type FaultType } from '../sim/projectorSim';
import { projectorPredictor, type DevicePrediction } from '../sim/projectorPredictor';
import {
  getBlock,
  getBlockByNodeId,
  getBlockByOsmWay,
  getRoomsForBlock,
  getRoom,
  getRoomByNodeIdOrAlias,
  getEquipmentForRoom,
  downloadRegistryFiles,
  campusRegistry,
  getOrderedCampusBlocks
} from '../data/registry/registryService';
import { ScrollableDock } from './common/ScrollableDock';
import { dashboardBridge } from '../services/dashboardBridge';
import { openDashboard } from '../config/urls';
import { Tree, TreePreset } from '@dgreenheck/ez-tree';

type XZ = { x: number; z: number };
type ViewCommand = { type: 'focus' | 'overview'; revision: number; id?: string };
type OsmBuilding = {
  osmWayId: number; campusNodeId?: string; tags: Record<string, string>; footprint: XZ[];
  centroid: XZ; widthMeters: number; depthMeters: number; osmHeightMeters: number | null;
  osmFloorCount: number | null; estimatedFloorCount: number; estimatedHeightMeters: number; heightSource: string;
};
type OsmRoad = { osmWayId: number; tags: Record<string, string>; points: XZ[] };
type ContextBuilding = { osmWayId: number; tags: Record<string, string>; footprint: XZ[]; centroid: XZ; widthMeters: number; depthMeters: number; heightMeters: number; heightSource: string };
type OsmLandcover = { osmWayId: number; tags: Record<string, string>; footprint: XZ[] };
type OsmSurroundings = { buildings: ContextBuilding[]; roads: OsmRoad[]; landcover: OsmLandcover[]; individualTrees: Array<{ osmNodeId: number; position: XZ }> };
type OsmCampusData = {
  attribution: string; sourceUrl: string; origin: { lat: number; lon: number };
  campusBoundary: { osmWayId: number; name: string; footprint: XZ[] };
  buildings: OsmBuilding[]; roads: OsmRoad[]; surroundings?: OsmSurroundings;
};
type WorldProps = {
  snapshot?: CampusMapStatusResponse | null;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
  affectedNodeIds?: string[];
  whatIfNodeIds?: string[];
  interiorMode?: 'campus' | 'cutaway' | 'diorama';
  onInteriorModeChange?: (mode: 'campus' | 'cutaway' | 'diorama') => void;
  interiorBlockId?: string;
  onInteriorBlockChange?: (blockId: string) => void;
  interiorRoomId?: string;
  onInteriorRoomChange?: (roomId: string) => void;
  onEnterBuilding?: (blockId: string) => void;
};

const boundsOf = (points: XZ[]) => {
  const xs = points.map(p => p.x), zs = points.map(p => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
};
const shapeFrom = (points: XZ[]) => {
  const shape = new Shape();
  if (!points.length) return shape;
  shape.moveTo(points[0].x, -points[0].z);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, -points[i].z);
  shape.closePath();
  return shape;
};
const nodeFor = (record: OsmBuilding, nodes: CampusNode[]) =>
  record.campusNodeId ? nodes.find(n => n.id === record.campusNodeId) : undefined;
const buildingColor = (id: number) => ['#a9aaa4', '#b5b2a9', '#999d9a', '#c1beb5'][id % 4];

function makeNoiseTexture(base: string, speck: string, repeat: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  let seed = 1931;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 3400; i++) {
    ctx.globalAlpha = .04 + random() * .18;
    ctx.fillStyle = random() > .52 ? speck : '#ffffff';
    const size = .35 + random() * 1.6;
    ctx.fillRect(random() * 128, random() * 128, size, size);
  }
  ctx.globalAlpha = 1;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.matrix = new Matrix3(); texture.updateMatrix();
  texture.anisotropy = 4;
  return texture;
}
function createSmoothNoiseTexture(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Texture();
  const img = ctx.createImageData(size, size);

  const perm = new Uint8Array(512);
  let s = 194723;
  const r = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  const grad = (hash: number, x: number, y: number) => {
    const h = hash & 3;
    const u = h < 2 ? x : y, v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };

  const sample = (x: number, y: number, freq: number) => {
    const fx = (x * freq) % 256, fy = (y * freq) % 256;
    const xi = Math.floor(fx) & 255, yi = Math.floor(fy) & 255;
    const xf = fx - Math.floor(fx), yf = fy - Math.floor(fy);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + (yi + 1) % 256];
    const ba = perm[perm[(xi + 1) % 256] + yi], bb = perm[perm[(xi + 1) % 256] + (yi + 1) % 256];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return (lerp(x1, x2, v) + 1) * 0.5;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = sample(x, y, 4 / size) * 0.55 + sample(x, y, 8 / size) * 0.30 + sample(x, y, 16 / size) * 0.15;
      const byte = Math.max(0, Math.min(255, Math.floor(v * 255)));
      const idx = (y * size + x) * 4;
      img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = byte;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

type PbrMaps = { diffuse: Texture; normal: Texture; rough: Texture; ao: Texture };
type SurfaceTextures = { grass: PbrMaps; soil: PbrMaps; sparseGrass: PbrMaps; asphalt: PbrMaps; paving: PbrMaps; concrete: PbrMaps; plaster: PbrMaps; bark: PbrMaps; noise: Texture };
function useSurfaceTextures(): SurfaceTextures {
  const { gl } = useThree();
  const files = useMemo(() => {
    const packs = ['grass_ground', 'forest_ground_04', 'sparse_grass', 'asphalt_03', 'concrete_floor', 'concrete', 'bark_brown_01'];
    return [
      ...packs.flatMap(asset => ['diff', 'nor_gl', 'rough', 'ao'].map(map => `/assets/textures/${asset}/${asset}_${map}_1k.jpg`)),
      '/assets/textures/white_stucco_02/white_stucco_02_diff_1k.jpg',
      '/assets/textures/Grass005/Grass005_1K-JPG_Color.jpg',
      '/assets/textures/Grass005/Grass005_1K-JPG_NormalGL.jpg',
      '/assets/textures/Grass005/Grass005_1K-JPG_Roughness.jpg',
      '/assets/textures/Grass005/Grass005_1K-JPG_AmbientOcclusion.jpg',
    ];
  }, []);
  const loaded = useLoader(TextureLoader, files);
  const noise = useMemo(() => createSmoothNoiseTexture(), []);

  return useMemo(() => {
    const maxAnisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const configure = (texture: Texture, color = false) => {
      texture.colorSpace = color ? SRGBColorSpace : NoColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.matrix = new Matrix3();
      texture.matrixAutoUpdate = true;
      texture.repeat.set(1, 1);
      texture.updateMatrix();
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;
      return texture;
    };
    const pbr = (pack: number): PbrMaps => {
      const offset = pack * 4;
      return {
        diffuse: configure(loaded[offset].clone(), true),
        normal: configure(loaded[offset + 1].clone()),
        rough: configure(loaded[offset + 2].clone()),
        ao: configure(loaded[offset + 3].clone())
      };
    };
    const plasterBase = pbr(5);
    const lawn: PbrMaps = {
      diffuse: configure(loaded[29].clone(), true),
      normal: configure(loaded[30].clone()),
      rough: configure(loaded[31].clone()),
      ao: configure(loaded[32].clone())
    };
    return {
      grass: lawn,
      soil: pbr(1),
      sparseGrass: pbr(2),
      asphalt: pbr(3),
      paving: pbr(4),
      concrete: pbr(5),
      plaster: { ...plasterBase, diffuse: configure(loaded[28].clone(), true) },
      bark: pbr(6),
      noise
    };
  }, [loaded, gl, noise]);
}
function Ground({ data, textures }: { data: OsmCampusData; textures: SurfaceTextures }) {
  const allPoints = [
    ...data.campusBoundary.footprint,
    ...(data.surroundings?.buildings.flatMap(b => b.footprint) ?? []),
    ...(data.surroundings?.roads.flatMap(r => r.points) ?? data.roads.flatMap(r => r.points)),
    ...(data.surroundings?.landcover.flatMap(a => a.footprint) ?? []),
  ];
  const bounds = boundsOf(allPoints);
  const width = bounds.maxX - bounds.minX + 90, depth = bounds.maxZ - bounds.minZ + 90;
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const mapBounds: XZ[] = [
    { x: bounds.minX - 40, z: bounds.minZ - 40 }, { x: bounds.maxX + 40, z: bounds.minZ - 40 },
    { x: bounds.maxX + 40, z: bounds.maxZ + 40 }, { x: bounds.minX - 40, z: bounds.maxZ + 40 },
  ];
  const roads = data.surroundings?.roads ?? data.roads;

  // Campus boundary lawn geometry with world-scale UVs (1 repeat = 10m)
  const boundary = useMemo(() => {
    const geo = new ShapeGeometry(shapeFrom(data.campusBoundary.footprint));
    const pos = geo.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = pos.getX(i) / 10.0;
      uvs[i * 2 + 1] = pos.getY(i) / 10.0;
    }
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    geo.setAttribute('uv2', new BufferAttribute(uvs.slice(), 2));
    return geo;
  }, [data.campusBoundary]);

  const groundGeometry = useMemo(() => {
    const geometry = new PlaneGeometry(width, depth, 120, 120);
    const pos = geometry.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i);
      const wx = lx + cx, wz = cz - ly;
      pos.setZ(i, 0.012 * Math.sin(wx * 0.035) * Math.cos(wz * 0.028) + 0.006 * Math.sin(wz * 0.09));
      uvs[i * 2] = wx / 10.0;
      uvs[i * 2 + 1] = wz / 10.0;
    }
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setAttribute('uv2', new BufferAttribute(uvs.slice(), 2));
    geometry.computeVertexNormals();
    return geometry;
  }, [width, depth, cx, cz]);

  // Macro noise repeat for seamless multi-octave blending
  useMemo(() => {
    textures.noise.repeat.set(width / 75.0, depth / 75.0);
    textures.noise.needsUpdate = true;
  }, [textures.noise, width, depth]);

  return <group>
    {/* 1. Base terrain: green lawn */}
    <mesh geometry={groundGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} receiveShadow>
      <meshStandardMaterial map={textures.grass.diffuse} normalMap={textures.grass.normal} roughnessMap={textures.grass.rough} aoMap={textures.grass.ao} roughness={0.92} color="#ffffff" />
    </mesh>
    {/* 2. Noise-blended second texture (sparse grass/soil) to break tiling repetition */}
    <mesh geometry={groundGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.012, cz]} receiveShadow>
      <meshStandardMaterial map={textures.sparseGrass.diffuse} normalMap={textures.sparseGrass.normal} roughnessMap={textures.sparseGrass.rough} aoMap={textures.sparseGrass.ao} alphaMap={textures.noise} transparent opacity={0.82} roughness={0.95} color="#ffffff" depthWrite={false} />
    </mesh>
    {/* 3. Manicured campus boundary lawn */}
    <mesh geometry={boundary} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.010, 0]} receiveShadow>
      <meshStandardMaterial map={textures.grass.diffuse} normalMap={textures.grass.normal} roughnessMap={textures.grass.rough} aoMap={textures.grass.ao} color="#eef6e6" roughness={0.9} side={DoubleSide} />
    </mesh>
    {/* 4. Surrounding landcover */}
    {data.surroundings?.landcover.map(area => <LandcoverArea key={'area-' + area.osmWayId} area={area} textures={textures} />)}
    {/* 5. Central academic plaza and pedestrian walkways */}
    <CampusPlaza textures={textures} />
    {/* 6. Road network with 3D kerbs, footpaths, lane markings */}
    <RoadNetwork roads={roads} bounds={mapBounds} textures={textures} />
    {/* 7. Grass blades */}
    <GrassBlades data={data} />
  </group>;
}
function LandcoverArea({ area, textures }: { area: OsmLandcover; textures: SurfaceTextures }) {
  const kind = area.tags.natural === 'water' ? 'water' : area.tags.leisure === 'park' ? 'park' : null;
  const geometry = useMemo(() => {
    const geo = new ShapeGeometry(shapeFrom(area.footprint));
    const pos = geo.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = pos.getX(i) / 10.0;
      uvs[i * 2 + 1] = pos.getY(i) / 10.0;
    }
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    return geo;
  }, [area]);
  if (!kind) return null;
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, kind === 'water' ? -0.008 : 0.02, 0]} receiveShadow>
    <meshStandardMaterial map={kind === 'park' ? textures.grass.diffuse : undefined} color={kind === 'park' ? '#ffffff' : '#457283'} roughness={kind === 'park' ? 0.95 : 0.28} metalness={kind === 'water' ? 0.45 : 0.0} side={DoubleSide} />
  </mesh>;
}
function CampusPlaza({ textures }: { textures: SurfaceTextures }) {
  const { pavingGeo, curbGeo, planterGrassGeo } = useMemo(() => {
    const pavingVerts: number[] = [], pavingUvs: number[] = [], pavingIndices: number[] = [];
    const curbVerts: number[] = [], curbUvs: number[] = [], curbIndices: number[] = [];

    const addQuad = (
      verts: number[], uvs: number[], indices: number[],
      a: [number, number, number], b: [number, number, number],
      c: [number, number, number], d: [number, number, number],
      scale = 2.5
    ) => {
      const base = verts.length / 3;
      verts.push(...a, ...b, ...c, ...d);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      uvs.push(a[0] / scale, a[2] / scale, b[0] / scale, b[2] / scale, c[0] / scale, c[2] / scale, d[0] / scale, d[2] / scale);
    };

    const addRect = (minX: number, maxX: number, minZ: number, maxZ: number, y = 0.04) => {
      addQuad(pavingVerts, pavingUvs, pavingIndices, [minX, y, maxZ], [maxX, y, maxZ], [maxX, y, minZ], [minX, y, minZ], 2.5);
      const rim = 0.20, h = y + 0.015;
      // Border curb rim quads
      addQuad(curbVerts, curbUvs, curbIndices, [minX - rim, h, maxZ + rim], [maxX + rim, h, maxZ + rim], [maxX + rim, h, maxZ], [minX - rim, h, maxZ], 2.0);
      addQuad(curbVerts, curbUvs, curbIndices, [minX - rim, h, minZ], [maxX + rim, h, minZ], [maxX + rim, h, minZ - rim], [minX - rim, h, minZ - rim], 2.0);
      addQuad(curbVerts, curbUvs, curbIndices, [minX - rim, h, minZ], [minX, h, minZ], [minX, h, maxZ], [minX - rim, h, maxZ], 2.0);
      addQuad(curbVerts, curbUvs, curbIndices, [maxX, h, minZ], [maxX + rim, h, minZ], [maxX + rim, h, maxZ], [maxX, h, maxZ], 2.0);
    };

    // Central Forecourt between PG & Mech Block & south road
    addRect(-13, 95, 72, 82);
    // Breezeway court between PG and Mech
    addRect(28.5, 37.5, 42, 72);
    // North walkway link towards building 355636701
    addRect(88, 95, 75, 91);
    // South link across to BMS road sidewalk
    addRect(28, 35, 82, 86);
    // PG front entry terrace apron
    addRect(36, 95, 73.5, 76.5, 0.045);
    // Mech front entry terrace apron
    addRect(-12, 31, 71.5, 74.0, 0.045);

    // Planter bed in center of forecourt: circle/octagon around (54, 77)
    const planterGrassVerts: number[] = [], planterGrassUvs: number[] = [], planterGrassIndices: number[] = [];
    const pcx = 54, pcz = 77, pr = 3.2, sides = 12;
    for (let i = 0; i < sides; i++) {
      const a0 = (i * Math.PI * 2) / sides, a1 = ((i + 1) * Math.PI * 2) / sides;
      const x0 = pcx + Math.cos(a0) * pr, z0 = pcz + Math.sin(a0) * pr;
      const x1 = pcx + Math.cos(a1) * pr, z1 = pcz + Math.sin(a1) * pr;
      const base = planterGrassVerts.length / 3;
      planterGrassVerts.push(pcx, 0.05, pcz, x0, 0.05, z0, x1, 0.05, z1);
      planterGrassIndices.push(base, base + 1, base + 2);
      planterGrassUvs.push(pcx / 6, pcz / 6, x0 / 6, z0 / 6, x1 / 6, z1 / 6);

      const ro = pr + 0.28;
      const x0o = pcx + Math.cos(a0) * ro, z0o = pcz + Math.sin(a0) * ro;
      const x1o = pcx + Math.cos(a1) * ro, z1o = pcz + Math.sin(a1) * ro;
      addQuad(curbVerts, curbUvs, curbIndices, [x0o, 0.08, z0o], [x1o, 0.08, z1o], [x1, 0.08, z1], [x0, 0.08, z0], 1.5);
    }

    const makeGeo = (v: number[], uv: number[], ind: number[]) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(v, 3));
      g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      g.setIndex(ind);
      g.computeVertexNormals();
      return g;
    };

    return {
      pavingGeo: makeGeo(pavingVerts, pavingUvs, pavingIndices),
      curbGeo: makeGeo(curbVerts, curbUvs, curbIndices),
      planterGrassGeo: makeGeo(planterGrassVerts, planterGrassUvs, planterGrassIndices),
    };
  }, []);

  const materials = useMemo(() => ({
    paving: new MeshStandardMaterial({
      map: textures.paving.diffuse,
      normalMap: textures.paving.normal,
      roughnessMap: textures.paving.rough,
      aoMap: textures.paving.ao,
      roughness: 0.88,
      color: '#ede8dd',
    }),
    curb: new MeshStandardMaterial({
      map: textures.concrete.diffuse,
      normalMap: textures.concrete.normal,
      roughnessMap: textures.concrete.rough,
      aoMap: textures.concrete.ao,
      roughness: 0.90,
      color: '#cec8ba',
    }),
    grass: new MeshStandardMaterial({
      map: textures.grass.diffuse,
      normalMap: textures.grass.normal,
      roughnessMap: textures.grass.rough,
      aoMap: textures.grass.ao,
      roughness: 0.92,
      color: '#e2edd4',
    }),
  }), [textures]);

  return <group>
    <mesh geometry={pavingGeo} material={materials.paving} receiveShadow />
    <mesh geometry={curbGeo} material={materials.curb} receiveShadow castShadow />
    <mesh geometry={planterGrassGeo} material={materials.grass} receiveShadow />
  </group>;
}
function ContextBuildings({ buildings, textures }: { buildings: ContextBuilding[]; textures: SurfaceTextures }) {
  // Only render context buildings within 220m of campus centre (x=45, z=40) to keep draw cost low
  const nearby = useMemo(() =>
    buildings.filter(b => Math.hypot(b.centroid.x - 45, b.centroid.z - 40) < 220),
    [buildings]
  );
  const geometry = useMemo(() => {
    if (!nearby.length) return { shells: null, roofs: null };
    const shells: ExtrudeGeometry[] = [], roofs: ShapeGeometry[] = [];
    for (const building of nearby) {
      const shape = shapeFrom(building.footprint);
      const shell = new ExtrudeGeometry(shape, { depth: building.heightMeters, bevelEnabled: false, curveSegments: 1, steps: 1 });
      shell.rotateX(-Math.PI / 2);
      shells.push(shell);
      const roof = new ShapeGeometry(shape);
      roof.rotateX(-Math.PI / 2);
      roof.translate(0, building.heightMeters, 0);
      roofs.push(roof);
    }
    const mergedShells = mergeGeometries(shells, true), mergedRoofs = mergeGeometries(roofs, false);
    shells.forEach(part => part.dispose()); roofs.forEach(part => part.dispose());
    return { shells: mergedShells, roofs: mergedRoofs };
  }, [nearby]);
  const materials = useMemo(() => [
    new MeshStandardMaterial({ map:textures.plaster.diffuse, roughnessMap:textures.plaster.rough, color:'#d3cfc3', roughness:.92, metalness:.01 }),
    new MeshStandardMaterial({ map:textures.plaster.diffuse, roughnessMap:textures.plaster.rough, color:'#b9b6ad', roughness:.94, metalness:.01 }),
  ], [textures]);
  const roofMaterial = useMemo(() => new MeshStandardMaterial({ map:textures.concrete.diffuse, color:'#a7a39a', roughness:.96, metalness:.01 }), [textures]);
  if (!geometry.shells || !geometry.roofs) return null;
  return <group>
    <mesh geometry={geometry.shells} material={materials} receiveShadow frustumCulled={false} />
    <mesh geometry={geometry.roofs} material={roofMaterial} receiveShadow frustumCulled={false} />
  </group>;
}
function pointInPolygon(p: XZ, ring: XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function distanceToSegment(p: XZ, a: XZ, b: XZ) {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/Math.max(.001,dx*dx+dz*dz)));
  return Math.hypot(p.x-(a.x+dx*t),p.z-(a.z+dz*t));
}
function GrassBlades({ data }: { data: OsmCampusData }) {
  const mesh=useRef<InstancedMesh>(null),{camera}=useThree();
  const placements=useMemo(()=>{
    const bounds=boundsOf(data.campusBoundary.footprint),out:Array<{x:number;z:number;s:number;c:string;a:number}>=[];
    const roadSegments=data.roads.flatMap(r=>r.points.slice(0,-1).map((a,i)=>({a,b:r.points[i+1],minX:Math.min(a.x,r.points[i+1].x)-3.2,maxX:Math.max(a.x,r.points[i+1].x)+3.2,minZ:Math.min(a.z,r.points[i+1].z)-3.2,maxZ:Math.max(a.z,r.points[i+1].z)+3.2})));
    const greens=['#567e3d','#668c48','#79964f','#456f39','#8b9d5a','#52723a'];let seed=45193;
    const rand=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
    for(let z=bounds.minZ;z<bounds.maxZ&&out.length<3200;z+=3.5)for(let x=bounds.minX;x<bounds.maxX&&out.length<3200;x+=3.5){
      const p={x:x+(rand()-.5)*1.2,z:z+(rand()-.5)*1.2};if(!pointInPolygon(p,data.campusBoundary.footprint)||rand()>.55)continue;
      if(data.buildings.some(b=>pointInPolygon(p,b.footprint)))continue;
      if((p.x >= -14 && p.x <= 96 && p.z >= 72 && p.z <= 83) || (p.x >= 28 && p.x <= 38 && p.z >= 42 && p.z <= 74)) continue;
      if(roadSegments.some(s=>p.x>s.minX&&p.x<s.maxX&&p.z>s.minZ&&p.z<s.maxZ&&distanceToSegment(p,s.a,s.b)<3.2))continue;
      out.push({...p,s:.55+rand()*.72,c:greens[Math.floor(rand()*greens.length)],a:rand()*Math.PI*2});
    }return out;
  },[data]);
  const material=useMemo(()=>{const m=new MeshStandardMaterial({color:'#ffffff',roughness:.98,side:DoubleSide});m.onBeforeCompile=shader=>{shader.uniforms.uGrassTime={value:0};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uGrassTime;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(uGrassTime + instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.12) * max(position.y, 0.0) * 0.07;');m.userData.shader=shader;};m.customProgramCacheKey=()=> 'campus-grass-wind-v1';return m;},[]);
  const geometry=useMemo(()=>{const v:number[]=[];for(let k=0;k<3;k++){const a=k*Math.PI/3,dx=Math.cos(a)*.12,dz=Math.sin(a)*.12;v.push(-dx,0,-dz,dx,0,dz,dx*.12,.72,dz*.12,-dx,0,-dz,dx*.12,.72,dz*.12,-dx*.12,.72,-dz*.12);}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();return g;},[]);
  const last=useRef(0);useFrame(state=>{const shader=material.userData.shader;if(shader)shader.uniforms.uGrassTime.value=state.clock.elapsedTime;if(!mesh.current||state.clock.elapsedTime-last.current<.45)return;last.current=state.clock.elapsedTime;const d=new Object3D();let n=0;for(const p of placements){if(Math.hypot(camera.position.x-p.x,camera.position.z-p.z)>40||n>=mesh.current.count)continue;d.position.set(p.x,.008,p.z);d.rotation.set(0,p.a,0);d.scale.setScalar(p.s);d.updateMatrix();mesh.current.setMatrixAt(n,d.matrix);mesh.current.setColorAt(n,new Color(p.c));n++;}mesh.current.count=n;mesh.current.instanceMatrix.needsUpdate=true;if(mesh.current.instanceColor)mesh.current.instanceColor.needsUpdate=true;});
  return <instancedMesh ref={mesh} args={[geometry,material,3200]} frustumCulled={false} castShadow={false} receiveShadow={false}/>;
}
function RoadNetwork({ roads, bounds, textures }: { roads: OsmRoad[]; bounds: XZ[]; textures: SurfaceTextures }) {
  const geometries = useMemo(() => {
    type Layer = 'road' | 'walk' | 'curb' | 'lane';
    const verts: Record<Layer, number[]> = { road: [], walk: [], curb: [], lane: [] };
    const indices: Record<Layer, number[]> = { road: [], walk: [], curb: [], lane: [] };
    const uvs: Record<Layer, number[]> = { road: [], walk: [], curb: [], lane: [] };

    const quad = (
      key: Layer,
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      d: [number, number, number],
      uvA: [number, number],
      uvB: [number, number],
      uvC: [number, number],
      uvD: [number, number]
    ) => {
      const base = verts[key].length / 3;
      verts[key].push(...a, ...b, ...c, ...d);
      indices[key].push(base, base + 1, base + 2, base, base + 2, base + 3);
      uvs[key].push(...uvA, ...uvB, ...uvC, ...uvD);
    };

    const near = (p: XZ) => p.x >= bounds[0].x && p.x <= bounds[2].x && p.z >= bounds[0].z && p.z <= bounds[2].z;

    for (const road of roads) {
      const highway = road.tags.highway ?? '';
      const walkway = ['path', 'footway', 'pedestrian', 'steps'].includes(highway);
      const isNamed = !!road.tags.name;
      const isMainAvenue = isNamed || ['tertiary', 'residential', 'primary', 'secondary'].includes(highway);
      const privateRoad = !isMainAvenue && (['service', 'living_street'].includes(highway) || road.tags.access === 'private');
      const tagged = Number.parseFloat(road.tags.width ?? '');
      const width = Number.isFinite(tagged) ? tagged : walkway ? (highway === 'path' ? 2.4 : 2.0) : isMainAvenue ? 6.4 : privateRoad ? 5.2 : 6.0;

      let distance = 0;
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i], b = road.points[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.15) continue;
        if (!near({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 })) {
          distance += len;
          continue;
        }

        const nx = -dz / len, nz = dx / len;
        const v0 = distance / 4.0, v1 = (distance + len) / 4.0;

        if (walkway) {
          // Dedicated pedestrian path
          const y = 0.045;
          const hw = width / 2;
          const uvLen0 = distance / 2.0, uvLen1 = (distance + len) / 2.0;
          quad(
            'walk',
            [a.x - nx * hw, y, a.z - nz * hw],
            [a.x + nx * hw, y, a.z + nz * hw],
            [b.x + nx * hw, y, b.z + nz * hw],
            [b.x - nx * hw, y, b.z - nz * hw],
            [0, uvLen0], [width / 2.0, uvLen0], [width / 2.0, uvLen1], [0, uvLen1]
          );
          // Bevel edges
          quad(
            'curb',
            [a.x + nx * hw, y, a.z + nz * hw],
            [a.x + nx * (hw + 0.12), y - 0.025, a.z + nz * (hw + 0.12)],
            [b.x + nx * (hw + 0.12), y - 0.025, b.z + nz * (hw + 0.12)],
            [b.x + nx * hw, y, b.z + nz * hw],
            [0, uvLen0], [0.1, uvLen0], [0.1, uvLen1], [0, uvLen1]
          );
          quad(
            'curb',
            [a.x - nx * (hw + 0.12), y - 0.025, a.z - nz * (hw + 0.12)],
            [a.x - nx * hw, y, a.z - nz * hw],
            [b.x - nx * hw, y, b.z - nz * hw],
            [b.x - nx * (hw + 0.12), y - 0.025, b.z - nz * (hw + 0.12)],
            [0, uvLen0], [0.1, uvLen0], [0.1, uvLen1], [0, uvLen1]
          );
        } else {
          // Vehicular road
          const y = 0.035;
          const hw = width / 2;

          // 1. Asphalt Road surface (counter-clockwise order for UP normal)
          quad(
            'road',
            [a.x - nx * hw, y, a.z - nz * hw],
            [a.x + nx * hw, y, a.z + nz * hw],
            [b.x + nx * hw, y, b.z + nz * hw],
            [b.x - nx * hw, y, b.z - nz * hw],
            [0, v0], [width / 4.0, v0], [width / 4.0, v1], [0, v1]
          );

          // 2. 3D Kerbs & Sidewalks on both sides
          const curbW = 0.18;
          const curbH = 0.155; // Curb top at y=0.155 (12cm vertical step)
          const walkW = privateRoad ? 0.9 : 1.4;
          const walkH = 0.150;
          const curbV0 = distance / 2.0, curbV1 = (distance + len) / 2.0;

          // Side +1 (Left)
          // Vertical curb riser facing the road center:
          quad(
            'curb',
            [a.x + nx * hw, y, a.z + nz * hw],
            [b.x + nx * hw, y, b.z + nz * hw],
            [b.x + nx * hw, curbH, b.z + nz * hw],
            [a.x + nx * hw, curbH, a.z + nz * hw],
            [0, curbV0], [0, curbV1], [0.1, curbV1], [0.1, curbV0]
          );
          // Horizontal curb top (normal UP):
          quad(
            'curb',
            [a.x + nx * hw, curbH, a.z + nz * hw],
            [a.x + nx * (hw + curbW), curbH, a.z + nz * (hw + curbW)],
            [b.x + nx * (hw + curbW), curbH, b.z + nz * (hw + curbW)],
            [b.x + nx * hw, curbH, b.z + nz * hw],
            [0, curbV0], [curbW / 2.0, curbV0], [curbW / 2.0, curbV1], [0, curbV1]
          );
          // Sidewalk (normal UP):
          quad(
            'walk',
            [a.x + nx * (hw + curbW), walkH, a.z + nz * (hw + curbW)],
            [a.x + nx * (hw + curbW + walkW), walkH, a.z + nz * (hw + curbW + walkW)],
            [b.x + nx * (hw + curbW + walkW), walkH, b.z + nz * (hw + curbW + walkW)],
            [b.x + nx * (hw + curbW), walkH, b.z + nz * (hw + curbW)],
            [0, curbV0], [walkW / 2.0, curbV0], [walkW / 2.0, curbV1], [0, curbV1]
          );
          // Sidewalk outer bevel down to terrain:
          quad(
            'curb',
            [a.x + nx * (hw + curbW + walkW), walkH, a.z + nz * (hw + curbW + walkW)],
            [a.x + nx * (hw + curbW + walkW + 0.15), 0.02, a.z + nz * (hw + curbW + walkW + 0.15)],
            [b.x + nx * (hw + curbW + walkW + 0.15), 0.02, b.z + nz * (hw + curbW + walkW + 0.15)],
            [b.x + nx * (hw + curbW + walkW), walkH, b.z + nz * (hw + curbW + walkW)],
            [0, curbV0], [0.1, curbV0], [0.1, curbV1], [0, curbV1]
          );

          // Side -1 (Right)
          // Vertical curb riser facing the road center:
          quad(
            'curb',
            [b.x - nx * hw, y, b.z - nz * hw],
            [a.x - nx * hw, y, a.z - nz * hw],
            [a.x - nx * hw, curbH, a.z - nz * hw],
            [b.x - nx * hw, curbH, b.z - nz * hw],
            [0, curbV0], [0, curbV1], [0.1, curbV1], [0.1, curbV0]
          );
          // Horizontal curb top (normal UP):
          quad(
            'curb',
            [a.x - nx * (hw + curbW), curbH, a.z - nz * (hw + curbW)],
            [a.x - nx * hw, curbH, a.z - nz * hw],
            [b.x - nx * hw, curbH, b.z - nz * hw],
            [b.x - nx * (hw + curbW), curbH, b.z - nz * (hw + curbW)],
            [0, curbV0], [curbW / 2.0, curbV0], [curbW / 2.0, curbV1], [0, curbV1]
          );
          // Sidewalk (normal UP):
          quad(
            'walk',
            [a.x - nx * (hw + curbW + walkW), walkH, a.z - nz * (hw + curbW + walkW)],
            [a.x - nx * (hw + curbW), walkH, a.z - nz * (hw + curbW)],
            [b.x - nx * (hw + curbW), walkH, b.z - nz * (hw + curbW)],
            [b.x - nx * (hw + curbW + walkW), walkH, b.z - nz * (hw + curbW + walkW)],
            [0, curbV0], [walkW / 2.0, curbV0], [walkW / 2.0, curbV1], [0, curbV1]
          );
          // Sidewalk outer bevel down to terrain:
          quad(
            'curb',
            [a.x - nx * (hw + curbW + walkW + 0.15), 0.02, a.z - nz * (hw + curbW + walkW + 0.15)],
            [a.x - nx * (hw + curbW + walkW), walkH, a.z - nz * (hw + curbW + walkW)],
            [b.x - nx * (hw + curbW + walkW), walkH, b.z - nz * (hw + curbW + walkW)],
            [b.x - nx * (hw + curbW + walkW + 0.15), 0.02, b.z - nz * (hw + curbW + walkW + 0.15)],
            [0, curbV0], [0.1, curbV0], [0.1, curbV1], [0, curbV1]
          );

          // 3. Lane Markings
          if ((width >= 5.0 || isMainAvenue) && len > 4) {
            // Dashed centerline (normal UP)
            const dashLen = 3.0, gapLen = 3.0, cycle = dashLen + gapLen;
            const lw = 0.06; // 12cm stripe
            for (let s = 1.0; s < len - 1.0; s += cycle) {
              const e = Math.min(len - 0.5, s + dashLen);
              if (e <= s + 0.5) continue;
              const p0 = { x: a.x + dx * (s / len), z: a.z + dz * (s / len) };
              const p1 = { x: a.x + dx * (e / len), z: a.z + dz * (e / len) };
              quad(
                'lane',
                [p0.x - nx * lw, y + 0.005, p0.z - nz * lw],
                [p0.x + nx * lw, y + 0.005, p0.z + nz * lw],
                [p1.x + nx * lw, y + 0.005, p1.z + nz * lw],
                [p1.x - nx * lw, y + 0.005, p1.z - nz * lw],
                [0, 0], [1, 0], [1, 1], [0, 1]
              );
            }

            // Solid edge lines (offset 0.16m inward from curb, normal UP)
            const edgeOffset = hw - 0.20;
            const elw = 0.045; // 9cm stripe
            if (edgeOffset > lw + 0.3) {
              // Left edge line
              quad(
                'lane',
                [a.x + nx * (edgeOffset - elw), y + 0.004, a.z + nz * (edgeOffset - elw)],
                [a.x + nx * (edgeOffset + elw), y + 0.004, a.z + nz * (edgeOffset + elw)],
                [b.x + nx * (edgeOffset + elw), y + 0.004, b.z + nz * (edgeOffset + elw)],
                [b.x + nx * (edgeOffset - elw), y + 0.004, b.z + nz * (edgeOffset - elw)],
                [0, 0], [1, 0], [1, 1], [0, 1]
              );
              // Right edge line
              quad(
                'lane',
                [a.x - nx * (edgeOffset + elw), y + 0.004, a.z - nz * (edgeOffset + elw)],
                [a.x - nx * (edgeOffset - elw), y + 0.004, a.z - nz * (edgeOffset - elw)],
                [b.x - nx * (edgeOffset - elw), y + 0.004, b.z - nz * (edgeOffset - elw)],
                [b.x - nx * (edgeOffset + elw), y + 0.004, b.z - nz * (edgeOffset + elw)],
                [0, 0], [1, 0], [1, 1], [0, 1]
              );
            }
          }
        }
        distance += len;
      }
    }

    const make = (key: Layer) => {
      if (!verts[key].length) return null;
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(verts[key], 3));
      g.setAttribute('uv', new Float32BufferAttribute(uvs[key], 2));
      g.setIndex(indices[key]);
      g.computeVertexNormals();
      return g;
    };

    return { road: make('road'), walk: make('walk'), curb: make('curb'), lane: make('lane') };
  }, [roads, bounds]);

  const mat = useMemo(() => ({
    road: new MeshStandardMaterial({
      map: textures.asphalt.diffuse,
      normalMap: textures.asphalt.normal,
      roughnessMap: textures.asphalt.rough,
      aoMap: textures.asphalt.ao,
      roughness: 0.88,
      color: '#656057',
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: DoubleSide,
    }),
    curb: new MeshStandardMaterial({
      map: textures.concrete.diffuse,
      normalMap: textures.concrete.normal,
      roughnessMap: textures.concrete.rough,
      aoMap: textures.concrete.ao,
      roughness: 0.90,
      color: '#d4cebe',
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: DoubleSide,
    }),
    walk: new MeshStandardMaterial({
      map: textures.paving.diffuse,
      normalMap: textures.paving.normal,
      roughnessMap: textures.paving.rough,
      aoMap: textures.paving.ao,
      roughness: 0.88,
      color: '#ede8db',
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: DoubleSide,
    }),
    lane: new MeshStandardMaterial({
      color: '#f6f2e8',
      roughness: 0.80,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      side: DoubleSide,
    }),
  }), [textures]);

  return (
    <group>
      {geometries.road && <mesh geometry={geometries.road} material={mat.road} receiveShadow />}
      {geometries.curb && <mesh geometry={geometries.curb} material={mat.curb} receiveShadow castShadow />}
      {geometries.walk && <mesh geometry={geometries.walk} material={mat.walk} receiveShadow />}
      {geometries.lane && <mesh geometry={geometries.lane} material={mat.lane} />}
    </group>
  );
}

type TreeInstanceData = {
  matrix: import('three').Matrix4;
  leafColor: import('three').Color;
  barkColor: import('three').Color;
};

type TreeModelPair = {
  branches: BufferGeometry;
  leaves: BufferGeometry;
  leafMap?: Texture;
};

function TreeBatch({
  branchesGeo,
  leavesGeo,
  barkMat,
  leafMat,
  instances,
  quality,
  castShadow = true,
}: {
  branchesGeo: BufferGeometry;
  leavesGeo: BufferGeometry;
  barkMat: import('three').Material;
  leafMat: import('three').Material;
  instances: TreeInstanceData[];
  quality: boolean;
  castShadow?: boolean;
}) {
  const branchRef = useRef<InstancedMesh>(null);
  const leafRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const count = instances.length;
    if (!count) return;

    if (branchRef.current) {
      branchRef.current.count = count;
      for (let i = 0; i < count; i++) {
        branchRef.current.setMatrixAt(i, instances[i].matrix);
      }
      branchRef.current.instanceMatrix.needsUpdate = true;
    }

    if (leafRef.current) {
      leafRef.current.count = count;
      for (let i = 0; i < count; i++) {
        leafRef.current.setMatrixAt(i, instances[i].matrix);
      }
      leafRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [instances, branchesGeo, leavesGeo, barkMat, leafMat]);

  if (!instances.length) return null;

  return (
    <group>
      <instancedMesh
        ref={branchRef}
        args={[branchesGeo, barkMat, instances.length]}
        castShadow={castShadow}
        receiveShadow={true}
      />
      <instancedMesh
        ref={leafRef}
        args={[leavesGeo, leafMat, instances.length]}
        castShadow={castShadow}
        receiveShadow={true}
      />
    </group>
  );
}

function CampusTrees({ data, textures, quality }: { data: OsmCampusData; textures: SurfaceTextures; quality: boolean }) {
  const treeModels = useMemo<TreeModelPair[]>(() => {
    const seeds = [35729, 84920, 12044, 69421];
    return seeds.map((seed, idx) => {
      // Lush full leafy canopy matching tree_test_ground.png exactly
      const raw = structuredClone((TreePreset as any)['Oak Medium']);
      raw.seed = seed;
      raw.leaves.size = 3.4;
      raw.leaves.count = 42;
      raw.leaves.alphaTest = 0.52;
      if (idx === 1) { raw.branch.angle[1] = 50; }
      if (idx === 2) { raw.branch.angle[1] = 58; }
      if (idx === 3) { raw.branch.angle[1] = 46; }

      const tree = new Tree();
      tree.options.copy(raw);
      tree.generate();

      const leafMat = tree.leavesMesh.material as MeshPhongMaterial;
      const leafMap = leafMat.map;
      if (leafMap) {
        leafMap.colorSpace = SRGBColorSpace;
        leafMap.needsUpdate = true;
      }

      const leaves = tree.leavesMesh.geometry;
      if (!leaves.attributes.normal) {
        leaves.computeVertexNormals();
      }

      const branches = tree.branchesMesh.geometry;
      if (branches.attributes.uv && !branches.attributes.uv2) {
        branches.setAttribute('uv2', branches.attributes.uv.clone());
      }

      return {
        branches,
        leaves,
        leafMap: leafMap ?? undefined,
      };
    });
  }, []);

  const { byVariant } = useMemo(() => {
    // ─────────────────────────────────────────────────────────────────
    // SATELLITE-ACCURATE tree placement for SRM Easwari Engineering College
    // Realistic broadleaf trees matching tree_test_ground.png:
    // Oak Medium, Ash Medium, Aspen Medium, Oak Small with real foliage cards.
    // ─────────────────────────────────────────────────────────────────
    const CURATED_TREES: Array<{ x: number; z: number; scale: number; variant: number }> = [
      // 1. Main Entrance Avenue (broadleaf shade trees along avenue)
      { x: 5.0, z: -175.0, scale: 0.39, variant: 0 },
      { x: 18.0, z: -155.0, scale: 0.40, variant: 1 },
      { x: 30.0, z: -135.0, scale: 0.38, variant: 2 },
      { x: 65.0, z: -105.0, scale: 0.41, variant: 3 },
      { x: 60.0, z: -85.0, scale: 0.39, variant: 0 },
      { x: 75.0, z: -60.0, scale: 0.40, variant: 1 },
      { x: 90.0, z: -35.0, scale: 0.38, variant: 2 },
      { x: 105.0, z: -10.0, scale: 0.39, variant: 3 },
      
      // 2. North Compound Wall (dense tree canopy line along northern border)
      { x: -25.0, z: -170.0, scale: 0.38, variant: 0 },
      { x: 0.0, z: -185.0, scale: 0.39, variant: 1 },
      { x: 25.0, z: -188.0, scale: 0.37, variant: 2 },
      { x: 38.0, z: -160.0, scale: 0.38, variant: 3 },
      { x: 80.0, z: -115.0, scale: 0.39, variant: 0 },
      { x: 110.0, z: -125.0, scale: 0.37, variant: 1 },
      { x: 140.0, z: -110.0, scale: 0.38, variant: 2 },
      { x: 185.0, z: -42.0, scale: 0.39, variant: 3 },

      // 3. East Compound Wall (behind Electronics Block & Auditorium)
      { x: 240.0, z: -30.0, scale: 0.38, variant: 0 },
      { x: 240.0, z: -5.0, scale: 0.39, variant: 1 },
      { x: 246.0, z: 75.0, scale: 0.38, variant: 2 },
      { x: 238.0, z: 65.0, scale: 0.37, variant: 3 },
      { x: 230.0, z: 105.0, scale: 0.38, variant: 0 },
      { x: 220.0, z: 140.0, scale: 0.39, variant: 1 },
      { x: 215.0, z: 195.0, scale: 0.38, variant: 2 },

      // 4. South Compound Wall (behind Main Block, Civil Block & Hostels)
      { x: 145.0, z: 188.0, scale: 0.38, variant: 1 },
      { x: 75.0, z: 195.0, scale: 0.39, variant: 2 },
      { x: -5.0, z: 192.0, scale: 0.37, variant: 3 },
      { x: -40.0, z: 190.0, scale: 0.38, variant: 0 },
      { x: -75.0, z: 192.0, scale: 0.39, variant: 1 },
      { x: -160.0, z: 168.0, scale: 0.37, variant: 2 },
      { x: -225.0, z: 156.0, scale: 0.38, variant: 3 },

      // 5. West Perimeter (behind Workshops and Sports Ground boundary)
      { x: -240.0, z: 135.0, scale: 0.38, variant: 0 },
      { x: -228.0, z: 85.0, scale: 0.39, variant: 1 },
      { x: -170.0, z: 68.0, scale: 0.37, variant: 2 },
      { x: -155.0, z: 30.0, scale: 0.38, variant: 3 },
      { x: -135.0, z: 15.0, scale: 0.39, variant: 0 },

      // 6. Courtyard Lawns & Gardens (authentic shade trees in open green spaces)
      { x: 15.0, z: 32.0, scale: 0.36, variant: 0 },
      { x: 25.0, z: 25.0, scale: 0.37, variant: 3 },
      { x: 50.0, z: 5.0, scale: 0.38, variant: 1 },
      { x: 70.0, z: 8.0, scale: 0.36, variant: 2 },
      { x: -30.0, z: 78.0, scale: 0.38, variant: 0 },
      { x: -60.0, z: 75.0, scale: 0.37, variant: 1 },
      { x: -80.0, z: 75.0, scale: 0.38, variant: 2 },
    ];

    const allBuildings = [
      ...data.buildings,
      ...(data.surroundings?.buildings ?? [])
    ];

    const roadSegments: Array<{ a: XZ; b: XZ; halfWidth: number }> = [];
    for (const road of data.roads) {
      const highway = road.tags.highway ?? '';
      const walkway = ['path', 'footway', 'pedestrian', 'steps'].includes(highway);
      const tagged = Number.parseFloat(road.tags.width ?? '');
      const width = Number.isFinite(tagged) ? tagged : walkway ? 2.0 : 5.5;
      for (let i = 0; i < road.points.length - 1; i++) {
        roadSegments.push({ a: road.points[i], b: road.points[i + 1], halfWidth: width / 2 });
      }
    }

    const isValidTreePos = (pos: XZ): boolean => {
      if (Math.hypot(pos.x, pos.z) < 2.0) return false;
      if (!pointInPolygon(pos, data.campusBoundary.footprint)) return false;
      for (const b of allBuildings) {
        if (pointInPolygon(pos, b.footprint)) return false;
        const pts = b.footprint;
        for (let i = 0; i < pts.length - 1; i++) {
          if (distanceToSegment(pos, pts[i], pts[i + 1]) < 2.8) return false;
        }
      }
      for (const seg of roadSegments) {
        if (distanceToSegment(pos, seg.a, seg.b) < seg.halfWidth + 1.8) return false;
      }
      return true;
    };

    const byVariant: TreeInstanceData[][] = [[], [], [], []];
    const dummy = new Object3D();

    const baseLeafTints = [
      new Color('#3f7027'),
      new Color('#4b7c2f'),
      new Color('#46752d'),
      new Color('#396522'),
    ];

    CURATED_TREES.forEach((t, i) => {
      if (!isValidTreePos({ x: t.x, z: t.z })) return;

      const pHash = Math.abs((Math.sin(t.x * 12.9898 + t.z * 78.233 + i) * 43758.5453) % 1);
      const pHash2 = Math.abs((Math.cos(t.x * 39.346 + t.z * 11.135 + i * 2) * 24634.63) % 1);

      const sX = t.scale * (0.94 + pHash * 0.12);
      const sY = t.scale * (0.90 + pHash2 * 0.20);
      const sZ = t.scale * (0.94 + pHash * 0.12);
      const rot = pHash * Math.PI * 2;

      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.set(sX, sY, sZ);
      dummy.updateMatrix();

      const varIdx = t.variant % 4;
      const leafColor = baseLeafTints[varIdx].clone().offsetHSL(
        (pHash - 0.5) * 0.04,
        (pHash2 - 0.5) * 0.06,
        (pHash - 0.5) * 0.05
      );

      const instData: TreeInstanceData = {
        matrix: dummy.matrix.clone(),
        leafColor,
        barkColor: new Color('#564132').offsetHSL(0, 0, (pHash2 - 0.5) * 0.08),
      };

      byVariant[varIdx].push(instData);
    });

    return { byVariant };
  }, [data]);

  const barkMat = useMemo(() => {
    const b = textures.bark;
    [b.diffuse, b.normal, b.rough, b.ao].forEach(t => {
      if (t) {
        t.wrapS = RepeatWrapping;
        t.wrapT = RepeatWrapping;
        t.repeat.set(1, 6);
        t.needsUpdate = true;
      }
    });

    return new MeshStandardMaterial({
      map: b.diffuse,
      normalMap: b.normal,
      roughnessMap: b.rough,
      aoMap: b.ao,
      aoMapIntensity: 1.0,
      roughness: 0.92,
      metalness: 0.03,
      side: FrontSide,
    });
  }, [textures]);

  const leafMats = useMemo(() => {
    const tints = ['#427330', '#3b7428', '#44782e', '#366c22'];
    return tints.map((tint, idx) => {
      const model = treeModels[idx];
      return new MeshStandardMaterial({
        map: model?.leafMap,
        color: new Color(tint),
        alphaTest: 0.52,
        transparent: false,
        depthWrite: true,
        side: DoubleSide,
        roughness: 1.0,
        metalness: 0.0,
      });
    });
  }, [treeModels]);

  return (
    <group>
      {treeModels.map((model, idx) => (
        <TreeBatch
          key={'tree-variant-grp-' + idx}
          branchesGeo={model.branches}
          leavesGeo={model.leaves}
          barkMat={barkMat}
          leafMat={leafMats[idx]}
          instances={byVariant[idx] ?? []}
          quality={quality}
          castShadow={true}
        />
      ))}
    </group>
  );
}

function CampusDetails({ data, night, textures, quality }: { data: OsmCampusData; night: boolean; textures: SurfaceTextures; quality?: boolean }) {
  const details = useMemo(() => {
    const lamps: Array<{ x: number; z: number }> = [];
    const benches: Array<{ x: number; z: number; yaw: number }> = [];
    for (const road of data.roads) {
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i], b = road.points[i + 1], dx = b.x - a.x, dz = b.z - a.z;
        const length = Math.hypot(dx, dz), mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        if (length < 16 || !pointInPolygon(mid, data.campusBoundary.footprint)) continue;
        const nx = dz / length, nz = -dx / length;
        if (lamps.length < 24) lamps.push({ x: mid.x + nx * 5, z: mid.z + nz * 5 });
        if (length > 25 && benches.length < 10 && i % 2 === 0) benches.push({ x: mid.x - nx * 4, z: mid.z - nz * 4, yaw: -Math.atan2(dz, dx) });
      }
    }
    const main = data.buildings.find(b => b.campusNodeId === 'building-main');
    let sign: { x: number; z: number; yaw: number } | undefined, gate: { x: number; z: number; yaw: number } | undefined;
    if (main) {
      const edge = main.footprint.slice(0, -1).map((a, i) => {
        const b = main.footprint[(i + 1) % (main.footprint.length - 1)];
        return { a, b, length: Math.hypot(b.x - a.x, b.z - a.z) };
      }).sort((a, b) => b.length - a.length)[0];
      if (edge) sign = { x: (edge.a.x + edge.b.x) / 2, z: (edge.a.z + edge.b.z) / 2, yaw: -Math.atan2(edge.b.z - edge.a.z, edge.b.x - edge.a.x) };
      const boundary = data.campusBoundary.footprint.slice(0, -1).map((a, i) => {
        const b = data.campusBoundary.footprint[(i + 1) % (data.campusBoundary.footprint.length - 1)];
        return { a, b, dist: Math.hypot((a.x + b.x) / 2 - main.centroid.x, (a.z + b.z) / 2 - main.centroid.z) };
      }).sort((a, b) => a.dist - b.dist)[0];
      if (boundary) gate = { x: (boundary.a.x + boundary.b.x) / 2, z: (boundary.a.z + boundary.b.z) / 2, yaw: -Math.atan2(boundary.b.z - boundary.a.z, boundary.b.x - boundary.a.x) };
    }
    const wallSegments = data.campusBoundary.footprint.slice(0, -1).map((a, i) => {
      const b = data.campusBoundary.footprint[(i + 1) % (data.campusBoundary.footprint.length - 1)], mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      return { a, b, mid, yaw: -Math.atan2(b.z - a.z, b.x - a.x), length: Math.hypot(b.x - a.x, b.z - a.z) };
    }).filter(s => !gate || Math.hypot(s.mid.x - gate.x, s.mid.z - gate.z) > 1);

    return { lamps, benches, sign, gate, wallSegments };
  }, [data]);

  // Merge static boundary wall segments into a single composite geometry
  const wallMergedGeo = useMemo(() => {
    if (!details.wallSegments.length) return null;
    const parts: BufferGeometry[] = [];
    for (const s of details.wallSegments) {
      const g = new BoxGeometry(s.length, 2.1, 0.42);
      g.rotateY(s.yaw);
      g.translate(s.mid.x, 1.05, s.mid.z);
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach(p => p.dispose());
    return merged;
  }, [details.wallSegments]);

  return (
    <group>
      {wallMergedGeo && (
        <mesh
          geometry={wallMergedGeo}
          castShadow={!!quality}
          receiveShadow
        >
          <meshStandardMaterial
            map={textures.concrete.diffuse}
            normalMap={textures.concrete.normal}
            roughnessMap={textures.concrete.rough}
            color="#cbc6b8"
            roughness={0.9}
          />
        </mesh>
      )}
      {details.lamps.map((p, i) => (
        <group key={'lamp-' + i} position={[p.x, 0, p.z]}>
          <mesh position={[0, .18, 0]} castShadow={!!quality}><boxGeometry args={[.42,.36,.42]}/><meshStandardMaterial map={textures.concrete.diffuse} roughness={.8}/></mesh>
          <mesh position={[0, 2.85, 0]} castShadow={!!quality}><boxGeometry args={[.13,5.4,.13]}/><meshStandardMaterial map={textures.asphalt.diffuse} color="#858b86" roughness={.35} metalness={.72}/></mesh>
          <mesh position={[0, 5.65, 0]}><boxGeometry args={[.34,.14,.15]}/><meshStandardMaterial map={textures.asphalt.diffuse} color="#858b86" roughness={.35} metalness={.72}/></mesh>
          <mesh position={[0, 5.95, 0]}><boxGeometry args={[.42,.46,.46]}/><meshStandardMaterial color={night?'#ffe0a1':'#ded9c8'} emissive={night?'#ffad49':'#000000'} emissiveIntensity={night?2.2:0} roughness={.3} metalness={.12}/></mesh>
          <mesh position={[0, 6.2, 0]}><boxGeometry args={[.54,.08,.54]}/><meshStandardMaterial map={textures.concrete.diffuse} color="#77796f" roughness={.72}/></mesh>
          {night && i % 5 === 0 && <pointLight position={[0, 6.2, 0]} color="#ffd19a" intensity={16} distance={22} decay={2} />}
        </group>
      ))}
      {details.benches.map((p, i) => (
        <group key={'bench-' + i} position={[p.x, 0, p.z]} rotation={[0, p.yaw, 0]}>
          {[-.62, -.2, .22, .64].map((z, j) => (
            <mesh key={'slat-' + j} position={[0, .56, z]} castShadow={!!quality}>
              <boxGeometry args={[2.15, .09, .13]} />
              <meshStandardMaterial map={textures.bark.diffuse} normalMap={textures.bark.normal} roughnessMap={textures.bark.rough} roughness={.84} />
            </mesh>
          ))}
          {[-.78, .78].map((x, j) => (
            <group key={'support-' + j}>
              <mesh position={[x, .27, 0]}><boxGeometry args={[.1, .52, .95]} /><meshStandardMaterial map={textures.asphalt.diffuse} color="#777d78" metalness={.62} roughness={.38} /></mesh>
              <mesh position={[x, .83, -.28]} rotation={[-.18, 0, 0]}><boxGeometry args={[.1, .72, .09]} /><meshStandardMaterial map={textures.asphalt.diffuse} color="#777d78" metalness={.62} roughness={.38} /></mesh>
            </group>
          ))}
        </group>
      ))}
      {details.gate && (
        <group position={[details.gate.x, 0, details.gate.z]} rotation={[0, details.gate.yaw, 0]}>
          {[-3.4, 3.4].map((x, i) => (
            <group key={'gatepost-' + i} position={[x, 0, 0]}>
              <mesh position={[0, 1.25, 0]} castShadow={!!quality}><boxGeometry args={[.85, 2.5, .85]} /><meshStandardMaterial map={textures.concrete.diffuse} roughness={.82} /></mesh>
              <mesh position={[0, 2.58, 0]} castShadow={!!quality}><boxGeometry args={[1.05, .18, 1.05]} /><meshStandardMaterial map={textures.concrete.diffuse} roughness={.82} /></mesh>
            </group>
          ))}
          <mesh position={[0, 2.25, 0]} castShadow={!!quality}><boxGeometry args={[5.8, .18, .24]} /><meshStandardMaterial map={textures.asphalt.diffuse} color="#767c77" metalness={.68} roughness={.35}/></mesh>
          {[-2.5, -1.25, 0, 1.25, 2.5].map((x, i) => (
            <mesh key={'bollard-' + i} position={[x, .53, .9]}><boxGeometry args={[.22, 1.06, .22]} /><meshStandardMaterial map={textures.asphalt.diffuse} color="#8c8d82" metalness={.42} roughness={.45}/></mesh>
          ))}
        </group>
      )}
      {details.sign && (
        <group position={[details.sign.x, 0, details.sign.z]} rotation={[0, details.sign.yaw, 0]}>
          <mesh position={[0, 2, 0]} castShadow={!!quality}><boxGeometry args={[9, 3.2, .42]} /><meshStandardMaterial map={textures.concrete.diffuse} color="#e3dfd3" roughness={.78} /></mesh>
          <Text position={[0, 2.28, .23]} fontSize={.72} maxWidth={8.4} color="#35463b" anchorX="center" anchorY="middle">SRM EASWARI</Text>
          <Text position={[0, 1.55, .23]} fontSize={.32} maxWidth={8.4} color="#69746b" anchorX="center" anchorY="middle">ENGINEERING COLLEGE</Text>
          <mesh position={[-4.1, 1.4, 0]}><boxGeometry args={[.2, 2.8, .2]} /><meshStandardMaterial map={textures.asphalt.diffuse} color="#746a57" metalness={.25} /></mesh>
          <mesh position={[4.1, 1.4, 0]}><boxGeometry args={[.2, 2.8, .2]} /><meshStandardMaterial map={textures.asphalt.diffuse} color="#746a57" metalness={.25} /></mesh>
        </group>
      )}
    </group>
  );
}

function useFacadeTextures(buildingId: string) {
  const [maps, setMaps] = useState<{ front?: Texture; side?: Texture }>({});
  useEffect(() => {
    let cancelled = false;
    const loader = new TextureLoader();
    const loadIfPresent = async (face: 'front' | 'side') => {
      const url = '/textures/' + buildingId + '/' + face + '.jpg';
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok || head.headers.get('content-type')?.includes('text/html') || cancelled) return;
        loader.load(url, texture => {
          if (cancelled) { texture.dispose(); return; }
          texture.colorSpace = SRGBColorSpace;
          texture.matrix = new Matrix3(); texture.updateMatrix();
          texture.anisotropy = 8;
          setMaps(prev => ({ ...prev, [face]: texture }));
        }, undefined, () => undefined);
      } catch { /* no local photo texture; use the PBR plaster fallback */ }
    };
    void loadIfPresent('front'); void loadIfPresent('side');
    return () => { cancelled = true; };
  }, [buildingId]);
  return maps;
}
function WindowRows({ record, height, floors, night }: { record: OsmBuilding; height: number; floors: number; night: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const matrix = useMemo(() => {
    const d = new Object3D(), out: Array<import('three').Matrix4> = [], pts = record.footprint.slice(0, -1);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.floor(len / 5.4));
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      let nx = dz / Math.max(.01, len), nz = -dx / Math.max(.01, len);
      if (nx * (mx - record.centroid.x) + nz * (mz - record.centroid.z) < 0) { nx *= -1; nz *= -1; }
      const rotation = -Math.atan2(dz, dx);
      for (let j = 0; j < steps; j++) for (let f = 0; f < Math.max(1, floors - 1); f++) {
        const t = (j + .5) / steps;
        d.position.set(a.x + dx * t + nx * .25, 1.2 + f * (height / floors), a.z + dz * t + nz * .25);
        d.rotation.set(0, rotation, 0); d.scale.set(Math.min(2.2, len / steps * .56), 1.25, .12); d.updateMatrix();
        out.push(d.matrix.clone());
      }
    }
    return out;
  }, [record, height, floors]);
  useEffect(() => {
    matrix.forEach((m, i) => mesh.current?.setMatrixAt(i, m));
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, [matrix]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, matrix.length]} castShadow>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color={night ? '#e4c987' : '#42626a'} emissive={night ? '#ffbd56' : '#203638'} emissiveIntensity={night ? 1.15 : .04} metalness={.12} roughness={night ? .38 : .22} />
  </instancedMesh>;
}
export type FacadeAdjustment = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  edgeIndex?: number;
};

function FrontFacade({
  record,
  height,
  texture,
  adjustment
}: {
  record: OsmBuilding;
  height: number;
  texture?: Texture;
  adjustment?: FacadeAdjustment;
}) {
  if (!texture) return null;
  const edges = useMemo(() => {
    return record.footprint.slice(0, -1).map((a, i) => {
      const b = record.footprint[(i + 1) % (record.footprint.length - 1)];
      return { a, b, midZ: (a.z + b.z) / 2, len: Math.hypot(b.x - a.x, b.z - a.z), index: i };
    });
  }, [record]);

  const chosenEdge = useMemo(() => {
    if (adjustment?.edgeIndex !== undefined && edges[adjustment.edgeIndex]) {
      return edges[adjustment.edgeIndex];
    }
    return [...edges].sort((a, b) => b.midZ - a.midZ)[0];
  }, [edges, adjustment?.edgeIndex]);

  if (!chosenEdge || chosenEdge.len < 0.5) return null;
  const dx = chosenEdge.b.x - chosenEdge.a.x, dz = chosenEdge.b.z - chosenEdge.a.z, len = chosenEdge.len;
  let nx = dz / len, nz = -dx / len;
  const mx = (chosenEdge.a.x + chosenEdge.b.x) / 2, mz = (chosenEdge.a.z + chosenEdge.b.z) / 2;
  if (nx * (mx - record.centroid.x) + nz * (mz - record.centroid.z) < 0) { nx *= -1; nz *= -1; }
  const normalYaw = Math.atan2(nx, nz);

  const configured = useMemo(() => {
    const t = texture.clone();
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    const sx = adjustment?.scaleX ?? 1.0;
    const sy = adjustment?.scaleY ?? 1.0;
    const ox = adjustment?.offsetX ?? 0.0;
    const oy = adjustment?.offsetY ?? 0.0;
    t.repeat.set(sx, sy);
    t.offset.set(ox, oy);
    t.needsUpdate = true;
    return t;
  }, [texture, adjustment?.scaleX, adjustment?.scaleY, adjustment?.offsetX, adjustment?.offsetY]);

  return <mesh position={[mx + nx * .14, height / 2, mz + nz * .14]} rotation={[0, normalYaw, 0]}>
    <planeGeometry args={[len, height]} />
    <meshStandardMaterial map={configured} roughness={.85} metalness={0} polygonOffset polygonOffsetFactor={-1} />
  </mesh>;
}
function FacadeAccents({ record, height }: { record: OsmBuilding; height: number }) {
  const fins = useMemo(() => {
    const result: Array<{ x: number; z: number; yaw: number; width: number }> = [];
    const pts = record.footprint.slice(0, -1);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 12) continue;
      const steps = Math.floor(len / 18), nx0 = dz / len, nz0 = -dx / len;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const inward = nx0 * (mx - record.centroid.x) + nz0 * (mz - record.centroid.z) < 0 ? -1 : 1;
      const nx = nx0 * inward, nz = nz0 * inward, yaw = -Math.atan2(dz, dx);
      for (let j = 0; j <= steps; j++) {
        const t = (j + .5) / (steps + 1);
        result.push({ x: a.x + dx * t + nx * .13, z: a.z + dz * t + nz * .13, yaw, width: .76 });
      }
    }
    return result;
  }, [record]);
  return <group>
    {fins.map((f, i) => <mesh key={i} position={[f.x, height / 2, f.z]} rotation={[0, f.yaw, 0]} castShadow>
      <boxGeometry args={[f.width, height * .94, .14]} />
      <meshStandardMaterial color="#b87857" roughness={.78} metalness={.02} />
    </mesh>)}
    {Array.from({ length: Math.max(0, Math.floor(height / 3.5) - 1) }, (_, i) => {
      const y = 1.4 + (i + 1) * (height / Math.max(2, Math.floor(height / 3.5)));
      const points = record.footprint.map(p => [p.x, y, p.z] as [number, number, number]);
      points.push(points[0]);
      return <Line key={'band-' + i} points={points} color="#b3a99b" lineWidth={.8} />;
    })}
  </group>;
}
function GLBBuilding({ src, record, height, onSelect }: { src: string; record: OsmBuilding; height: number; onSelect?: (id: string) => void }) {
  const { scene } = useGLTF(src);
  const clone = useMemo(() => {
    const root = scene.clone(true); root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
    root.position.set(-center.x, -box.min.y, -center.z);
    const scale = Math.min(record.widthMeters / Math.max(size.x, .01), record.depthMeters / Math.max(size.z, .01), height / Math.max(size.y, .01));
    return { root, scale };
  }, [scene, record, height]);
  return <group position={[record.centroid.x, 0, record.centroid.z]} scale={clone.scale} onClick={e => { e.stopPropagation(); if (record.campusNodeId) onSelect?.(record.campusNodeId); }}><primitive object={clone.root} /></group>;
}
function Building({
  record, nodes, selectedNodeId, affected, whatIf, onSelect, onDoubleClick, onEnterBuilding, scanActive, quality, night, textures,
  adjustment, onPhotoStatus
}: {
  record: OsmBuilding; nodes: CampusNode[]; selectedNodeId?: string; affected: boolean; whatIf: boolean;
  onSelect?: (id: string) => void; onDoubleClick?: (id: string) => void; onEnterBuilding?: (id: string) => void; scanActive: boolean; quality: boolean; night: boolean; textures: SurfaceTextures;
  adjustment?: FacadeAdjustment; onPhotoStatus?: (id: string, hasPhoto: boolean, edgeCount: number) => void;
}) {
  const node = nodeFor(record, nodes);
  const id = node?.id ?? ('osm-way-' + record.osmWayId);
  const height = record.osmHeightMeters ?? record.estimatedHeightMeters;
  const floors = record.osmFloorCount ?? record.estimatedFloorCount;
  const maps = useFacadeTextures(id);
  const [hasModel, setHasModel] = useState(false);
  const shape = useMemo(() => shapeFrom(record.footprint), [record]);
  const shell = useMemo(() => {
    const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1, steps: 1 });
    // ExtrudeGeometry grows along local +Z; rotate so its height becomes world +Y.
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [shape, height]);
  const roof = useMemo(() => new ShapeGeometry(shape), [shape]);
  const statusStyle = node ? nodeStatusStyle[node.status] : undefined;
  const highlight = selectedNodeId === node?.id;
  const tint = affected ? '#f19a36' : statusStyle && statusStyle.color;

  useEffect(() => {
    if (onPhotoStatus) {
      onPhotoStatus(id, !!maps.front, Math.max(1, record.footprint.length - 1));
    }
  }, [id, maps.front, onPhotoStatus, record.footprint.length]);

  useEffect(() => {
    let cancelled = false;
    if (!node?.id) { setHasModel(false); return () => { cancelled = true; }; }
    fetch('/models/' + id + '.glb', { headers: { Range: 'bytes=0-3' } }).then(async r => {
      const magic = new Uint8Array(await r.arrayBuffer()).slice(0, 4);
      const isGlb = r.ok && magic.length === 4 && magic[0] === 0x67 && magic[1] === 0x6c && magic[2] === 0x54 && magic[3] === 0x46;
      if (!cancelled) setHasModel(isGlb);
    }).catch(() => { if (!cancelled) setHasModel(false); });
    return () => { cancelled = true; };
  }, [id]);

  const wallMaterial = useMemo(() => new MeshStandardMaterial({
    color: maps.side ? '#ffffff' : '#dedad0', // Clean plain architectural fallback colour
    map: maps.side ?? textures.plaster.diffuse, normalMap: textures.plaster.normal, roughnessMap: textures.plaster.rough,
    roughness: .92, metalness: .01
  }), [maps, textures]);
  const topMaterial = useMemo(() => new MeshStandardMaterial({
    map: textures.concrete.diffuse, normalMap:textures.concrete.normal, roughnessMap:textures.concrete.rough, color:buildingColor(record.osmWayId), roughness:.9, metalness:.015
  }), [record.osmWayId, textures]);
  const ring = record.footprint.map(p => [p.x, height + .2, p.z] as [number, number, number]);
  if (ring.length) ring.push(ring[0]);
  return <group
    onClick={e => { e.stopPropagation(); onSelect?.(id); }}
    onDoubleClick={e => { e.stopPropagation(); onDoubleClick?.(id); }}
  >
    {!scanActive && <Suspense fallback={null}>
      {hasModel
        ? <GLBBuilding src={'/models/' + id + '.glb'} record={record} height={height} onSelect={onSelect} />
        : <group>
    <mesh geometry={shell} material={[topMaterial, wallMaterial]} castShadow receiveShadow
              onClick={e => { e.stopPropagation(); onSelect?.(id); }}
              onDoubleClick={e => { e.stopPropagation(); onDoubleClick?.(id); }}
              onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = ''; }} />
            <mesh geometry={roof} rotation={[-Math.PI / 2, 0, 0]} position={[0, height + .12, 0]} receiveShadow>
              <meshStandardMaterial map={textures.plaster.diffuse} roughnessMap={textures.plaster.rough} color={buildingColor(record.osmWayId)} roughness={.92} metalness={.01} />
            </mesh>
            <FrontFacade record={record} height={height} texture={maps.front} adjustment={adjustment} />
            {!maps.front && <WindowRows record={record} height={height} floors={floors} night={night} />}
            {!maps.front && <FacadeAccents record={record} height={height} />}
            <Line points={ring} color="#544d43" lineWidth={quality ? 1.7 : 1} />
          </group>}
    </Suspense>}
    {(tint || highlight || whatIf) && <mesh geometry={roof} rotation={[-Math.PI / 2, 0, 0]} position={[0, height + .24 + (whatIf ? .25 : 0), 0]}>
      <meshStandardMaterial color={whatIf ? '#bd85f4' : (highlight ? '#f5e5a6' : tint)} emissive={whatIf ? '#9458d5' : (highlight ? '#d1a83f' : tint)} emissiveIntensity={whatIf ? .75 : affected ? 1.3 : .35} transparent opacity={whatIf ? .38 : affected ? .5 : .34} depthWrite={false} side={DoubleSide} />
    </mesh>}
    {(affected || highlight) && <Line points={ring} color={highlight ? '#fff1ac' : '#ff8b35'} lineWidth={quality ? 3.2 : 2} />}
    <mesh geometry={shell}
      onClick={e => { e.stopPropagation(); onSelect?.(id); }}
      onDoubleClick={e => { e.stopPropagation(); onDoubleClick?.(id); }}
    >
      <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} side={DoubleSide} />
    </mesh>
    {(() => {
      const regBlk = getBlockByOsmWay(record.osmWayId) ?? getBlockByNodeId(id);
      const labelText = node?.name ?? regBlk?.displayName;
      if (!labelText) return null;
      const hasOpenReports = regBlk ? dashboardBridge.buildingHasOpenReports(regBlk.blockId) : false;
      return (
        <Billboard
          position={[record.centroid.x, height + 2.2, record.centroid.z]}
          follow
          lockX={false}
          lockY={false}
          lockZ={false}
        >
          {/* Red dot marker if building has open student reports */}
          {hasOpenReports && (
            <group position={[0, 2.2, 0]}>
              <mesh>
                <sphereGeometry args={[0.9, 16, 16]} />
                <meshBasicMaterial color="#ef4444" />
              </mesh>
              <Billboard position={[0, 1.4, 0]}>
                <group>
                  <mesh>
                    <planeGeometry args={[4.2, 0.9]} />
                    <meshBasicMaterial color="#991b1b" />
                  </mesh>
                  <Text fontSize={0.38} color="#ffffff" anchorX="center" anchorY="middle">
                    🚨 Needs monitoring
                  </Text>
                </group>
              </Billboard>
            </group>
          )}

          <mesh
            position={[0, 0, 0.1]}
            onClick={e => {
              e.stopPropagation();
              onEnterBuilding?.(regBlk?.nodeId ?? id);
            }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = ''; }}
          >
            <planeGeometry args={[Math.min(record.widthMeters, 20) + 6.0, 4.5]} />
            <meshBasicMaterial transparent opacity={0} side={DoubleSide} depthWrite={false} />
          </mesh>
          <Text
            fontSize={1.6}
            maxWidth={Math.min(record.widthMeters, 18)}
            color={hasOpenReports ? '#fca5a5' : '#fff7e8'}
            outlineWidth={.06}
            outlineColor="#35413c"
            anchorX="center"
            anchorY="middle"
            onClick={e => {
              e.stopPropagation();
              onEnterBuilding?.(regBlk?.nodeId ?? id);
            }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = ''; }}
          >
            {labelText.toUpperCase()}
          </Text>
        </Billboard>
      );
    })()}
  </group>;
}

function ScanModel({ src }: { src: string }) {
  const { scene } = useGLTF(src);
  return <primitive object={scene} />;
}
function ScanLayer({ scanPath, data, nodes, selectedNodeId, affectedNodeIds, whatIfNodeIds, onSelect, quality, night, textures }: {
  scanPath: string; data: OsmCampusData; nodes: CampusNode[]; selectedNodeId?: string; affectedNodeIds: string[]; whatIfNodeIds: string[];
  onSelect?: (id: string) => void; quality: boolean; night: boolean; textures: SurfaceTextures;
}) {
  const isSplat = scanPath.endsWith('.splat') || scanPath.endsWith('.ply');
  return <>
    {isSplat ? <Splat src={scanPath} position={[0, 0, 0]} toneMapped /> : <Suspense fallback={null}><ScanModel src={scanPath} /></Suspense>}
    <ProxyFloorColliders buildings={data.buildings} />
    {data.buildings.map(b => <Building key={b.osmWayId} record={b} nodes={nodes} selectedNodeId={selectedNodeId}
      affected={!!b.campusNodeId && affectedNodeIds.includes(b.campusNodeId)} whatIf={!!b.campusNodeId && whatIfNodeIds.includes(b.campusNodeId)}
      onSelect={onSelect} scanActive quality={quality} night={night} textures={textures} />)}
  </>;
}
function ProxyFloorColliders({ buildings }: { buildings: OsmBuilding[] }) {
  return <group>{buildings.map(b => <ProxyBuildingFloors key={b.osmWayId} building={b} />)}</group>;
}
function ProxyBuildingFloors({ building }: { building: OsmBuilding }) {
  const count = building.osmFloorCount ?? building.estimatedFloorCount;
  const height = building.osmHeightMeters ?? building.estimatedHeightMeters;
  const geometry = useMemo(() => new ShapeGeometry(shapeFrom(building.footprint)), [building]);
  return <>{Array.from({ length: count }, (_, floor) =>
    <mesh key={floor} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, floor * height / count, 0]}>
      <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} side={DoubleSide} />
    </mesh>)}</>;
}
function FocusSelected({ controls, command, data, snapshot, introFinished }: {
  controls: RefObject<any>; command: ViewCommand; data: OsmCampusData; snapshot?: CampusMapStatusResponse | null; introFinished: boolean;
}) {
  const { camera } = useThree();
  const transition = useRef<{ elapsed: number; fromPosition: Vector3; toPosition: Vector3; fromTarget: Vector3; toTarget: Vector3 } | null>(null);
  useEffect(() => {
    if (command.type !== 'focus' || !introFinished || !command.id) { transition.current = null; return; }
    const selected = snapshot?.nodes.find(n => n.id === command.id);
    const parentId = selected?.parentId;
    const regBlk = getBlockByNodeId(command.id) ?? getBlock(command.id);
    const osmId = command.id.startsWith('osm-way-')
      ? Number(command.id.slice('osm-way-'.length))
      : regBlk?.osmWayId;
    const building = data.buildings.find(b => b.campusNodeId === command.id || (osmId !== undefined && b.osmWayId === osmId) || (parentId && b.campusNodeId === parentId));
    const point = building?.centroid ?? selected?.position;
    if (!point) return;
    const distance = Math.max(75, Math.max(building?.widthMeters ?? 35, building?.depthMeters ?? 35) * 1.65);
    const target = new Vector3(point.x, building ? Math.min(22, (building.osmHeightMeters ?? building.estimatedHeightMeters) * .3) : 8, point.z);
    transition.current = {
      elapsed: 0,
      fromPosition: camera.position.clone(),
      toPosition: new Vector3(point.x + distance, Math.max(70, distance * .88), point.z + distance),
      fromTarget: controls.current?.target.clone() ?? new Vector3(),
      toTarget: target,
    };
  // Commands are user initiated so live snapshot refreshes never drag the camera around.
  }, [camera, command.revision, command.type, command.id, controls, data, introFinished]);
  useFrame((_, dt) => {
    const t = transition.current;
    if (!t || !controls.current) return;
    t.elapsed = Math.min(1, t.elapsed + dt / .85);
    const eased = 1 - Math.pow(1 - t.elapsed, 3);
    camera.position.lerpVectors(t.fromPosition, t.toPosition, eased);
    controls.current.target.lerpVectors(t.fromTarget, t.toTarget, eased);
    controls.current.update();
    if (t.elapsed >= 1) transition.current = null;
  });
  return null;
}
function IntroFlyIn({ done, onComplete, controls }: { done: RefObject<boolean>; onComplete: () => void; controls: RefObject<any> }) {
  const { camera } = useThree(), elapsed = useRef(0);
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get('view');
    const walk = new URLSearchParams(window.location.search).get('walk');
    if (walk === 'true' || view === 'walk') {
      camera.position.set(45, 1.75, 88);
      if (controls.current) controls.current.target.set(45, 1.75, 75);
      camera.lookAt(45, 1.75, 75);
      controls.current?.update();
      done.current = true;
      onComplete();
    } else if (view === 'ground') {
      camera.position.set(260, 7, -105);
      if (controls.current) controls.current.target.set(145, 10, 20);
      camera.lookAt(145, 10, 20);
      controls.current?.update();
      done.current = true;
      onComplete();
    } else if (view === 'facade') {
      camera.position.set(65, 9, 87);
      if (controls.current) controls.current.target.set(65, 8, 74);
      camera.lookAt(65, 8, 74);
      controls.current?.update();
      done.current = true;
      onComplete();
    } else if (view === 'plaza') {
      camera.position.set(60, 24, 110);
      if (controls.current) controls.current.target.set(60, 2, 68);
      camera.lookAt(60, 2, 68);
      controls.current?.update();
      done.current = true;
      onComplete();
    } else if (view === 'road') {
      camera.position.set(-40, 3.5, 83.8);
      if (controls.current) controls.current.target.set(15, 2.0, 81.5);
      camera.lookAt(15, 2.0, 81.5);
      controls.current?.update();
      done.current = true;
      onComplete();
    }
  }, [camera, done, onComplete, controls]);
  useFrame((_, dt) => {
    if (done.current) return;
    elapsed.current += dt;
    const t = Math.min(1, elapsed.current / 3.4), e = 1 - Math.pow(1 - t, 3);
    camera.position.set(45 + (0 - 45)*(1-e), 720 + (360 - 720) * e, 820 + (480 - 820) * e);
    camera.lookAt(45, (1 - e) * 80, 40);
    if (t >= 1) {
      done.current = true;
      if (controls.current) {
        controls.current.target.set(45, 0, 40);
        controls.current.update();
      }
      onComplete();
    }
  });
  return null;
}
function WalkControls({
  active,
  data,
  controls,
  onExit,
}: {
  active: boolean;
  data: OsmCampusData;
  controls: RefObject<any>;
  onExit: () => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const isDragging = useRef(false);
  const previousPointer = useRef<{ x: number; y: number } | null>(null);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const altitude = useRef(12.0);
  const initialPlacementDone = useRef(false);

  useEffect(() => {
    if (!active) {
      initialPlacementDone.current = false;
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      keys.current[e.code] = true;
      if (e.code === 'Escape') {
        onExit();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      keys.current = {};
    };
  }, [active, onExit]);

  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0 || e.button === 2) {
        isDragging.current = true;
        previousPointer.current = { x: e.clientX, y: e.clientY };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (document.pointerLockElement === canvas) {
        yaw.current -= e.movementX * 0.0028;
        pitch.current = Math.max(-1.42, Math.min(1.42, pitch.current - e.movementY * 0.0028));
      } else if (isDragging.current && previousPointer.current) {
        const dx = e.clientX - previousPointer.current.x;
        const dy = e.clientY - previousPointer.current.y;
        previousPointer.current = { x: e.clientX, y: e.clientY };
        yaw.current -= dx * 0.0036;
        pitch.current = Math.max(-1.42, Math.min(1.42, pitch.current - dy * 0.0036));
      }
    };

    const onPointerUp = () => {
      isDragging.current = false;
      previousPointer.current = null;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [active, gl]);

  // Position camera smoothly when entering walk/drone mode
  useEffect(() => {
    if (!active) return;
    if (!initialPlacementDone.current) {
      initialPlacementDone.current = true;
      if (camera.position.y > 60) {
        camera.position.set(45, 14, 88);
        altitude.current = 14;
        yaw.current = 0;
        pitch.current = -0.05;
      } else {
        altitude.current = Math.max(2.0, camera.position.y);
        const dir = new Vector3();
        camera.getWorldDirection(dir);
        yaw.current = Math.atan2(-dir.x, -dir.z);
        pitch.current = Math.asin(Math.max(-0.99, Math.min(0.99, dir.y)));
      }
    }
  }, [active, camera]);

  useFrame((_, dt) => {
    if (!active) return;
    const delta = Math.min(dt, 0.1);

    const k = keys.current;
    let forward = 0;
    let strafe = 0;
    let vertical = 0;

    if (k['KeyW'] || k['ArrowUp']) forward += 1;
    if (k['KeyS'] || k['ArrowDown']) forward -= 1;
    if (k['KeyD'] || k['ArrowRight']) strafe += 1;
    if (k['KeyA'] || k['ArrowLeft']) strafe -= 1;
    if (k['Space'] || k['KeyE']) vertical += 1;
    if (k['KeyC'] || k['KeyQ']) vertical -= 1;

    const isRunning = !!(k['ShiftLeft'] || k['ShiftRight']);
    const speed = isRunning ? 36.0 : 15.0;

    if (forward !== 0 || strafe !== 0) {
      const len = Math.hypot(forward, strafe);
      const normF = forward / len;
      const normS = strafe / len;

      const sinY = Math.sin(yaw.current);
      const cosY = Math.cos(yaw.current);

      const moveX = (-sinY * normF + cosY * normS) * speed * delta;
      const moveZ = (-cosY * normF - sinY * normS) * speed * delta;

      camera.position.x = Math.max(-250, Math.min(250, camera.position.x + moveX));
      camera.position.z = Math.max(-200, Math.min(200, camera.position.z + moveZ));
    }

    if (vertical !== 0) {
      altitude.current = Math.max(1.8, Math.min(100.0, altitude.current + vertical * (speed * 0.8) * delta));
    }
    camera.position.y = altitude.current;

    const cosPitch = Math.cos(pitch.current);
    const lookX = camera.position.x - Math.sin(yaw.current) * cosPitch * 10;
    const lookY = camera.position.y + Math.sin(pitch.current) * 10;
    const lookZ = camera.position.z - Math.cos(yaw.current) * cosPitch * 10;
    camera.lookAt(lookX, lookY, lookZ);

    if (controls.current) {
      controls.current.target.set(lookX, lookY, lookZ);
    }
  });

  return null;
}
function Compass() { return <div className="compass"><span>N</span><div>▲</div></div>; }
function Minimap() {
  return <div className="mini-map"><span className="mini-road" /><span className="mini-player" /><span className="mini-building m1" /><span className="mini-building m2" /><span className="mini-building m3" /><small>CLICK TO FOCUS</small></div>;
}
function Dependencies({ data, snapshot, show }: { data: OsmCampusData; snapshot?: CampusMapStatusResponse | null; show: boolean }) {
  if (!show || !snapshot) return null;
  const pointByNode = new Map<string, XZ>();
  for (const b of data.buildings) if (b.campusNodeId) pointByNode.set(b.campusNodeId, b.centroid);
  for (const n of snapshot.nodes) if (!pointByNode.has(n.id)) {
    if (n.parentId && pointByNode.has(n.parentId)) pointByNode.set(n.id, pointByNode.get(n.parentId)!);
    else if (n.position) pointByNode.set(n.id, n.position);
  }
  const colors: Record<string, string> = { POWER: '#f0b33b', NETWORK: '#50c8ec', WATER: '#59a8ff', HVAC: '#a2d96f' };
  return <>{snapshot.dependencies.map(dep => {
    const a = pointByNode.get(dep.sourceNodeId), b = pointByNode.get(dep.targetNodeId);
    if (!a || !b) return null;
    return <Line key={dep.id} points={[[a.x, 3, a.z], [b.x, 3, b.z]]} color={colors[dep.domain]} lineWidth={3} dashed dashSize={9} gapSize={5} />;
  })}</>;
}
function ScannedAsset({ path }: { path: string }) {
  return path.endsWith('.splat') || path.endsWith('.ply') ? <Splat src={path} position={[0, 0, 0]} toneMapped /> : <Suspense fallback={null}><ScanModel src={path} /></Suspense>;
}
const officialNames = [
  'unassigned', 'not a campus building', ...campusRegistry.blocks.map(b => b.displayName)
];
function AlignmentScene({ data, assignments, selectedWay, hoveredWay, setHoveredWay, showAllLabels, onSelect, measure, points, onMeasure }: {
  data: OsmCampusData; assignments: Record<number, string>; selectedWay: number | null; onSelect: (id: number) => void;
  hoveredWay: number | null; setHoveredWay: (id: number | null) => void; showAllLabels: boolean;
  measure: boolean; points: XZ[]; onMeasure: (p: XZ) => void;
}) {
  const { camera } = useThree();
  const extents = boundsOf(data.buildings.flatMap(b => b.footprint));
  const centerX = (extents.minX + extents.maxX) / 2, centerZ = (extents.minZ + extents.maxZ) / 2;
  useEffect(() => {
    camera.up.set(0, 0, -1); camera.position.set(centerX, 900, centerZ); camera.lookAt(centerX, 0, centerZ);
    if ('isOrthographicCamera' in camera) { camera.zoom = 1.35; camera.updateProjectionMatrix(); }
  }, [camera, centerX, centerZ]);
  const records = data.buildings;
  return <>
    <color attach="background" args={['#f3f0e8']} />
    <ambientLight intensity={1.25} /><directionalLight position={[-100, 240, 80]} intensity={1.35} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} onClick={e=>{if(measure){e.stopPropagation();onMeasure({x:e.point.x,z:e.point.z});}}}><planeGeometry args={[1200, 1200]} /><meshBasicMaterial color="#e8e4da" /></mesh>
    {records.map((r, i) => {
      const name = assignments[r.osmWayId] ?? (r.campusNodeId ? (osmBuildingAssignments as Record<string, {displayName:string}>)[r.campusNodeId]?.displayName : '') ?? '';
      const color = selectedWay === r.osmWayId ? '#ffd27b' : name === 'not a campus building' ? '#d9d5cc' : name && name !== 'unassigned' ? '#8eb4a0' : '#e2a078';
      const shape = shapeFrom(r.footprint), geometry = new ShapeGeometry(shape);
      const showLabel = showAllLabels || selectedWay === r.osmWayId || hoveredWay === r.osmWayId;
      return <group key={r.osmWayId} onPointerOver={() => setHoveredWay(r.osmWayId)} onPointerOut={() => setHoveredWay(null)} onClick={e => { e.stopPropagation(); if (measure) onMeasure({x:e.point.x,z:e.point.z}); else onSelect(r.osmWayId); }}>
        <mesh geometry={geometry} rotation={[-Math.PI / 2,0,0]} position={[0,.02+i*.00001,0]}>
          <meshBasicMaterial color={color} side={DoubleSide} transparent opacity={.95} />
        </mesh>
        <Line points={r.footprint.map(p=>[p.x,.08+i*.00001,p.z] as [number,number,number])} color={selectedWay===r.osmWayId?'#8a4f13':'#686b66'} lineWidth={selectedWay===r.osmWayId?2.4:1} />
        {showLabel && <Html position={[r.centroid.x,.3,r.centroid.z]} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ minWidth: 70, maxWidth: 118, padding: '2px 4px', borderRadius: 3, border: '1px solid #5f655e', background: 'rgba(250,249,243,.94)', color: '#25312d', textAlign: 'center', font: '600 8px/1.15 system-ui', whiteSpace: 'normal', boxShadow: '0 1px 3px #0003' }}>
            <div>{name && name !== 'unassigned' && name !== 'not a campus building' ? name : name === 'not a campus building' ? 'EXCLUDE' : 'UNASSIGNED'}</div>
            <div style={{ fontWeight: 500 }}>{r.osmWayId}</div>
          </div>
        </Html>}
      </group>;
    })}
    {points.length>0 && <mesh position={[points[0].x,.4,points[0].z]}><sphereGeometry args={[1.2,12,8]}/><meshBasicMaterial color="#d54637"/></mesh>}
    {points.length>1 && <><Line points={points.slice(0,2).map(p=>[p.x,.4,p.z] as [number,number,number])} color="#d54637" lineWidth={3}/><mesh position={[points[1].x,.4,points[1].z]}><sphereGeometry args={[1.2,12,8]}/><meshBasicMaterial color="#d54637"/></mesh></>}
    <OrbitControls makeDefault enableRotate={false} enablePan enableZoom zoomSpeed={.8} minZoom={.35} maxZoom={5} />
  </>;
}
type SceneStatsData = { fps: number; frameTime: number; calls: number; triangles: number; textures: number; geometries: number };
const statsListeners = new Set<(s: SceneStatsData) => void>();
let latestStats: SceneStatsData | null = null;
function notifyStats(s: SceneStatsData) {
  latestStats = s;
  statsListeners.forEach(fn => fn(s));
}

function SceneStats() {
  const { gl, scene } = useThree();
  const sample = useRef({ frames: 0, elapsed: 0 });
  const lastMetrics = useRef({ calls: 0, tris: 0 });

  useEffect(() => {
    (window as any).__SCENE__ = scene;
    const orig = gl.render.bind(gl);
    gl.render = (scene: any, camera: any) => {
      orig(scene, camera);
      if (gl.info.render.triangles > lastMetrics.current.tris) {
        lastMetrics.current.calls = gl.info.render.calls;
        lastMetrics.current.tris = gl.info.render.triangles;
      }
    };
    return () => { gl.render = orig; };
  }, [gl]);

  useFrame((_, dt) => {
    sample.current.frames += 1;
    sample.current.elapsed += dt;
    if (sample.current.elapsed >= 0.65) {
      const fps = Math.round(sample.current.frames / sample.current.elapsed);
      const frameTime = Number((sample.current.elapsed / sample.current.frames * 1000).toFixed(1));
      const calls = lastMetrics.current.calls || gl.info.render.calls;
      const triangles = lastMetrics.current.tris || gl.info.render.triangles;
      const textures = gl.info.memory.textures;
      const geometries = gl.info.memory.geometries;
      notifyStats({ fps, frameTime, calls, triangles, textures, geometries });
      sample.current.frames = 0;
      sample.current.elapsed = 0;
      lastMetrics.current.tris = 0;
    }
  });
  return null;
}
function Scene({ night, quality, walkMode, setWalkMode, controls, introDone, setIntroFinished, data, snapshot, selectedNodeId, onSelectNode, onDoubleClickBuilding, onEnterBuilding, viewCommand, affectedNodeIds, whatIfNodeIds, showDependencies, scanPath, facadeAdjustments, onPhotoStatus }: {
  night: boolean; quality: boolean; walkMode: boolean; setWalkMode: (v: boolean) => void; controls: RefObject<any>; introDone: RefObject<boolean>; setIntroFinished: (v: boolean) => void; data: OsmCampusData;
  snapshot?: CampusMapStatusResponse | null; selectedNodeId?: string; onSelectNode?: (id: string) => void;
  onDoubleClickBuilding?: (id: string) => void;
  onEnterBuilding?: (id: string) => void;
  viewCommand: ViewCommand;
  affectedNodeIds: string[]; whatIfNodeIds: string[]; showDependencies: boolean; scanPath: string | null;
  facadeAdjustments: Record<string, FacadeAdjustment>;
  onPhotoStatus: (id: string, hasPhoto: boolean, edgeCount: number) => void;
}) {
  const textures = useSurfaceTextures();
  const campusBounds = boundsOf(data.campusBoundary.footprint);
  const shadowExtent = Math.ceil(Math.max(campusBounds.maxX - campusBounds.minX, campusBounds.maxZ - campusBounds.minZ) / 2 + 60);
  return <>
    <fog attach="fog" args={[night ? '#17212c' : '#d1dbd7', 620, 1450]} />
    <hemisphereLight args={[night ? '#7b89a5' : '#dbe9ed', night ? '#28312c' : '#4c5745', night ? .55 : .85]} />
    <ambientLight intensity={night ? .22 : .24} />
    <directionalLight position={[-240, 360, 240]} intensity={night ? .35 : 1.52} color={night ? '#aeb8e4' : '#fff4e5'} castShadow
      shadow-mapSize-width={quality ? 2048 : 1024} shadow-mapSize-height={quality ? 2048 : 1024}
      shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent} shadow-camera-top={shadowExtent} shadow-camera-bottom={-shadowExtent}
      shadow-camera-near={10} shadow-camera-far={850} shadow-bias={-.00015} shadow-normalBias={.06} shadow-radius={2.5} />
    <Environment files="/assets/hdri/autumn_field_puresky_2k.hdr" background environmentIntensity={.65} backgroundBlurriness={0} />
    <Ground data={data} textures={textures} />
    <ContextBuildings buildings={data.surroundings?.buildings ?? []} textures={textures} />
    {!scanPath && data.buildings.map(record => {
      const node = nodeFor(record, snapshot?.nodes ?? []);
      const id = node?.id ?? ('osm-way-' + record.osmWayId);
      return <Building key={record.osmWayId} record={record} nodes={snapshot?.nodes ?? []}
        selectedNodeId={selectedNodeId} affected={!!record.campusNodeId && affectedNodeIds.includes(record.campusNodeId)}
        whatIf={!!record.campusNodeId && whatIfNodeIds.includes(record.campusNodeId)} onSelect={onSelectNode}
        onDoubleClick={onDoubleClickBuilding}
        onEnterBuilding={onEnterBuilding}
        scanActive={false} quality={quality} night={night} textures={textures}
        adjustment={facadeAdjustments[id]} onPhotoStatus={onPhotoStatus} />;
    })}
    {scanPath && <ScanLayer scanPath={scanPath} data={data} nodes={snapshot?.nodes ?? []} selectedNodeId={selectedNodeId}
      affectedNodeIds={affectedNodeIds} whatIfNodeIds={whatIfNodeIds} onSelect={onSelectNode} quality={quality} night={night} textures={textures} />}
    <CampusTrees data={data} textures={textures} quality={quality} />
    <CampusDetails data={data} night={night} textures={textures} quality={quality} />
    <Dependencies data={data} snapshot={snapshot} show={showDependencies} />
    <SceneStats />
    <IntroFlyIn done={introDone} onComplete={() => setIntroFinished(true)} controls={controls} />
    <OrbitControls
      ref={controls}
      enabled={!!introDone.current && !walkMode}
      enableDamping
      dampingFactor={0.05}
      enablePan
      panSpeed={1.5}
      rotateSpeed={0.8}
      zoomSpeed={1.6}
      minDistance={15}
      maxDistance={700}
      maxPolarAngle={Math.PI * 0.48}
      minPolarAngle={0.02}
      target={[45, 0, 40]}
    />
    <FocusSelected controls={controls} command={viewCommand} data={data} snapshot={snapshot} introFinished={!!introDone.current && !walkMode} />
    <WalkControls active={walkMode} data={data} controls={controls} onExit={() => setWalkMode(false)} />
    {quality && (
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={1.8} intensity={0.30} distanceFalloff={1.0} />
        <Bloom luminanceThreshold={0.92} intensity={0.10} mipmapBlur />
        <Vignette eskil={false} offset={0.16} darkness={0.18} />
      </EffectComposer>
    )}
  </>;
}
function FacadeDebugPanel({
  selectedId,
  buildingName,
  adjustment,
  edgeCount,
  hasPhoto,
  onChange,
  onSave,
  onClose,
  saveNotice
}: {
  selectedId: string;
  buildingName: string;
  adjustment: FacadeAdjustment;
  edgeCount: number;
  hasPhoto: boolean;
  onChange: (adj: FacadeAdjustment) => void;
  onSave: () => void;
  onClose: () => void;
  saveNotice: string;
}) {
  return (
    <div className="facade-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>📷 FACADE PHOTO DEBUGGER</b>
        <button onClick={onClose} style={{ padding: '2px 6px', fontSize: 10 }}>✕</button>
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 12, color: '#f2ecd9' }}>{buildingName}</div>
        <small style={{ color: '#8ea197' }}>ID: {selectedId}</small>
      </div>

      <div>
        {hasPhoto ? (
          <span className="status-tag ok">✓ Photo: /textures/{selectedId}/front.jpg</span>
        ) : (
          <span className="status-tag fallback">⚠ No front.jpg (plain fallback colour)</span>
        )}
      </div>

      <div className="facade-row">
        <label>Front Edge:</label>
        <select
          value={adjustment.edgeIndex ?? 0}
          onChange={e => onChange({ ...adjustment, edgeIndex: parseInt(e.target.value) })}
        >
          {Array.from({ length: Math.max(1, edgeCount) }, (_, i) => (
            <option key={i} value={i}>Edge {i + 1} of {edgeCount}</option>
          ))}
        </select>
      </div>

      <div className="facade-row">
        <label>Scale X: {adjustment.scaleX.toFixed(2)}</label>
        <input
          type="range"
          min={0.2}
          max={3.0}
          step={0.05}
          value={adjustment.scaleX}
          onChange={e => onChange({ ...adjustment, scaleX: parseFloat(e.target.value) })}
        />
      </div>

      <div className="facade-row">
        <label>Scale Y: {adjustment.scaleY.toFixed(2)}</label>
        <input
          type="range"
          min={0.2}
          max={3.0}
          step={0.05}
          value={adjustment.scaleY}
          onChange={e => onChange({ ...adjustment, scaleY: parseFloat(e.target.value) })}
        />
      </div>

      <div className="facade-row">
        <label>Offset X: {adjustment.offsetX.toFixed(2)}</label>
        <input
          type="range"
          min={-1.5}
          max={1.5}
          step={0.02}
          value={adjustment.offsetX}
          onChange={e => onChange({ ...adjustment, offsetX: parseFloat(e.target.value) })}
        />
      </div>

      <div className="facade-row">
        <label>Offset Y: {adjustment.offsetY.toFixed(2)}</label>
        <input
          type="range"
          min={-1.5}
          max={1.5}
          step={0.02}
          value={adjustment.offsetY}
          onChange={e => onChange({ ...adjustment, offsetY: parseFloat(e.target.value) })}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          onClick={() => onChange({ scaleX: 1.0, scaleY: 1.0, offsetX: 0.0, offsetY: 0.0, edgeIndex: 0 })}
          style={{ flex: 1 }}
        >
          Reset
        </button>
        <button className="primary" onClick={onSave} style={{ flex: 2 }}>
          💾 Save for {selectedId}
        </button>
      </div>

      {saveNotice && <div style={{ color: '#7ee0a9', fontSize: 11, textAlign: 'center' }}>{saveNotice}</div>}

      <div style={{ borderTop: '1px solid #3c5448', paddingTop: 6, fontSize: 10, color: '#8ea197' }}>
        Place custom photos at <code>public/textures/&lt;buildingId&gt;/front.jpg</code>.
      </div>
    </div>
  );
}

function StatsPill() {
  const [stats, setStats] = useState<SceneStatsData | null>(latestStats);
  useEffect(() => {
    statsListeners.add(setStats);
    return () => { statsListeners.delete(setStats); };
  }, []);
  if (!stats) return null;
  return (
    <span className="stats-pill">
      {stats.fps} FPS ({stats.frameTime}ms) · {stats.calls} calls · {stats.triangles?.toLocaleString()} tris · {stats.textures} tex
    </span>
  );
}

function TelemetryOverlay({ show, quality }: { show: boolean; quality: boolean }) {
  const [stats, setStats] = useState<SceneStatsData | null>(latestStats);
  useEffect(() => {
    if (!show) return;
    statsListeners.add(setStats);
    return () => { statsListeners.delete(setStats); };
  }, [show]);
  if (!show) return null;
  return (
    <div style={{
      position: 'absolute',
      top: 56,
      right: 16,
      background: 'rgba(12, 18, 26, 0.92)',
      color: '#e2e8f0',
      padding: '12px 18px',
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 1.6,
      zIndex: 100,
      border: '1px solid #2d3748',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 'bold', color: '#68d391', marginBottom: 4 }}>CAMPUS TELEMETRY</div>
      <div>FPS: <b style={{ color: (stats?.fps ?? 0) >= 40 ? '#68d391' : '#f6ad55' }}>{stats?.fps ?? '—'}</b> {stats?.frameTime ? `(${stats.frameTime} ms)` : ''}</div>
      <div>Draw Calls: <b>{stats?.calls ?? '—'}</b></div>
      <div>Triangles: <b>{stats?.triangles?.toLocaleString() ?? '—'}</b></div>
      <div>GPU Textures: <b>{stats?.textures ?? '—'}</b></div>
      <div>GPU Geometries: <b>{stats?.geometries ?? '—'}</b></div>
      <div>Tier: <b>{quality ? '✨ Quality Mode (AO+Bloom)' : '⚡ Fast Mode'}</b></div>
    </div>
  );
}

export function CampusWorld({
  snapshot,
  selectedNodeId,
  onSelectNode,
  affectedNodeIds = [],
  whatIfNodeIds = [],
  interiorMode: propInteriorMode,
  onInteriorModeChange,
  interiorBlockId: propInteriorBlockId,
  onInteriorBlockChange,
  interiorRoomId: propInteriorRoomId,
  onInteriorRoomChange,
  onEnterBuilding: propOnEnterBuilding,
}: WorldProps) {
  const [data, setData] = useState<OsmCampusData | null>(null);
  const [night, setNight] = useState(false), [quality, setQuality] = useState(false), [introFinished, setIntroFinished] = useState(false);
  // quality=false: perf mode (no postprocessing); quality=true: visual quality (AO+Bloom on)
  const [walkMode, setWalkMode] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('walk') === 'true' || p.get('view') === 'walk';
  });
  const [showStats, setShowStats] = useState(false);
  const [showDependencies, setShowDependencies] = useState(true), [scanPath, setScanPath] = useState<string | null>(null);
  const [viewCommand, setViewCommand] = useState<ViewCommand>({ type: 'overview', revision: 0 });
  const [alignment, setAlignment] = useState(false), [selectedWay, setSelectedWay] = useState<number | null>(null), [measure, setMeasure] = useState(false), [measurePoints, setMeasurePoints] = useState<XZ[]>([]);
  const [footprintNames, setFootprintNames] = useState<Record<number, string>>({}), [hoveredWay, setHoveredWay] = useState<number | null>(null), [showAllLabels, setShowAllLabels] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState('');
  
  // Interior Cutaway & Diorama navigation states
  const [localInteriorMode, setLocalInteriorMode] = useState<'campus' | 'cutaway' | 'diorama'>('campus');
  const [localInteriorBlockId, setLocalInteriorBlockId] = useState<string>('PG');
  const [localInteriorRoomId, setLocalInteriorRoomId] = useState<string>('PG-001');

  // Projector Predictive Maintenance Simulation State (PG Smart Labs)
  const [simDay, setSimDay] = useState(0);
  const [projectorFaults, setProjectorFaults] = useState<Record<string, FaultType>>({
    'PG-001-PROJ': 'none',
    'PG-102-PROJ': 'none',
    'PG-201-PROJ': 'none',
    'PG-302-PROJ': 'none',
    'PG-402-PROJ': 'none'
  });
  const [showSimPanel, setShowSimPanel] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [simPanelTab, setSimPanelTab] = useState<'status' | 'connection'>('status');
  const [selectedSimDeviceId, setSelectedSimDeviceId] = useState<string>('PG-201-PROJ');
  const [noiseEnabled, setNoiseEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleSetProjectorFault = useCallback((deviceId: string, fault: FaultType) => {
    projectorSim.setFault(deviceId, fault, simDay);
    setProjectorFaults(prev => ({ ...prev, [deviceId]: fault }));
  }, [simDay]);

  const handleResetSim = useCallback(() => {
    projectorSim.reset();
    setSimDay(0);
    setProjectorFaults({
      'PG-001-PROJ': 'none',
      'PG-102-PROJ': 'none',
      'PG-201-PROJ': 'none',
      'PG-302-PROJ': 'none',
      'PG-402-PROJ': 'none'
    });
  }, []);

  const projectorPredictions = useMemo(() => {
    const res: Record<string, DevicePrediction> = {};
    for (const p of PG_PROJECTOR_IDS) {
      const readings = projectorSim.getReadingsUpToDay(p.deviceId, simDay);
      res[p.deviceId] = projectorPredictor.predict(p.deviceId, readings);
    }
    return res;
  }, [simDay, projectorFaults, noiseEnabled]);

  const [, setBridgeTick] = useState(0);
  useEffect(() => {
    return dashboardBridge.subscribe(() => setBridgeTick(t => t + 1));
  }, []);

  useEffect(() => {
    Object.values(projectorPredictions).forEach(pred => {
      dashboardBridge.checkAndDispatchPrediction(pred);
    });
  }, [projectorPredictions]);

  const interiorMode = propInteriorMode ?? localInteriorMode;
  const setInteriorMode = useCallback((mode: 'campus' | 'cutaway' | 'diorama') => {
    onInteriorModeChange?.(mode);
    setLocalInteriorMode(mode);
  }, [onInteriorModeChange]);

  const interiorBlockId = propInteriorBlockId ?? localInteriorBlockId;
  const setInteriorBlockId = useCallback((id: string) => {
    onInteriorBlockChange?.(id);
    setLocalInteriorBlockId(id);
  }, [onInteriorBlockChange]);

  const interiorRoomId = propInteriorRoomId ?? localInteriorRoomId;
  const setInteriorRoomId = useCallback((id: string) => {
    onInteriorRoomChange?.(id);
    setLocalInteriorRoomId(id);
  }, [onInteriorRoomChange]);

  const enterBlockCutaway = useCallback((blockId: string) => {
    const blk = getBlock(blockId) ?? getBlockByNodeId(blockId);
    if (blk) {
      console.log(`[interior] entering ${blk.blockId}`);
      setInteriorBlockId(blk.blockId);
      setInteriorMode('cutaway');
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'cutaway');
        url.searchParams.set('block', blk.blockId);
        url.searchParams.delete('room');
        url.searchParams.delete('lab');
        window.history.replaceState(null, '', url.toString());
      }
    }
  }, [setInteriorBlockId, setInteriorMode]);

  const enterRoomDiorama = useCallback((roomId: string) => {
    const r = getRoom(roomId) ?? getRoomByNodeIdOrAlias(roomId);
    if (r) {
      setInteriorRoomId(r.roomId);
      setInteriorMode('diorama');
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'room');
        url.searchParams.set('room', r.roomId);
        url.searchParams.delete('block');
        window.history.replaceState(null, '', url.toString());
      }
    }
  }, [setInteriorRoomId, setInteriorMode]);

  const handleDoubleClickBuilding = useCallback((nodeIdOrWayId: string) => {
    const blk = getBlockByNodeId(nodeIdOrWayId) ?? getBlock(nodeIdOrWayId);
    if (blk) {
      const rooms = getRoomsForBlock(blk.blockId);
      if (rooms.length > 0) {
        if (propOnEnterBuilding) {
          propOnEnterBuilding(blk.blockId);
        } else {
          enterBlockCutaway(blk.blockId);
        }
      }
    }
  }, [propOnEnterBuilding, enterBlockCutaway]);

  const selectedBlock = useMemo(() => {
    if (!selectedNodeId) return null;
    return getBlockByNodeId(selectedNodeId) ?? getBlock(selectedNodeId) ?? (
      selectedNodeId.startsWith('osm-way-')
        ? getBlockByOsmWay(Number(selectedNodeId.slice('osm-way-'.length)))
        : undefined
    );
  }, [selectedNodeId]);

  const orderedBlocks = useMemo(() => getOrderedCampusBlocks(), []);

  const selectedBlockRooms = useMemo(() => {
    if (!selectedBlock) return [];
    return getRoomsForBlock(selectedBlock.blockId);
  }, [selectedBlock]);

  const currentBlock = useMemo(() => getBlock(interiorBlockId) ?? getBlock('PG')!, [interiorBlockId]);
  const currentRoom = useMemo(() => getRoom(interiorRoomId) ?? getRoom('PG-001')!, [interiorRoomId]);
  const currentBlockRooms = useMemo(() => getRoomsForBlock(currentBlock.blockId), [currentBlock]);

  const isPGView = useMemo(() => {
    if (interiorMode === 'cutaway') {
      return currentBlock.blockId === 'PG';
    }
    if (interiorMode === 'diorama') {
      return currentRoom.blockId === 'PG' || currentRoom.roomId.startsWith('PG-');
    }
    return false;
  }, [interiorMode, currentBlock, currentRoom]);

  const [facadeAdjustments, setFacadeAdjustments] = useState<Record<string, FacadeAdjustment>>({});
  const [facadePanelOpen, setFacadePanelOpen] = useState(false);
  const [facadeSaveNotice, setFacadeSaveNotice] = useState('');
  const [photoStatusMap, setPhotoStatusMap] = useState<Record<string, { hasPhoto: boolean; edgeCount: number }>>({});

  const handlePhotoStatus = useCallback((id: string, hasPhoto: boolean, edgeCount: number) => {
    setPhotoStatusMap(prev => {
      if (prev[id]?.hasPhoto === hasPhoto && prev[id]?.edgeCount === edgeCount) return prev;
      return { ...prev, [id]: { hasPhoto, edgeCount } };
    });
  }, []);

  useEffect(() => {
    fetch('/__facades/adjustments').then(async r => {
      if (r.ok) {
        const d = await r.json();
        if (d && typeof d === 'object') setFacadeAdjustments(d);
      }
    }).catch(() => {
      const local = localStorage.getItem('campusops_facade_adjustments');
      if (local) {
        try { setFacadeAdjustments(JSON.parse(local)); } catch {}
      }
    });
  }, []);

  const currentBuildingId = selectedNodeId ?? 'building-pg';
  const currentAdj = facadeAdjustments[currentBuildingId] ?? { scaleX: 1.0, scaleY: 1.0, offsetX: 0.0, offsetY: 0.0, edgeIndex: 0 };
  const currentPhotoInfo = photoStatusMap[currentBuildingId] ?? { hasPhoto: false, edgeCount: 4 };

  const handleAdjustmentChange = (newAdj: FacadeAdjustment) => {
    setFacadeAdjustments(prev => ({ ...prev, [currentBuildingId]: newAdj }));
  };

  const handleSaveAdjustment = async () => {
    const updated = {
      ...facadeAdjustments,
      [currentBuildingId]: currentAdj,
    };
    setFacadeAdjustments(updated);
    try {
      localStorage.setItem('campusops_facade_adjustments', JSON.stringify(updated));
      const r = await fetch('/__facades/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (r.ok) {
        setFacadeSaveNotice('Saved to public/data/facade-adjustments.json');
      } else {
        setFacadeSaveNotice('Saved to local storage');
      }
    } catch {
      setFacadeSaveNotice('Saved to local storage');
    }
    setTimeout(() => setFacadeSaveNotice(''), 3500);
  };

  const importRef = useRef<HTMLInputElement>(null);
  const controls = useRef<any>(null), introDone = useRef(false);
  const scanEnabled = import.meta.env.VITE_ENABLE_SCANNED_HERO === 'true';

  const handleSelectNode = useCallback((id: string) => {
    if (walkMode) setWalkMode(false);
    onSelectNode?.(id);
    setViewCommand(previous => ({ type: 'focus', id, revision: previous.revision + 1 }));

    // Map room or block selection to registry
    const matchingRoom = getRoomByNodeIdOrAlias(id);
    if (matchingRoom) {
      setInteriorBlockId(matchingRoom.blockId);
      setInteriorRoomId(matchingRoom.roomId);
    } else {
      const matchingBlock = getBlockByNodeId(id) ?? getBlock(id) ?? (
        id.startsWith('osm-way-') ? getBlockByOsmWay(Number(id.slice('osm-way-'.length))) : undefined
      );
      if (matchingBlock) {
        setInteriorBlockId(matchingBlock.blockId);
      }
    }
  }, [walkMode, onSelectNode]);

  const handleEnterBuildingFromLabel = useCallback((nodeIdOrWayId: string) => {
    handleSelectNode(nodeIdOrWayId);
    const blk = getBlockByNodeId(nodeIdOrWayId) ?? getBlock(nodeIdOrWayId) ?? (
      nodeIdOrWayId.startsWith('osm-way-') ? getBlockByOsmWay(Number(nodeIdOrWayId.slice('osm-way-'.length))) : undefined
    );
    if (blk) {
      const rooms = getRoomsForBlock(blk.blockId);
      if (rooms.length > 0) {
        if (propOnEnterBuilding) {
          propOnEnterBuilding(blk.blockId);
        } else {
          enterBlockCutaway(blk.blockId);
        }
      }
    }
  }, [handleSelectNode, propOnEnterBuilding, enterBlockCutaway]);

  const handleOverview = useCallback(() => {
    if (walkMode) setWalkMode(false);
    controls.current?.target.set(45, 0, 40);
    controls.current?.object.position.set(45, 380, 440);
    controls.current?.update();
    setViewCommand(previous => ({ type: 'overview', revision: previous.revision + 1 }));
  }, [walkMode]);

  // Global hotkeys for quick, fun navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'Escape') {
        if (facadePanelOpen) {
          setFacadePanelOpen(false);
        } else if (showSimPanel && isPGView) {
          setShowSimPanel(false);
        } else if (interiorMode === 'diorama') {
          setInteriorMode('cutaway');
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('view', 'cutaway');
            url.searchParams.set('block', interiorBlockId);
            url.searchParams.delete('room');
            url.searchParams.delete('lab');
            window.history.replaceState(null, '', url.toString());
          }
        } else if (interiorMode === 'cutaway') {
          setInteriorMode('campus');
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('view');
            url.searchParams.delete('block');
            url.searchParams.delete('room');
            url.searchParams.delete('lab');
            window.history.replaceState(null, '', url.toString());
          }
        } else if (selectedNodeId || currentBuildingId) {
          handleOverview();
        }
      }
      else if (e.key === 'i' || e.key === 'I') {
        if (interiorMode === 'campus') {
          const blk = getBlockByNodeId(currentBuildingId) ?? getBlock('PG');
          if (blk) {
            enterBlockCutaway(blk.blockId);
          }
        } else if (interiorMode === 'cutaway') {
          setInteriorMode('campus');
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('view');
            url.searchParams.delete('block');
            url.searchParams.delete('room');
            url.searchParams.delete('lab');
            window.history.replaceState(null, '', url.toString());
          }
        }
      }
      else if (e.key === 'r' || e.key === 'R') { handleOverview(); }
      else if (e.key === '1') { handleSelectNode('building-main'); }
      else if (e.key === '2') { handleSelectNode('building-pg'); }
      else if (e.key === '3') { handleSelectNode('landmark-library'); }
      else if (e.key === '4') { handleSelectNode('building-electronics'); }
      else if (e.key === '5') { handleSelectNode('building-mechanical'); }
      else if (e.key === '6') { handleSelectNode('landmark-canteen'); }
      else if (e.key === '7') { handleSelectNode('landmark-auditorium'); }
      else if (e.key === 'v' || e.key === 'V') { setWalkMode(v => !v); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleOverview, handleSelectNode, interiorMode, currentBuildingId, interiorBlockId, enterBlockCutaway, setInteriorMode, facadePanelOpen, showSimPanel, isPGView, selectedNodeId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch('/data/osm-campus.json'), fetch('/data/osm-surroundings.json')])
      .then(async ([campusResponse, contextResponse]) => {
        if (!campusResponse.ok) throw new Error('OSM campus geometry is missing');
        const d = await campusResponse.json();
        d.surroundings = contextResponse.ok ? await contextResponse.json() : undefined;
        try { const response = await fetch('/data/building-assignments.json'); if (response.ok) setFootprintNames(await response.json()); } catch { /* assignment JSON is optional in static builds */ }
        if (cancelled) return;
        const mapped = new Map<number, string>();
        for (const b of campusRegistry.blocks) mapped.set(b.osmWayId, b.nodeId);
        for (const [nodeId, item] of Object.entries(osmBuildingAssignments)) {
          if (!mapped.has(item.osmWayId)) mapped.set(item.osmWayId, nodeId);
        }
        d.buildings.forEach((b: OsmBuilding) => { const node = mapped.get(b.osmWayId); if (node) b.campusNodeId = node; });
        setData(d as OsmCampusData);
      }).catch(e => console.error('Unable to load local OpenStreetMap geometry', e));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!scanEnabled) return;
    let cancelled = false;
    (async () => {
      for (const path of ['/scans/srm-campus.splat', '/scans/srm-campus.ply', '/scans/srm-campus.glb']) {
        try { const r = await fetch(path, { method: 'HEAD' }); if (r.ok && !r.headers.get('content-type')?.includes('text/html')) { if (!cancelled) setScanPath(path); return; } } catch { /* try next supported local scan */ }
      }
    })();
    return () => { cancelled = true; };
  }, [scanEnabled]);
  const style = { width: '100%', height: '100%' };
  if (!data) return <div className="world-wrap world-loading"><span>Loading local OpenStreetMap campus geometry…</span></div>;
  return <div className="world-wrap">
    <Canvas key={alignment?'alignment':interiorMode} orthographic={alignment} shadows={!alignment} dpr={[1, quality ? 1.2 : 1.0]} camera={alignment ? { position: [0, 900, 0], zoom: 1, near: .1, far: 2000 } : interiorMode === 'cutaway' ? { position: [54, 38, 54], fov: 45, near: 0.1, far: 500 } : interiorMode === 'diorama' ? { position: [3.3, 2.4, 3.2], fov: 48, near: 0.1, far: 50 } : { position: [45, 580, 560], fov: 52, near: .1, far: 1400 }}
      gl={{ antialias: quality, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.03, outputColorSpace: SRGBColorSpace }}
      onCreated={({ gl, scene, camera }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.04; gl.outputColorSpace = SRGBColorSpace; gl.shadowMap.enabled = true; gl.shadowMap.type = PCFSoftShadowMap; gl.info.autoReset = true; (window as any).__SCENE__ = scene; (window as any).__GL__ = gl; (window as any).__CAMERA__ = camera; }} style={style}>
      {alignment ? <AlignmentScene data={data} assignments={footprintNames} selectedWay={selectedWay} hoveredWay={hoveredWay} setHoveredWay={setHoveredWay} showAllLabels={showAllLabels} onSelect={setSelectedWay} measure={measure} points={measurePoints} onMeasure={p=>setMeasurePoints(old=>old.length===2?[p]:[...old,p])} /> :
        interiorMode === 'cutaway' ? (
          <BuildingCutaway
            block={currentBlock}
            rooms={currentBlockRooms}
            equipment={campusRegistry.equipment.filter(e => e.blockId === currentBlock.blockId)}
            predictions={projectorPredictions}
            onSelectRoom={(roomId) => {
              enterRoomDiorama(roomId);
            }}
            onBack={() => {
              setInteriorMode('campus');
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.delete('view');
                url.searchParams.delete('block');
                url.searchParams.delete('room');
                url.searchParams.delete('lab');
                window.history.replaceState(null, '', url.toString());
              }
            }}
            night={night}
          />
        ) : interiorMode === 'diorama' ? (
          <ClassroomDiorama
            room={currentRoom}
            equipment={getEquipmentForRoom(currentRoom.roomId)}
            prediction={projectorPredictions[`${currentRoom.roomId}-PROJ`]}
            onSelectProjector={(devId) => {
              setSelectedSimDeviceId(devId);
              setSimPanelTab('connection');
              setShowSimPanel(true);
            }}
            onBack={() => {
              setInteriorMode('cutaway');
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('view', 'cutaway');
                url.searchParams.set('block', currentBlock.blockId);
                url.searchParams.delete('room');
                url.searchParams.delete('lab');
                window.history.replaceState(null, '', url.toString());
              }
            }}
            night={night}
          />
        ) : (
          <Suspense fallback={null}><Scene night={night} quality={quality} walkMode={walkMode} setWalkMode={setWalkMode} controls={controls} introDone={introDone} setIntroFinished={setIntroFinished} data={data} snapshot={snapshot} selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode} onDoubleClickBuilding={handleDoubleClickBuilding} onEnterBuilding={handleEnterBuildingFromLabel} viewCommand={viewCommand} affectedNodeIds={affectedNodeIds} whatIfNodeIds={whatIfNodeIds} showDependencies={showDependencies} scanPath={scanPath}
            facadeAdjustments={facadeAdjustments} onPhotoStatus={handlePhotoStatus} /></Suspense>
        )}
    </Canvas>
    <div className="world-top"><div className="world-brand">
      {interiorMode === 'diorama' ? (
        <button
          className="top-nav-btn"
          onClick={() => {
            setInteriorMode('cutaway');
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('view', 'cutaway');
              url.searchParams.set('block', currentBlock.blockId);
              url.searchParams.delete('room');
              url.searchParams.delete('lab');
              window.history.replaceState(null, '', url.toString());
            }
          }}
          title="Back to Cutaway view (Esc)"
          style={{
            marginRight: 10,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 700,
            background: '#1e293b',
            color: '#38bdf8',
            border: '1px solid #0284c7',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          ← Back to {currentBlock.displayName} cutaway
        </button>
      ) : interiorMode === 'cutaway' ? (
        <button
          className="top-nav-btn"
          onClick={() => {
            setInteriorMode('campus');
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.delete('view');
              url.searchParams.delete('block');
              url.searchParams.delete('room');
              url.searchParams.delete('lab');
              window.history.replaceState(null, '', url.toString());
            }
          }}
          title="Back to Campus view (Esc)"
          style={{
            marginRight: 10,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 700,
            background: '#1e293b',
            color: '#38bdf8',
            border: '1px solid #0284c7',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          ← Back to Campus
        </button>
      ) : (
        <button
          className="top-nav-btn"
          onClick={handleOverview}
          title="Campus Overview (Esc or R)"
          style={{
            marginRight: 10,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 700,
            background: '#1c2e28',
            color: '#86efac',
            border: '1px solid #22c55e',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          🏛️ Overview
        </button>
      )}
      <span className="brand-dot" />SRM EASWARI <i>·</i> {alignment ? 'ALIGNMENT' : interiorMode === 'cutaway' ? `${currentBlock.displayName.toUpperCase()} CUTAWAY` : interiorMode === 'diorama' ? `${currentRoom.displayName} (${currentRoom.type.toUpperCase()})` : 'CAMPUS OPERATIONS'}
      {(interiorMode === 'cutaway' || interiorMode === 'diorama') && (
        <span className="demo-badge">Demo layout</span>
      )}
    </div><div className="world-tools">
      {interiorMode === 'diorama' ? (
        <>
          <button onClick={() => {
            setInteriorMode('cutaway');
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('view', 'cutaway');
              url.searchParams.set('block', currentBlock.blockId);
              url.searchParams.delete('room');
              url.searchParams.delete('lab');
              window.history.replaceState(null, '', url.toString());
            }
          }}>← Cutaway (ESC)</button>
          <button onClick={() => {
            setInteriorMode('campus');
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.delete('view');
              url.searchParams.delete('block');
              url.searchParams.delete('room');
              url.searchParams.delete('lab');
              window.history.replaceState(null, '', url.toString());
            }
          }}>🏛️ Campus View</button>
          {isPGView && <button onClick={() => setShowSimPanel(v => !v)} style={{ background: showSimPanel ? '#0284c7' : '#1e293b', borderColor: '#38bdf8' }}>{showSimPanel ? 'Hide Sim' : '⚡ Sim Panel'}</button>}
          <button onClick={() => openDashboard(msg => setToastMessage(msg))} style={{ background: '#4338ca', borderColor: '#818cf8', fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}>📊 Dashboard</button>
          <button onClick={downloadRegistryFiles}>📥 Export Registry</button>
          <button onClick={() => setNight(v => !v)}>{night ? '☾ Night' : '☼ Daylight'}</button>
        </>
      ) : interiorMode === 'cutaway' ? (
        <>
          <button onClick={() => {
            setInteriorMode('campus');
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.delete('view');
              url.searchParams.delete('block');
              url.searchParams.delete('room');
              url.searchParams.delete('lab');
              window.history.replaceState(null, '', url.toString());
            }
          }}>← Campus (ESC)</button>
          {isPGView && <button onClick={() => setShowSimPanel(v => !v)} style={{ background: showSimPanel ? '#0284c7' : '#1e293b', borderColor: '#38bdf8' }}>{showSimPanel ? 'Hide Sim' : '⚡ Sim Panel'}</button>}
          <button onClick={() => openDashboard(msg => setToastMessage(msg))} style={{ background: '#4338ca', borderColor: '#818cf8', fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}>📊 Dashboard</button>
          <button onClick={downloadRegistryFiles}>📥 Export Registry</button>
          <button onClick={() => setNight(v => !v)}>{night ? '☾ Night' : '☼ Daylight'}</button>
          <button onClick={() => setQuality(v => !v)}>{quality ? '✨ Perf: Quality' : '⚡ Perf: Fast'}</button>
        </>
      ) : (
        <>
          <button onClick={()=>{setAlignment(v=>!v);setMeasure(false);setMeasurePoints([]);}}> {alignment?'3D view':'Alignment'} </button>
          {!alignment && <>
          <button
            onClick={() => {
              const blk = getBlockByNodeId(currentBuildingId) ?? getBlock('PG');
              if (blk) {
                enterBlockCutaway(blk.blockId);
              }
            }}
            style={{ background: '#274838', borderColor: '#72c8a0' }}
            title="Inspect interior cutaway floors (Key: I)"
          >
            🏢 Cutaway (I)
          </button>
          <button onClick={() => setWalkMode(v => !v)} style={{ background: walkMode ? '#285842' : undefined, borderColor: walkMode ? '#72c8a0' : undefined }}>
            {walkMode ? '🛸 Orbit Mode' : '🚀 Fly / Walk (V)'}
          </button>
          <button onClick={() => setNight(v => !v)}>{night ? '☾ Night' : '☼ Daylight'}</button>
          <button onClick={() => setQuality(v => !v)}>{quality ? '✨ Perf: Quality' : '⚡ Perf: Fast'}</button>
          <button onClick={() => setShowDependencies(v => !v)}>Links {showDependencies ? 'On' : 'Off'}</button>
          <button onClick={() => setShowStats(v => !v)} style={{ background: showStats ? '#2b4c68' : undefined }}>
            {showStats ? '📊 Stats: On' : '📊 Stats'}
          </button>
          <button onClick={() => setFacadePanelOpen(v => !v)} style={{ background: facadePanelOpen ? '#435e50' : undefined }}>
            {facadePanelOpen ? 'Close Facade' : '📷 Facade Tool'}
          </button>
          <button onClick={() => openDashboard(msg => setToastMessage(msg))} style={{ background: '#4338ca', borderColor: '#818cf8', fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}>📊 Dashboard</button>
          <button onClick={downloadRegistryFiles} title="Export campusRegistry.json & rooms.csv">
            📥 Export Registry
          </button>
          </>}
        </>
      )}
    </div></div>
    {toastMessage && (
      <div
        className="campus-toast"
        style={{
          position: 'fixed',
          top: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#991b1b',
          color: '#ffffff',
          padding: '8px 18px',
          borderRadius: 8,
          border: '1px solid #f87171',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 10000,
          fontWeight: 600,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'auto'
        }}
      >
        <span>⚠️</span>
        <span>{toastMessage}</span>
        <button
          onClick={() => setToastMessage(null)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fca5a5',
            fontWeight: 700,
            cursor: 'pointer',
            marginLeft: 8
          }}
        >
          ✕
        </button>
      </div>
    )}
    {showSimPanel && isPGView && (
      <ProjectorSimPanel
        currentDay={simDay}
        onDayChange={setSimDay}
        predictions={projectorPredictions}
        faults={projectorFaults}
        onSetFault={handleSetProjectorFault}
        onReset={handleResetSim}
        activeTab={simPanelTab}
        onTabChange={setSimPanelTab}
        selectedDeviceId={selectedSimDeviceId}
        onSelectDevice={setSelectedSimDeviceId}
        noiseEnabled={noiseEnabled}
        onToggleNoise={setNoiseEnabled}
        onClose={() => setShowSimPanel(false)}
      />
    )}
    <TelemetryOverlay show={showStats && !alignment} quality={quality} />
    {!alignment && interiorMode === 'campus' && walkMode && (
      <div className="walk-hud">
        <div className="walk-badge">🚀 DRONE / FLY MODE</div>
        <div className="walk-instructions">
          <span><b>WASD</b> fly · <b>Space/E</b> up · <b>C/Q</b> down · <b>Shift</b> turbo · <b>Drag mouse</b> look · <b>ESC/V</b> orbit</span>
        </div>
      </div>
    )}
    {facadePanelOpen && !alignment && interiorMode === 'campus' && (
      <FacadeDebugPanel
        selectedId={currentBuildingId}
        buildingName={snapshot?.nodes.find(n => n.id === currentBuildingId)?.name ?? (osmBuildingAssignments as any)[currentBuildingId]?.displayName ?? currentBuildingId}
        adjustment={currentAdj}
        edgeCount={currentPhotoInfo.edgeCount}
        hasPhoto={currentPhotoInfo.hasPhoto}
        onChange={handleAdjustmentChange}
        onSave={handleSaveAdjustment}
        onClose={() => setFacadePanelOpen(false)}
        saveNotice={facadeSaveNotice}
      />
    )}
    {alignment && <div className="align-panel"><b>FOOTPRINT ALIGNMENT · {data.buildings.length} CAMPUS WAYS</b>
      <div className="align-scale"><span>0</span><i/><span>50 m</span></div>
      <button onClick={()=>{setMeasure(v=>!v);setMeasurePoints([]);}}>{measure?'Cancel measure':'Measure distance'}</button>
      <button onClick={()=>setShowAllLabels(v=>!v)}>{showAllLabels?'Hide all labels':'Show all labels'}</button>
      {measurePoints.length===2&&<small>Distance: {Math.hypot(measurePoints[1].x-measurePoints[0].x,measurePoints[1].z-measurePoints[0].z).toFixed(1)} m</small>}
      <button onClick={async()=>{try{const r=await fetch('/__alignment/assignments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(footprintNames)});if(!r.ok)throw new Error();setAssignmentNotice('Saved to public/data/building-assignments.json');}catch{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(footprintNames,null,2)],{type:'application/json'}));a.download='building-assignments.json';a.click();URL.revokeObjectURL(a.href);setAssignmentNotice('Downloaded JSON; place it in public/data/');}}}>Export JSON</button>
      <button onClick={()=>importRef.current?.click()}>Import JSON</button>
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();const valid=Object.fromEntries(Object.entries(parsed).filter(([id,name])=>/^\d+$/.test(id)&&typeof name==='string'&&officialNames.includes(name))) as Record<number,string>;setFootprintNames(valid);setAssignmentNotice(`Imported ${Object.keys(valid).length} assignments`);}catch{setAssignmentNotice('Could not read assignment JSON');}e.target.value='';}} />
      {assignmentNotice&&<small>{assignmentNotice}</small>}
      {selectedWay!==null&&<><small>OSM way {selectedWay}</small><select value={footprintNames[selectedWay]??'unassigned'} onChange={e=>setFootprintNames(old=>({...old,[selectedWay]:e.target.value}))}>{officialNames.map(n=><option key={n} value={n}>{n}</option>)}</select></>}
      <div className="align-list">{data.buildings.map(b=><button key={b.osmWayId} className={selectedWay===b.osmWayId?'active':''} onClick={()=>setSelectedWay(b.osmWayId)}>{footprintNames[b.osmWayId]??(b.campusNodeId?(osmBuildingAssignments as Record<string,{displayName:string}>)[b.campusNodeId]?.displayName:null)??'Unassigned'} · {b.osmWayId}</button>)}</div>
    </div>}
    {!alignment && interiorMode === 'cutaway' && (
      <div className="world-bottom" style={{ background: 'transparent', border: 'none', padding: 0, backdropFilter: 'none' }}>
        <ScrollableDock
          activeId={interiorRoomId}
          hintCaption="🖱 Click room or pill to enter Diorama · Scroll zoom · Drag orbit"
          prefix={
            <span style={{ fontWeight: 700, color: '#e2ece6', fontSize: 11, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
              🏢 Select Room:
            </span>
          }
        >
          {currentBlockRooms.map(r => {
            const isSelected = r.roomId === interiorRoomId;
            const reports = dashboardBridge.getOpenReportsForRoom(r.roomId);
            const hasReport = reports.length > 0;
            const pred = projectorPredictions[`${r.roomId}-PROJ`];
            const isWarning = pred && (pred.healthState === 'degrading' || pred.healthState === 'imminent');

            const pillBg = hasReport
              ? '#b91c1c'
              : isWarning
              ? '#854d0e'
              : isSelected
              ? '#15803d'
              : r.type === 'smart_lab'
              ? '#254e3f'
              : undefined;

            const pillBorder = hasReport
              ? '#fca5a5'
              : isWarning
              ? '#fde047'
              : isSelected
              ? '#86efac'
              : r.type === 'smart_lab'
              ? '#72c8a0'
              : undefined;

            return (
              <button
                key={r.roomId}
                data-dock-id={r.roomId}
                className={`dock-btn ${isSelected ? 'selected' : ''} ${r.type === 'smart_lab' ? 'active' : ''}`}
                style={{
                  background: pillBg,
                  borderColor: pillBorder,
                  color: hasReport || isWarning || isSelected ? '#ffffff' : undefined,
                  fontWeight: hasReport || isWarning || isSelected ? 700 : undefined
                }}
                title={hasReport ? `🚨 ${reports.length} open report(s)` : isWarning ? `⚡ Degraded: ${pred?.failureMode}` : `View ${r.displayName} (${r.type})`}
                onClick={() => {
                  enterRoomDiorama(r.roomId);
                }}
              >
                {hasReport ? `🚨 ${reports.length} ` : isWarning ? '⚡ ' : r.type === 'smart_lab' ? '★ ' : ''}{r.displayName}
              </button>
            );
          })}
        </ScrollableDock>
      </div>
    )}
    {!alignment && interiorMode === 'campus' && (
      <div className="campus-interaction-hint" style={{
        position: 'absolute',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(15, 23, 21, 0.88)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        color: '#f8fafc',
        padding: '6px 18px',
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 600,
        pointerEvents: 'none',
        zIndex: 50,
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap'
      }}>
        💡 Click a building, then Enter. Esc to go back.
      </div>
    )}
    {!alignment && interiorMode === 'campus' && selectedBlock && selectedBlockRooms.length > 0 && (
      <div className="canvas-enter-overlay" style={{
        position: 'absolute',
        bottom: 82,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto'
      }}>
        <button
          className="canvas-enter-building-btn"
          id="canvas-enter-building-btn"
          onClick={() => {
            if (propOnEnterBuilding) {
              propOnEnterBuilding(selectedBlock.blockId);
            } else {
              enterBlockCutaway(selectedBlock.blockId);
            }
          }}
          style={{
            padding: '12px 28px',
            fontSize: 16,
            fontWeight: 800,
            color: '#ffffff',
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            border: '2px solid #86efac',
            borderRadius: 30,
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5), 0 0 16px rgba(74, 222, 128, 0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            letterSpacing: '0.02em',
            transition: 'all 0.15s ease'
          }}
        >
          🚪 Enter {selectedBlock.displayName}
        </button>
      </div>
    )}
    {!alignment && interiorMode === 'campus' && <div className="world-info"><Compass /><Minimap /></div>}
    {!alignment && interiorMode === 'campus' && (
      <div className="world-bottom" style={{ background: 'transparent', border: 'none', padding: 0, backdropFilter: 'none' }}>
        <ScrollableDock
          activeId={selectedBlock?.blockId ?? selectedNodeId}
          hintCaption="💡 Click a building, then Enter. Esc to go back."
          prefix={
            <button
              className="dock-btn"
              title="Campus Overview (Key: R)"
              onClick={handleOverview}
              style={{ fontWeight: 700, background: '#1c2e28' }}
            >
              🏛️ Overview
            </button>
          }
          suffix={<StatsPill />}
        >
          {orderedBlocks.map(b => {
            const isSelected = selectedBlock?.blockId === b.blockId || selectedNodeId === b.nodeId;
            const hasRooms = (b.hasRooms ?? (b.roomCount > 0));
            return (
              <button
                key={b.blockId}
                data-dock-id={b.blockId}
                className={`dock-btn ${isSelected ? 'selected' : ''}`}
                style={{
                  background: isSelected ? '#15803d' : undefined,
                  borderColor: isSelected ? '#86efac' : undefined,
                  color: isSelected ? '#ffffff' : undefined,
                  fontWeight: isSelected ? 700 : undefined
                }}
                title={`${b.displayName}${b.nameSource === 'unverified' ? ' (Unverified name)' : ''}${hasRooms ? ' · Has interiors' : ''}`}
                onClick={() => {
                  handleSelectNode(b.nodeId);
                }}
              >
                {b.displayName}
                {b.nameSource === 'unverified' && (
                  <span
                    style={{
                      marginLeft: 4,
                      fontSize: 9,
                      opacity: 0.75,
                      padding: '1px 3px',
                      background: 'rgba(255, 255, 255, 0.15)',
                      borderRadius: 3,
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    ?
                  </span>
                )}
              </button>
            );
          })}
        </ScrollableDock>
      </div>
    )}
    {!alignment && <div className="world-caption">{interiorMode === 'diorama' ? 'Room Diorama · Authentic Indian College Classroom' : interiorMode === 'cutaway' ? 'Exploded Vertical Floor Cutaway · Select room for diorama' : (scanPath ? 'Photogrammetry hero scene · OSM proxy overlays' : 'OpenStreetMap footprints · estimated heights where OSM has no height tags')}</div>}
  </div>;
}

