import { BIOME_COLORS } from './renderer.js';

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animFrameId = null;

// Mesh references
let terrainMesh = null;
let waterMesh = null;
let overlaysGroup = null;

// Light references for dynamic shadow toggles
let dirLight = null;
let ambientLight = null;

// Interaction and system helpers
let hoverHelper = null;
let raycaster = null;
let mouse = null;
let activeEventSpheres = [];

// Day/Night Cycle State
let dayNightEnabled = false;
let currentYear = 0;

// Camera Tween State
let activeCameraTween = null;


export function initRenderer3D(container) {
  if (renderer) destroyRenderer3D();
  
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  activeEventSpheres = [];
  
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#09090b');
  
  // Camera
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  
  // Orbit Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  
  // Lighting
  ambientLight = new THREE.AmbientLight('#ffffff', 0.55);
  scene.add(ambientLight);
  
  dirLight = new THREE.DirectionalLight('#fff9e6', 0.85);
  dirLight.position.set(-50, 80, -30);
  scene.add(dirLight);
  
  // Default Camera reset
  resetCamera(150); // Assumes grid scale of 150 by default
  
  // Animation Loop
  function animate() {
    animFrameId = requestAnimationFrame(animate);
    if (controls) controls.update();
    update3DHistoryEvents(0.016); // ~60fps delta
    updateDayNightCycle();
    if (typeof TWEEN !== 'undefined') TWEEN.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }
  animate();
}

export function destroyRenderer3D() {
  if (activeCameraTween) {
    activeCameraTween.stop();
    activeCameraTween = null;
  }
  
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  
  if (controls) {
    controls.dispose();
    controls = null;
  }
  
  if (renderer) {
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer.dispose();
    renderer = null;
  }
  
  // Traverse scene and dispose geometries/materials
  if (scene) {
    scene.traverse(object => {
      if (!object.isMesh) return;
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    scene = null;
  }
  
  camera = null;
  dirLight = null;
  ambientLight = null;
  raycaster = null;
  mouse = null;
  activeEventSpheres = [];
}

export function resizeRenderer3D(container) {
  if (!renderer || !camera) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

export function resetCamera(gridSize) {
  if (!camera || !controls) return;
  camera.position.set(-gridSize * 0.7, gridSize * 0.8, gridSize * 0.9);
  controls.target.set(0, 0, 0);
  controls.update();
}

const MAX_HEIGHT = 15; // Vertical exaggeration multiplier

export function renderWorld3D(grid, viewMode, enableShadows = false, enableDayNight = false) {
  if (!scene) return;
  
  dayNightEnabled = enableDayNight;
  currentYear = grid.historyYear || 0;
  
  // 1. Cleanup old terrain & water
  if (terrainMesh) {
    scene.remove(terrainMesh);
    terrainMesh.geometry.dispose();
    terrainMesh.material.dispose();
    terrainMesh = null;
  }
  if (waterMesh) {
    scene.remove(waterMesh);
    waterMesh.geometry.dispose();
    waterMesh.material.dispose();
    waterMesh = null;
  }
  
  const size = grid.length;
  const count = size * size;
  
  // Update shadow settings on renderer & lights
  if (renderer) {
    renderer.shadowMap.enabled = enableShadows;
    // THREE.PCFSoftShadowMap is configured in init
  }
  
  if (dirLight) {
    dirLight.castShadow = enableShadows;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = gridSizeToFarPlane(size);
    const d = size * 0.8;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
  }
  
  // 2. Create Box Geometry for Voxel Cubes
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  
  // Choose performance material based on shadow toggle
  const material = enableShadows 
    ? new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 })
    : new THREE.MeshLambertMaterial();
    
  terrainMesh = new THREE.InstancedMesh(geometry, material, count);
  terrainMesh.castShadow = enableShadows;
  terrainMesh.receiveShadow = enableShadows;
  
  // 3. Position and size each instance
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      const idx = y * size + x;
      
      // Position offsets from center
      const px = x - size / 2;
      const pz = y - size / 2;
      
      // Calculate vertical block height proportional to elevation
      const height = Math.max(0.1, cell.elevation * MAX_HEIGHT);
      const py = height / 2 - (MAX_HEIGHT / 2); // Grounded on bottom plane
      
      dummy.position.set(px, py, pz);
      dummy.scale.set(0.98, height, 0.98); // Slight gap to outline voxels
      dummy.updateMatrix();
      
      terrainMesh.setMatrixAt(idx, dummy.matrix);
      
      // Set instance color
      const colorHex = getCellColorHex(cell, viewMode);
      color.set(colorHex);
      terrainMesh.setColorAt(idx, color);
    }
  }
  
  terrainMesh.instanceColor.needsUpdate = true;
  scene.add(terrainMesh);
  
  // 4. Create Water Plane (Oceans)
  const waterGeom = new THREE.PlaneGeometry(size, size);
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#1b4965',
    transparent: true,
    opacity: 0.75,
    roughness: 0.15,
    metalness: 0.1
  });
  
  waterMesh = new THREE.Mesh(waterGeom, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  // Water height set at sea level E = 0.22
  waterMesh.position.y = (0.22 * MAX_HEIGHT) - (MAX_HEIGHT / 2);
  waterMesh.receiveShadow = enableShadows;
  scene.add(waterMesh);

  // 5. Draw Overlays Group (Cities, Dungeons, Roads, Resources)
  if (overlaysGroup) {
    scene.remove(overlaysGroup);
    disposeHierarchy(overlaysGroup);
  }
  overlaysGroup = new THREE.Group();
  scene.add(overlaysGroup);
  
  if (viewMode === 'biome') {
    const showCities = document.getElementById('show-cities-routes')?.checked ?? false;
    const showResources = document.getElementById('show-resources')?.checked ?? false;
    const showDungeons = document.getElementById('show-dungeons')?.checked ?? false;
    
    // Draw Roads & Trade Routes
    if (showCities && grid.routes) {
      draw3DRoads(grid, size, enableShadows);
    }
    
    // Draw Cities
    if (showCities && grid.cities) {
      draw3DCities(grid.cities, grid, size, enableShadows);
    }
    
    // Draw Dungeons
    if (showDungeons && grid.dungeons) {
      draw3DDungeons(grid.dungeons, grid, size, enableShadows);
    }
    
    // Draw Resources
    if (showResources) {
      draw3DResources(grid, size, enableShadows);
    }
  }
}

function disposeHierarchy(obj) {
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  });
}

function getCellHeightY(cell) {
  return Math.max(0.1, cell.elevation * MAX_HEIGHT) - (MAX_HEIGHT / 2);
}

function draw3DCities(cities, grid, size, enableShadows) {
  const KINGDOM_COLORS = ['#e63946', '#457b9d', '#8338ec', '#f4a261', '#2a9d8f'];
  
  cities.forEach(city => {
    const cell = grid[city.y][city.x];
    const px = city.x - size / 2;
    const pz = city.y - size / 2;
    const py = getCellHeightY(cell);
    
    const cityGroup = new THREE.Group();
    cityGroup.position.set(px, py, pz);
    
    if (city.isAbandoned) {
      // Ruins: 2 small flattened grey boxes at slight offsets
      const ruinsMat = new THREE.MeshLambertMaterial({ color: '#475569' });
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), ruinsMat);
      b1.position.set(-0.1, 0.1, -0.1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.35), ruinsMat);
      b2.position.set(0.15, 0.075, 0.15);
      b2.rotation.y = 0.4;
      cityGroup.add(b1, b2);
    } else if (city.type === 'capital') {
      // Capital Castle: Circular wall, 4 small towers, 1 keep
      const wallColor = '#a1a1aa';
      const roofColor = KINGDOM_COLORS[city.kingdomId % KINGDOM_COLORS.length] || '#e63946';
      
      const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
      const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
      
      // Castle Keep (center tower)
      const keep = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.35), wallMat);
      keep.position.y = 0.35;
      
      const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.4, 4), roofMat);
      keepRoof.position.y = 0.9;
      
      // Corner towers
      const towerGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 4);
      const towerRoofGeom = new THREE.ConeGeometry(0.12, 0.25, 4);
      const offsets = [
        [-0.22, -0.22], [0.22, -0.22],
        [-0.22, 0.22], [0.22, 0.22]
      ];
      
      cityGroup.add(keep, keepRoof);
      
      offsets.forEach(([ox, oz]) => {
        const tw = new THREE.Mesh(towerGeom, wallMat);
        tw.position.set(ox, 0.25, oz);
        const tr = new THREE.Mesh(towerRoofGeom, roofMat);
        tr.position.set(ox, 0.625, oz);
        cityGroup.add(tw, tr);
      });
      
      // Ring wall
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.22, 8, 1, true), wallMat);
      wall.position.y = 0.11;
      cityGroup.add(wall);
    } else if (city.type === 'city') {
      // City: Cluster of 3 houses
      const houseMat = new THREE.MeshLambertMaterial({ color: '#f59e0b' });
      const roofMat = new THREE.MeshLambertMaterial({ color: '#9a3412' });
      
      const createHouse = (hSize, hHeight, hx, hz, rot) => {
        const body = new THREE.Mesh(new THREE.BoxGeometry(hSize, hHeight, hSize), houseMat);
        body.position.set(hx, hHeight / 2, hz);
        body.rotation.y = rot;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(hSize * 0.75, hHeight * 0.5, 4), roofMat);
        roof.position.set(hx, hHeight + (hHeight * 0.25), hz);
        roof.rotation.y = rot + Math.PI / 4;
        cityGroup.add(body, roof);
      };
      
      createHouse(0.24, 0.45, -0.12, -0.12, 0.1);
      createHouse(0.20, 0.35, 0.12, -0.08, -0.3);
      createHouse(0.18, 0.30, 0.0, 0.14, 0.5);
    } else {
      // Town/Vila: 1 house
      const houseMat = new THREE.MeshLambertMaterial({ color: '#eab308' });
      const roofMat = new THREE.MeshLambertMaterial({ color: '#7c2d12' });
      
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.35, 0.24), houseMat);
      body.position.y = 0.175;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.22, 4), roofMat);
      roof.position.y = 0.46;
      roof.rotation.y = Math.PI / 4;
      cityGroup.add(body, roof);
    }
    
    cityGroup.traverse(child => {
      if (child.isMesh) {
        child.castShadow = enableShadows;
        child.receiveShadow = enableShadows;
      }
    });
    
    const modelScale = Math.max(1.0, size / 80);
    cityGroup.scale.set(modelScale, modelScale, modelScale);
    
    overlaysGroup.add(cityGroup);
  });
}

function draw3DDungeons(dungeons, grid, size, enableShadows) {
  const dungMat = new THREE.MeshStandardMaterial({
    color: '#27272a',
    roughness: 0.95,
    metalness: 0.1
  });
  
  dungeons.forEach(dung => {
    const cell = grid[dung.y][dung.x];
    const px = dung.x - size / 2;
    const pz = dung.y - size / 2;
    const py = getCellHeightY(cell);
    
    const dungGroup = new THREE.Group();
    dungGroup.position.set(px, py, pz);
    
    // Main broken tower
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.7, 6), dungMat);
    tower.position.y = 0.35;
    
    // Glowing red portal cube
    const portalMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
    const portal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.1), portalMat);
    portal.position.set(0, 0.075, 0.2); // Front of the tower
    
    dungGroup.add(tower, portal);
    
    dungGroup.traverse(child => {
      if (child.isMesh) {
        child.castShadow = enableShadows;
        child.receiveShadow = enableShadows;
      }
    });
    
    const modelScale = Math.max(1.0, size / 80);
    dungGroup.scale.set(modelScale, modelScale, modelScale);
    
    overlaysGroup.add(dungGroup);
  });
}

function draw3DRoads(grid, size, enableShadows) {
  const roadMat = new THREE.MeshBasicMaterial({
    color: '#4a3728',
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -4.0
  });
  const tradeMat = new THREE.MeshBasicMaterial({
    color: '#eab308',
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -4.0
  });
  
  const normalGeoms = [];
  const tradeGeoms = [];
  
  const dummy = new THREE.Object3D();
  
  grid.routes.forEach(route => {
    const width = route.isTradeRoute ? 0.22 : 0.14;
    const targetGeoms = route.isTradeRoute ? tradeGeoms : normalGeoms;
    
    for (let i = 0; i < route.path.length - 1; i++) {
      const p1 = route.path[i];
      const p2 = route.path[i + 1];
      
      const cell1 = grid[p1.y][p1.x];
      const cell2 = grid[p2.y][p2.x];
      
      const x1 = p1.x - size / 2;
      const z1 = p1.y - size / 2;
      const y1 = getCellHeightY(cell1) + 0.501; // Slightly offset above voxel top
      
      const x2 = p2.x - size / 2;
      const z2 = p2.y - size / 2;
      const y2 = getCellHeightY(cell2) + 0.501;
      
      // Construct linear quad planes between step nodes
      const dx = x2 - x1;
      const dz = z2 - z1;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      
      const planeGeom = new THREE.PlaneGeometry(dist, width);
      
      dummy.position.set(x1 + dx/2, (y1 + y2)/2, z1 + dz/2);
      dummy.rotation.set(-Math.PI / 2, 0, -angle);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      
      planeGeom.applyMatrix4(dummy.matrix);
      targetGeoms.push(planeGeom);
    }
  });
  
  // Merge and draw normal roads
  if (normalGeoms.length > 0) {
    const mergedNormalGeom = THREE.BufferGeometryUtils.mergeBufferGeometries(normalGeoms);
    const roadMesh = new THREE.Mesh(mergedNormalGeom, roadMat);
    roadMesh.name = 'roadMesh';
    overlaysGroup.add(roadMesh);
  }
  
  // Merge and draw trade routes
  if (tradeGeoms.length > 0) {
    const mergedTradeGeom = THREE.BufferGeometryUtils.mergeBufferGeometries(tradeGeoms);
    const tradeRoadMesh = new THREE.Mesh(mergedTradeGeom, tradeMat);
    tradeRoadMesh.name = 'tradeRoadMesh';
    overlaysGroup.add(tradeRoadMesh);
  }
}

function draw3DResources(grid, size, enableShadows) {
  const resourceColors = { ore: '#a9a9a9', fish: '#90e0ef', stone: '#d3d3d3', crops: '#ffd166' };
  const modelScale = Math.max(1.0, size / 80);
  const geom = new THREE.SphereGeometry(0.08 * modelScale, 4, 4);
  
  // Non-wood resources rendered as standard sphere markers
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      if (cell.resource && cell.resource !== 'wood' && cell.resourceDensity > 0.6) {
        const colorHex = resourceColors[cell.resource] || '#ffffff';
        const mat = new THREE.MeshBasicMaterial({ color: colorHex });
        const mesh = new THREE.Mesh(geom, mat);
        
        const px = x - size / 2;
        const pz = y - size / 2;
        const py = getCellHeightY(cell) + 0.55;
        mesh.position.set(px, py, pz);
        overlaysGroup.add(mesh);
      }
    }
  }
  
  // Build Instanced Forest for Wood resource
  build3DForest(grid, size, enableShadows);
}

function build3DForest(grid, size, enableShadows) {
  const forestPositions = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      if (cell.resource === 'wood' && cell.resourceDensity > 0.6) {
        forestPositions.push({ x, y, cell });
      }
    }
  }
  
  if (forestPositions.length === 0) return;
  
  // Combine cylinder and cone into one BufferGeometry
  const trunkGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.24, 4);
  trunkGeom.translate(0, 0.12, 0); // Grounded
  
  const leavesGeom = new THREE.ConeGeometry(0.12, 0.32, 4);
  leavesGeom.translate(0, 0.36, 0); // Positioned above trunk
  
  const treeGeom = THREE.BufferGeometryUtils.mergeBufferGeometries([trunkGeom, leavesGeom]);
  const treeMat = new THREE.MeshLambertMaterial({ color: '#2d6a4f' });
  
  const forestMesh = new THREE.InstancedMesh(treeGeom, treeMat, forestPositions.length);
  forestMesh.name = 'forestMesh';
  forestMesh.castShadow = enableShadows;
  forestMesh.receiveShadow = enableShadows;
  
  const dummy = new THREE.Object3D();
  
  forestPositions.forEach((pos, idx) => {
    const px = pos.x - size / 2;
    const pz = pos.y - size / 2;
    const py = getCellHeightY(pos.cell) + 0.5; // Top of the voxel
    
    // Add slightly randomized scaling for organic feel
    const modelScale = Math.max(1.0, size / 80);
    const randomScale = (0.85 + Math.random() * 0.3) * modelScale;
    
    dummy.position.set(px, py, pz);
    dummy.scale.set(randomScale, randomScale, randomScale);
    dummy.updateMatrix();
    
    forestMesh.setMatrixAt(idx, dummy.matrix);
  });
  
  forestMesh.instanceMatrix.needsUpdate = true;
  overlaysGroup.add(forestMesh);
}


function rgbToHex(r, g, b) {
  const clamp = v => Math.max(0, Math.min(255, Math.floor(v)));
  const rh = clamp(r).toString(16).padStart(2, '0');
  const gh = clamp(g).toString(16).padStart(2, '0');
  const bh = clamp(b).toString(16).padStart(2, '0');
  return `#${rh}${gh}${bh}`;
}

function getCellColorHex(cell, viewMode) {
  if (viewMode === 'biome') {
    return BIOME_COLORS[cell.biome] || '#000000';
  } else if (viewMode === 'elevation') {
    const val = Math.max(0, Math.min(1, cell.elevation));
    const rgbHex = Math.floor(val * 255).toString(16).padStart(2, '0');
    return `#${rgbHex}${rgbHex}${rgbHex}`;
  } else if (viewMode === 'moisture') {
    const r = 244 + (33 - 244) * cell.moisture;
    const g = 210 + (100 - 210) * cell.moisture;
    const b = 150 + (243 - 150) * cell.moisture;
    return rgbToHex(r, g, b);
  } else if (viewMode === 'temperature') {
    const r = 33 + (230 - 33) * cell.temperature;
    const g = 150 + (57 - 150) * cell.temperature;
    const b = 243 + (70 - 243) * cell.temperature;
    return rgbToHex(r, g, b);
  }
  return '#000000';
}

function gridSizeToFarPlane(size) {
  return size * 3;
}



export function check3DIntersection(clientX, clientY, container, grid) {
  if (!renderer || !camera || !terrainMesh || !raycaster || !mouse) return null;
  
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(terrainMesh);
  
  if (intersects.length > 0) {
    const intersect = intersects[0];
    const instanceId = intersect.instanceId;
    const size = grid.length;
    
    const x = instanceId % size;
    const y = Math.floor(instanceId / size);
    
    // Update Selection Wireframe Helper
    if (hoverHelper) scene.remove(hoverHelper);
    
    const boxGeom = new THREE.BoxGeometry(1.02, Math.max(0.1, grid[y][x].elevation * MAX_HEIGHT) + 0.02, 1.02);
    const wireMat = new THREE.MeshBasicMaterial({
      color: '#ffd166',
      wireframe: true,
      transparent: true,
      opacity: 0.75
    });
    hoverHelper = new THREE.Mesh(boxGeom, wireMat);
    
    const px = x - size / 2;
    const pz = y - size / 2;
    const py = getCellHeightY(grid[y][x]);
    hoverHelper.position.set(px, py, pz);
    scene.add(hoverHelper);
    
    return grid[y][x];
  }
  
  if (hoverHelper) {
    scene.remove(hoverHelper);
    hoverHelper = null;
  }
  return null;
}

export function clear3DHighlight() {
  if (hoverHelper) {
    scene.remove(hoverHelper);
    hoverHelper = null;
  }
}

export function spawn3DHistoryEvent(x, y, grid, type, age = 10.0) {
  if (!scene) return;
  const size = grid.length;
  const px = x - size / 2;
  const pz = y - size / 2;
  const py = getCellHeightY(grid[y][x]) + 0.6;
  
  const geom = new THREE.SphereGeometry(0.3, 8, 8);
  let colorHex = '#94a3b8';
  if (type === 'war-msg') colorHex = '#ef4444';
  else if (type === 'trade-msg') colorHex = '#eab308';
  else if (type === 'growth-msg') colorHex = '#22c55e';
  
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.65
  });
  
  const sphere = new THREE.Mesh(geom, mat);
  sphere.position.set(px, py, pz);
  scene.add(sphere);
  
  activeEventSpheres.push({
    mesh: sphere,
    maxAge: age,
    currentAge: age,
    startY: py
  });
}

export function update3DHistoryEvents(dt = 0.1) {
  if (!scene || activeEventSpheres.length === 0) return;
  for (let i = activeEventSpheres.length - 1; i >= 0; i--) {
    const evt = activeEventSpheres[i];
    evt.currentAge -= dt * 10;
    
    if (evt.currentAge <= 0) {
      scene.remove(evt.mesh);
      evt.mesh.geometry.dispose();
      evt.mesh.material.dispose();
      activeEventSpheres.splice(i, 1);
    } else {
      const ratio = evt.currentAge / evt.maxAge;
      evt.mesh.material.opacity = 0.65 * ratio;
      evt.mesh.scale.setScalar(1.0 + (1.0 - ratio) * 1.5);
      evt.mesh.position.y = evt.startY + (1.0 - ratio) * 1.8;
    }
  }
}

function updateDayNightCycle() {
  if (!dirLight || !ambientLight) return;
  
  if (!dayNightEnabled) {
    // Reset to static noon
    dirLight.position.set(-50, 80, -30);
    dirLight.intensity = 0.85;
    dirLight.color.set(new THREE.Color('#fff9e6'));
    ambientLight.color.set(new THREE.Color('#ffffff'));
    ambientLight.intensity = 0.55;
    return;
  }
  
  // Angle calculated from year: 1 year = ~0.2 radians
  const theta = currentYear * 0.2;
  const px = Math.cos(theta) * 120;
  const py = Math.sin(theta) * 120;
  const pz = Math.sin(theta * 0.5) * 60;
  
  dirLight.position.set(px, py, pz);
  
  if (py >= 5) {
    // Daytime
    dirLight.castShadow = true;
    const ratio = Math.min(1.0, py / 80);
    dirLight.intensity = 0.85 * ratio;
    
    // Interpolate colors: warm orange to bright yellow
    dirLight.color.lerpColors(new THREE.Color('#ff8c00'), new THREE.Color('#fff9e6'), ratio);
    ambientLight.color.lerpColors(new THREE.Color('#415a77'), new THREE.Color('#ffffff'), ratio);
    ambientLight.intensity = 0.2 + 0.35 * ratio;
  } else if (py < 5 && py >= -15) {
    // Sunset/Sunrise
    const ratio = Math.max(0.0, (py + 15) / 20);
    dirLight.intensity = 0.25 * ratio;
    dirLight.color.set(new THREE.Color('#e25822'));
    ambientLight.color.lerpColors(new THREE.Color('#0f172a'), new THREE.Color('#415a77'), ratio);
    ambientLight.intensity = 0.15 + 0.05 * ratio;
  } else {
    // Night
    dirLight.castShadow = false;
    dirLight.intensity = 0;
    ambientLight.color.set(new THREE.Color('#0f172a'));
    ambientLight.intensity = 0.15;
  }
}

export function easeToCell(x, y, grid) {
  if (!camera || !controls || typeof TWEEN === 'undefined') return;
  
  if (activeCameraTween) {
    activeCameraTween.stop();
  }
  
  const size = grid.length;
  const tx = x - size / 2;
  const tz = y - size / 2;
  const ty = getCellHeightY(grid[y][x]);
  
  // Starting parameters
  const startPos = {
    cx: camera.position.x,
    cy: camera.position.y,
    cz: camera.position.z,
    tx: controls.target.x,
    ty: controls.target.y,
    tz: controls.target.z
  };
  
  // Target parameters
  const endPos = {
    cx: tx - 25,
    cy: ty + 30,
    cz: tz + 35,
    tx: tx,
    ty: ty,
    tz: tz
  };
  
  activeCameraTween = new TWEEN.Tween(startPos)
    .to(endPos, 1200)
    .easing(TWEEN.Easing.Cubic.Out)
    .onUpdate(() => {
      camera.position.set(startPos.cx, startPos.cy, startPos.cz);
      controls.target.set(startPos.tx, startPos.ty, startPos.tz);
      controls.update();
    })
    .onComplete(() => {
      activeCameraTween = null;
    })
    .start();
}



