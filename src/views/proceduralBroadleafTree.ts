import * as THREE from 'three';

export function createProceduralBroadleafTree(variantIndex = 0, isLod = false): { branches: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  // 1. Tapered trunk with bark UVs
  const v = variantIndex % 4;
  const swayAngle = v * 1.57 + 0.4;
  const sway = 0.3 + (v % 2) * 0.25;

  const trunkHeight = 4.2 + (v % 2) * 0.5;
  const trunkBaseRadius = 0.62 + (v % 3) * 0.06;
  const trunkTopRadius = 0.32;

  const trunkSegments = isLod ? 6 : 10;
  const trunkRadial = isLod ? 6 : 8;

  // Trunk via CatmullRomCurve3
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(Math.cos(swayAngle) * sway * 0.25, trunkHeight * 0.35, Math.sin(swayAngle) * sway * 0.25),
    new THREE.Vector3(Math.cos(swayAngle) * sway * 0.75, trunkHeight * 0.72, Math.sin(swayAngle) * sway * 0.75),
    new THREE.Vector3(Math.cos(swayAngle) * sway, trunkHeight, Math.sin(swayAngle) * sway),
  ]);

  const trunkGeo = new THREE.TubeGeometry(trunkCurve, trunkSegments, trunkBaseRadius * 0.55, trunkRadial, false);
  // Flare the base vertices outward
  const trunkPos = trunkGeo.attributes.position;
  for (let i = 0; i < trunkPos.count; i++) {
    const y = trunkPos.getY(i);
    if (y < 1.0) {
      const flare = 1.0 + (1.0 - y) * 0.45;
      trunkPos.setX(i, trunkPos.getX(i) * flare);
      trunkPos.setZ(i, trunkPos.getZ(i) * flare);
    }
  }
  trunkPos.needsUpdate = true;

  // 3 crown boughs extending from trunk top into canopy
  const topPos = trunkCurve.getPoint(1.0);
  const boughGeos: THREE.BufferGeometry[] = [trunkGeo];

  const boughOffsets = [
    { x: 1.6 * Math.cos(v + 0.2), y: 1.8, z: 1.6 * Math.sin(v + 0.2), r: 0.22 },
    { x: -1.7 * Math.cos(v + 1.2), y: 1.7, z: -1.5 * Math.sin(v + 1.2), r: 0.20 },
    { x: 1.3 * Math.sin(v + 2.2), y: 2.1, z: -1.4 * Math.cos(v + 2.2), r: 0.18 },
  ];

  boughOffsets.forEach(b => {
    const bCurve = new THREE.CatmullRomCurve3([
      topPos,
      new THREE.Vector3(topPos.x + b.x * 0.5, topPos.y + b.y * 0.45, topPos.z + b.z * 0.5),
      new THREE.Vector3(topPos.x + b.x, topPos.y + b.y, topPos.z + b.z),
    ]);
    const bGeo = new THREE.TubeGeometry(bCurve, isLod ? 4 : 6, b.r, isLod ? 5 : 6, false);
    boughGeos.push(bGeo);
  });

  // Merge branches
  const branchesGeo = mergeBufferGeometriesSimple(boughGeos);
  if (branchesGeo.attributes.uv && !branchesGeo.attributes.uv2) {
    branchesGeo.setAttribute('uv2', branchesGeo.attributes.uv.clone());
  }

  // 2. Overlapping foliage clusters (6 clusters)
  const clusterDefs = [
    { x: topPos.x * 0.6, y: trunkHeight + 2.4, z: topPos.z * 0.6, radius: 2.7 },
    { x: topPos.x + boughOffsets[0].x * 0.9, y: topPos.y + boughOffsets[0].y + 0.4, z: topPos.z + boughOffsets[0].z * 0.9, radius: 2.3 },
    { x: topPos.x + boughOffsets[1].x * 0.9, y: topPos.y + boughOffsets[1].y + 0.3, z: topPos.z + boughOffsets[1].z * 0.9, radius: 2.4 },
    { x: topPos.x + boughOffsets[2].x * 0.9, y: topPos.y + boughOffsets[2].y + 0.5, z: topPos.z + boughOffsets[2].z * 0.9, radius: 2.2 },
    { x: (topPos.x + boughOffsets[0].x) * 0.5, y: trunkHeight + 1.2, z: (topPos.z + boughOffsets[1].z) * 0.5, radius: 2.1 },
    { x: topPos.x * 0.3, y: trunkHeight + 3.4, z: topPos.z * 0.3, radius: 1.9 },
  ];

  const leafGeos: THREE.BufferGeometry[] = [];
  const canopyMinY = trunkHeight + 0.2;
  const canopyMaxY = trunkHeight + 5.2;

  clusterDefs.forEach((c, cIdx) => {
    const detail = isLod ? 8 : 12;
    const sphere = new THREE.SphereGeometry(c.radius, detail, detail);
    const pos = sphere.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i);
      let py = pos.getY(i);
      let pz = pos.getZ(i);

      // Organic foliage surface noise
      const noise = 1.0 + 0.12 * Math.sin(px * 2.3 + cIdx) * Math.cos(pz * 2.1) + 0.08 * Math.cos(py * 3.5 + v);
      px *= noise;
      py *= noise * 0.92; // slightly flatten crown
      pz *= noise;

      pos.setXYZ(i, px + c.x, py + c.y, pz + c.z);

      // Darker underside and lighter top vertex color
      const worldY = py + c.y;
      const t = Math.max(0, Math.min(1, (worldY - canopyMinY) / (canopyMaxY - canopyMinY)));

      // Lerp from dark shadow green (0.12, 0.26, 0.08) -> mid green (0.24, 0.48, 0.14) -> bright crown green (0.42, 0.68, 0.20)
      let cr = 0.14 + t * 0.28;
      let cg = 0.28 + t * 0.40;
      let cb = 0.09 + t * 0.14;

      colors[i * 3] = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
    }

    sphere.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    sphere.computeVertexNormals();
    leafGeos.push(sphere);
  });

  const mergedLeaves = mergeBufferGeometriesSimple(leafGeos);
  return { branches: branchesGeo, leaves: mergedLeaves };
}

function mergeBufferGeometriesSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;
  geos.forEach(g => {
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : 0;
  });

  const pos = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const norm = new Float32Array(totalVerts * 3);
  const hasColor = geos.some(g => g.attributes.color);
  const col = hasColor ? new Float32Array(totalVerts * 3) : null;
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  let indexVertexOffset = 0;

  geos.forEach(g => {
    const p = g.attributes.position.array as Float32Array;
    pos.set(p, vOffset * 3);
    if (g.attributes.uv) {
      uv.set(g.attributes.uv.array as Float32Array, vOffset * 2);
    }
    if (g.attributes.normal) {
      norm.set(g.attributes.normal.array as Float32Array, vOffset * 3);
    }
    if (col && g.attributes.color) {
      col.set(g.attributes.color.array as Float32Array, vOffset * 3);
    } else if (col) {
      // Default color if missing
      for (let k = 0; k < g.attributes.position.count; k++) {
        col[(vOffset + k) * 3] = 0.28;
        col[(vOffset + k) * 3 + 1] = 0.52;
        col[(vOffset + k) * 3 + 2] = 0.16;
      }
    }

    if (g.index) {
      const idx = g.index.array;
      for (let j = 0; j < idx.length; j++) {
        indices[iOffset + j] = idx[j] + indexVertexOffset;
      }
      iOffset += idx.length;
    }
    indexVertexOffset += g.attributes.position.count;
    vOffset += g.attributes.position.count;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  if (col) {
    merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

