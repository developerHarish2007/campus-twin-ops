# Asset credits

All third-party visual assets are kept under `public/assets/` and their source and licence are recorded here.

## 1. PBR Textures & Environments

| Local file | Asset | Source | Licence |
| --- | --- | --- | --- |
| `public/assets/hdri/autumn_field_puresky_2k.hdr` | Autumn Field (Pure Sky), 2K HDRI | [Poly Haven asset page](https://polyhaven.com/a/autumn_field_puresky) · [download](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/autumn_field_puresky_2k.hdr) | CC0, per [Poly Haven licence](https://polyhaven.com/license) |
| `public/assets/textures/asphalt_03/*_1k.jpg` | Asphalt 03 PBR maps (diffuse, normal GL, roughness, AO) used for campus and surrounding road network | [Poly Haven asset page](https://polyhaven.com/a/asphalt_03) | CC0 |
| `public/assets/textures/concrete/*_1k.jpg` | Concrete PBR maps used for 3D raised road kerbs | [Poly Haven asset page](https://polyhaven.com/a/concrete) | CC0 |
| `public/assets/textures/concrete_floor/*_1k.jpg` | Concrete Floor PBR maps used for pedestrian sidewalks and paved campus plaza | [Poly Haven asset page](https://polyhaven.com/a/concrete_floor) | CC0 |
| `public/assets/textures/Grass005/Grass005_1K-JPG_{Color,NormalGL,Roughness,AmbientOcclusion}.jpg` | Grass 005 green lawn PBR maps with 10m world-scale UV tiling | [ambientCG asset page](https://ambientcg.com/a/Grass005) | CC0, per [ambientCG licence](https://ambientcg.com/license) |
| `public/assets/textures/sparse_grass/*_1k.jpg` | Sparse Grass PBR maps blended via 2D Perlin noise to break repetitive tiling | [Poly Haven asset page](https://polyhaven.com/a/sparse_grass) | CC0 |
| `public/assets/textures/grass_ground/*_1k.jpg` | Grass Ground PBR maps | [Poly Haven asset page](https://polyhaven.com/a/grass_ground) | CC0 |
| `public/assets/textures/forest_ground_04/*_1k.jpg` | Forest Ground 04 PBR maps | [Poly Haven asset page](https://polyhaven.com/a/forest_ground_04) | CC0 |
| `public/assets/textures/bark_brown_01/*_1k.jpg` | Bark Brown 01 PBR maps used for tree trunks | [Poly Haven asset page](https://polyhaven.com/a/bark_brown_01) | CC0 |
| `public/assets/textures/white_stucco_02/white_stucco_02_diff_1k.jpg` | White Stucco 02 diffuse map used on building facades and boundary walls | [Poly Haven asset page](https://polyhaven.com/a/white_stucco_02) | CC0 |
| `public/assets/textures/grass_path_2/*_1k.jpg` | Grass Path 2 PBR maps (downloaded, evaluation cache) | [Poly Haven asset page](https://polyhaven.com/a/grass_path_2) | CC0 |
| `public/assets/textures/grass_path_3/grass_path_3_diff_1k.jpg` | Grass Path 3 diffuse map (downloaded, evaluation cache) | [Poly Haven asset page](https://polyhaven.com/a/grass_path_3) | CC0 |
| `public/assets/textures/leafy_grass/*_1k.jpg` | Leafy Grass PBR maps (downloaded, evaluation cache) | [Poly Haven asset page](https://polyhaven.com/a/leafy_grass) | CC0 |

## 2. Procedural Generators

| Asset / Generator | Implementation | Source | Licence |
| --- | --- | --- | --- |
| Procedural Tree Geometry (EZ-Tree) | 4 broadleaf variants (Oak Medium, Oak Large, Oak Small, Ash Medium) with lush leaf cards matching tree_test_ground.png, bark PBR normal/roughness/AO | [GitHub project](https://github.com/dgreenheck/ez-tree) (`@dgreenheck/ez-tree`) | MIT code licence; bundled leaf textures under MIT |
| Procedural Noise Texture Generator | Seamless 256×256 multi-octave 2D Perlin noise canvas texture (`createSmoothNoiseTexture`) used for macro terrain blending | Custom implementation in `src/views/CampusWorld.tsx` | Project license |

## 3. Map Data & Geometries

| Data | Source | Licence |
| --- | --- | --- |
| Campus Building Footprints & Roads | OpenStreetMap (`osm-campus.json`, `osm-surroundings.json`) | [OpenStreetMap Contributors](https://www.openstreetmap.org/copyright) | Open Database License (ODbL) |

## 4. Facade Photography & Tooling

| File | Description | Licence |
| --- | --- | --- |
| `public/textures/building-pg/front.jpg` | Front facade photograph for PG Block with architectural lettering | Project asset |
| `public/data/facade-adjustments.json` | Per-building facade texture scale, offset, and active edge index configuration | Project asset |
| `public/textures/README.md` | Instructions for taking and importing custom user photos per building ID | Project documentation |

## 5. Classroom Interior Procedural Textures & Assets

| Asset / Generator | Description | Source / Implementation | Licence |
| --- | --- | --- | --- |
| Vitrified Floor Tile Texture (`getTileTexture`) | 1024×1024 600×600 mm procedural vitrified ceramic tile canvas texture with mottled stone speckles and recessed grout | Custom procedural generator in `src/views/classroom/classroomTextures.ts` | CC0 / Project license |
| Wall Dado-Band Texture (`getWallTexture`) | 1024×1024 procedural plastered wall with matte warm off-white upper wall and 1.1m sage-olive institutional dado band | Custom procedural generator in `src/views/classroom/classroomTextures.ts` | CC0 / Project license |
| Melamine Whiteboard Texture (`getWhiteboardTexture`) | 1024×512 white melamine board with erased marker residue, course notes, and ALU state diagram | Custom procedural generator in `src/views/classroom/classroomTextures.ts` | CC0 / Project license |
| Green Felt Notice Board Texture (`getNoticeBoardTexture`) | 1024×768 felt notice board with pinned academic schedule and class timetable | Custom procedural generator in `src/views/classroom/classroomTextures.ts` | CC0 / Project license |
| Wood Laminate Texture (`getWoodTexture`) | 512×512 natural teak/sheesham wood grain canvas texture used for desks and podium | Custom procedural generator in `src/views/classroom/classroomTextures.ts` | CC0 / Project license |
| Smart Lab Equipment Models | Custom geometric models for ceiling digital projector, wall split AC, outdoor condenser, and 55" LED TV | Procedural Three.js geometries in `src/views/classroom/ClassroomDiorama.tsx` | Project license |

