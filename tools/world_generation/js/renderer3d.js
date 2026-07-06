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
    if (renderer && scene && camera) renderer.render(scene, camera);
  }
  animate();
}

export function destroyRenderer3D() {
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

export function renderWorld3D(grid, viewMode, enableShadows = false) {
  if (!scene) return;
  
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
      draw3DResources(grid, size);
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
  const capitalGeom = new THREE.CylinderGeometry(0, 0.45, 0.9, 5);
  const cityGeom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const townGeom = new THREE.ConeGeometry(0.35, 0.5, 4);
  const ruinsGeom = new THREE.BoxGeometry(0.5, 0.3, 0.5); // Abandoned cities
  
  const KINGDOM_COLORS = ['#e63946', '#457b9d', '#8338ec', '#f4a261', '#2a9d8f'];
  
  cities.forEach(city => {
    const cell = grid[city.y][city.x];
    const py = getCellHeightY(cell) + (city.isAbandoned ? 0.15 : city.type === 'capital' ? 0.45 : city.type === 'city' ? 0.3 : 0.25);
    const px = city.x - size / 2;
    const pz = city.y - size / 2;
    
    let geom = townGeom;
    let colorHex = '#eab308';
    
    if (city.isAbandoned) {
      geom = ruinsGeom;
      colorHex = '#475569';
    } else if (city.type === 'capital') {
      geom = capitalGeom;
      const kId = city.kingdomId;
      colorHex = (kId !== undefined && kId !== null && !isNaN(kId))
        ? KINGDOM_COLORS[kId % KINGDOM_COLORS.length]
        : '#e63946';
    } else if (city.type === 'city') {
      geom = cityGeom;
      colorHex = '#f59e0b';
    }
    
    const mat = new THREE.MeshLambertMaterial({ color: colorHex || '#eab308' });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(px, py, pz);
    mesh.castShadow = enableShadows;
    mesh.receiveShadow = enableShadows;
    overlaysGroup.add(mesh);
  });
}

function draw3DDungeons(dungeons, grid, size, enableShadows) {
  const dungGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.7, 6);
  const dungMat = new THREE.MeshStandardMaterial({
    color: '#374151',
    roughness: 0.9,
    emissive: '#ef4444',
    emissiveIntensity: 0.3
  });
  
  dungeons.forEach(dung => {
    const cell = grid[dung.y][dung.x];
    const py = getCellHeightY(cell) + 0.35;
    const px = dung.x - size / 2;
    const pz = dung.y - size / 2;
    
    const mesh = new THREE.Mesh(dungGeom, dungMat);
    mesh.position.set(px, py, pz);
    mesh.castShadow = enableShadows;
    mesh.receiveShadow = enableShadows;
    overlaysGroup.add(mesh);
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
  
  grid.routes.forEach(route => {
    const mat = route.isTradeRoute ? tradeMat : roadMat;
    const width = route.isTradeRoute ? 0.22 : 0.14;
    
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
      const plane = new THREE.Mesh(planeGeom, mat);
      
      plane.position.set(x1 + dx/2, (y1 + y2)/2, z1 + dz/2);
      plane.rotation.x = -Math.PI / 2;
      plane.rotation.z = -angle;
      
      overlaysGroup.add(plane);
    }
  });
}

function draw3DResources(grid, size) {
  const resourceColors = { wood: '#2d6a4f', ore: '#a9a9a9', fish: '#90e0ef', stone: '#d3d3d3', crops: '#ffd166' };
  const geom = new THREE.SphereGeometry(0.12, 4, 4);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      if (cell.resource && cell.resourceDensity > 0.6) {
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


