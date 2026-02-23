import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/utils/BufferGeometryUtils.js";

const firebaseConfig = {
  apiKey: "AIzaSyBTBaxhkkzjmdJhe3_D4Q_vb05Y_bzzgbs",
  authDomain: "the-construction-site.firebaseapp.com",
  projectId: "the-construction-site",
  storageBucket: "the-construction-site.firebasestorage.app",
  messagingSenderId: "876100787591",
  appId: "1:876100787591:web:0ab1d8b97a6a2b552c8722"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const ideaId = params.get("ideaId");

if (!ideaId) {
  alert("No idea selected");
  window.location.href = "../index.html";
}

let saveTimeout = null;

function scheduleSave(delay = 800) {
  if (isRestoring || isSaving) return;

  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = setTimeout(async () => {
    if (isSaving) return;
    isSaving = true;

    try {
      await autoSave();
      await saveMeta();
    } finally {
      isSaving = false;
    }
  }, delay);
}

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

async function loadIdea() {
  isRestoring = true;

  const snap = await getDocs(
    collection(db, "ideas", ideaId, "objects")
  );

  snap.forEach(docSnap => {
    placeFromData(docSnap.data());
  });

  // ⏸ wait one frame to let scene settle
  await new Promise(r => setTimeout(r, 0));

  isRestoring = false;
}

async function autoSave() {
  const batch = writeBatch(db);
  const collectionRef = collection(db, "ideas", ideaId, "objects");

  buildables.forEach(obj => {
    if (!obj?.userData?.type) return;
    if (!obj.parent) return;
    if (obj === ground || obj === previewBlock) return;

    const ref = doc(collectionRef, obj.uuid);

    batch.set(ref, {
      type: obj.userData.type,
      variant: obj.userData.variant ?? null,
      style: obj.userData.style ?? null,
      primaryColor: obj.userData.primaryColor ?? null,
      secondaryColor: obj.userData.secondaryColor ?? null,
      position: {
        x: obj.position.x,
        y: obj.position.y,
        z: obj.position.z
      },
      rotation: obj.rotation.y ?? 0
    });
  });

  deletedIds.forEach(id => {
    batch.delete(doc(collectionRef, id));
  });

  deletedIds.clear();

  await batch.commit();
}

async function saveMeta() {
  await setDoc(
    doc(db, "ideas", ideaId),
    { currentStory },
    { merge: true }
  );
}

function rotationToDeg(rad = 0) {
  return ((Math.round((rad * 180) / Math.PI) % 360) + 360) % 360;
}

function deleteBuildable(obj) {
  if (!obj) return;

  deletedIds.add(obj.uuid);

  scene.remove(obj);

  obj.traverse?.(child => {
    child.geometry?.dispose();
    if (child.material) {
      Array.isArray(child.material)
        ? child.material.forEach(m => m.dispose())
        : child.material.dispose();
    }
  });

  const index = buildables.indexOf(obj);
  if (index !== -1) buildables.splice(index, 1);
}

function normalizeColor(c, fallback = "#cccccc") {
  if (!c) return fallback;
  if (typeof c === "string") return c;
  if (typeof c === "number") return `#${c.toString(16).padStart(6, "0")}`;
  return fallback;
}

const textureLoader = new THREE.TextureLoader();
const woodPlankTexture = textureLoader.load("woodplank.png.jpg");
woodPlankTexture.wrapS = woodPlankTexture.wrapT = THREE.RepeatWrapping;
woodPlankTexture.repeat.set(1, 1);
const woodStairMaterial = new THREE.MeshStandardMaterial({
  map: woodPlankTexture
});

const woodWallTexture = new THREE.TextureLoader().load("woodwall.png");

woodWallTexture.wrapS = THREE.RepeatWrapping;
woodWallTexture.wrapT = THREE.RepeatWrapping;

// ---------- HARD BLOCK ORBIT CONTROLS FROM UI ----------
window.addEventListener("DOMContentLoaded", () => {
  const toolbar = document.getElementById("right-toolbar");
  if (!toolbar) return;

  ["pointerdown", "pointermove", "pointerup", "wheel"].forEach(type => {
    toolbar.addEventListener(type, e => {
      e.stopPropagation();
    }, { passive: false });
  });
});

window.addEventListener("DOMContentLoaded", () => {
  const blueprintBtn = document.getElementById("open-blueprints");
  if (!blueprintBtn) return;

  // HARD BLOCK pointer events (same as toolbar)
  ["pointerdown", "pointermove", "pointerup", "wheel"].forEach(type => {
    blueprintBtn.addEventListener(type, e => {
      e.stopPropagation();
    }, { passive: false });
  });

  // Explicit click logic
  blueprintBtn.addEventListener("click", () => {
    exportBlueprintData();
    window.open("../Blueprint/blueprint.html", "_blank");
  });
});

//---------- GLOBALS ----------
const buildables = [];
window.buildables = buildables;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pointerDown = false;
let pointerMoved = false;
let downX = 0;
let downY = 0;
let ceilingHeightOffset = 0; // in meters
let roofHeightOffset = 0;    // in meters
let verticalPlacementOffset = 0; // meters
verticalPlacementOffset = Math.max(0, verticalPlacementOffset);
let primaryColor = "#cccccc";
let secondaryColor = "#888888";
let isRestoring = false;
let isSaving = false;
let isDraggingCamera = false;
const deletedIds = new Set();

function safeColor(c, fallback = 0xffffff) {
  return (c !== undefined && c !== null) ? c : fallback;
}

function isUIInteraction(event) {
  return event.target.closest("#right-toolbar") ||
         event.target.closest("#color-drawer") ||
         event.target.closest("#toolbar");
}

//---------- REUSABLETHUMBNAIL RENDERER ----------
const thumbRenderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
thumbRenderer.setSize(64, 64);

// ---------- UI INTERACTION CHECK ----------
function isMouseOverUI(event) {
  return (
    event.target.closest("#right-toolbar") ||
    event.target.closest("#toolbar") ||          // ✅ TOP TOOLBAR
    event.target.closest("#color-drawer") ||
    event.target.closest("#drawer-toggle")
  );
}

// ---------- STAIR GEOMETRY ----------
function createStairsGeometry() {
  const group = new THREE.Group();

  const STEPS = 3;
  const STEP_HEIGHT = 1 / STEPS;
  const STEP_DEPTH = 1 / STEPS;

  for (let i = 0; i < STEPS; i++) {
    const geo = new THREE.BoxGeometry(
      1,
      STEP_HEIGHT,
      STEP_DEPTH
    );

    const mesh = new THREE.Mesh(geo);

    mesh.position.y = STEP_HEIGHT / 2 + i * STEP_HEIGHT;
    mesh.position.z = -0.5 + STEP_DEPTH / 2 + i * STEP_DEPTH;

    group.add(mesh);
  }

  return group;
}

// ---- BRICK TREAD CONSTANTS ----
const BRICK_TREAD_HEIGHT = 0.1;
const BRICK_MORTAR_HEIGHT = 0.025;
const BRICK_UNIT_HEIGHT = 0.05;

// ---------- BRICK TREAD GEOMETRY ----------
function createBrickTread(width, depth) {
  const group = new THREE.Group();

  const safeBrickColor = 0x888888;
  const safeMortarColor = 0xaaaaaa;

  // ---- MORTAR BASE ----
  const mortarGeo = new THREE.BoxGeometry(
    width,
    BRICK_MORTAR_HEIGHT,
    depth
  );

  const mortarMat = new THREE.MeshStandardMaterial();
  const mortar = new THREE.Mesh(mortarGeo, mortarMat);
  mortar.userData.isSecondary = true;
  mortar.position.y = -BRICK_TREAD_HEIGHT / 2 + BRICK_MORTAR_HEIGHT / 2;
  group.add(mortar);

  // ---- BRICK SETTINGS (SCALED TO STEP) ----
  const gap = 0.025;

  const bricksPerUnitX = 2;
  const bricksPerUnitZ = 2;

  const pitchX = width / bricksPerUnitX;
  const pitchZ = depth / bricksPerUnitZ;

  const bw = pitchX - gap;
  const bd = pitchZ - gap;

  const brickMat = new THREE.MeshStandardMaterial({
  });

  // ---- BRICK LOOP ----
  for (let z = 0; z < bricksPerUnitZ; z++) {

    const isStaggered = z % 2 === 1;

    const rowZ = -depth / 2 + z * pitchZ + pitchZ / 2;

    if (isStaggered) {
      const halfBrick = new THREE.Mesh(
       new THREE.BoxGeometry(
  bw / 2,
  BRICK_UNIT_HEIGHT,
  bd - gap * 0.6
),
        brickMat
      );

      halfBrick.position.set(
        -width / 2 + bw / 4,
        -BRICK_TREAD_HEIGHT / 2 + BRICK_MORTAR_HEIGHT + BRICK_UNIT_HEIGHT / 2,
        rowZ
      );

      group.add(halfBrick);
    }

    const fullBrickCount = isStaggered
      ? bricksPerUnitX - 1
      : bricksPerUnitX;

    for (let x = 0; x < fullBrickCount; x++) {

      const brick = new THREE.Mesh(
        new THREE.BoxGeometry(
          bw - gap * 0.6,
          BRICK_UNIT_HEIGHT,
          bd - gap * 0.6
        ),
        brickMat
      );

      const startX = isStaggered
        ? -width / 2 + bw / 2
        : -width / 2;

      brick.position.set(
        startX + x * pitchX + pitchX / 2,
        -BRICK_TREAD_HEIGHT / 2 + BRICK_MORTAR_HEIGHT + BRICK_UNIT_HEIGHT / 2,
        rowZ
      );

      group.add(brick);
    }

    if (isStaggered) {
      const halfBrick = new THREE.Mesh(
        new THREE.BoxGeometry(
  bw / 2,
  BRICK_UNIT_HEIGHT,
  bd - gap * 0.6
),
        brickMat
      );

      halfBrick.position.set(
        width / 2 - bw / 4,
        -BRICK_TREAD_HEIGHT / 2 + BRICK_MORTAR_HEIGHT + BRICK_UNIT_HEIGHT / 2,
        rowZ
      );

      group.add(halfBrick);
    }
  }

  return group;
}

// Create stair mesh based on variant configuration
function createStairMesh(variantKey, material, styleKey = "default") {
  const cfg = components.stairs.variants[variantKey];
  const group = new THREE.Group();
  const totalBlocks = cfg.blocks;
  const storyRise = cfg.blocks === 1 ? 1 : STORY_HEIGHT;
  const risePerBlock = storyRise / totalBlocks;
  const stepsPerBlock = 3;

  for (let b = 0; b < totalBlocks; b++) {
    for (let i = 0; i < stepsPerBlock; i++) {
      const stepHeight = risePerBlock / stepsPerBlock;
      const stepDepth = 1 / stepsPerBlock;

const height = cfg.solid
  ? stepHeight * (i + 1)
  : stepHeight * 0.25;

const stairStyle = components.stairs.styles[styleKey];
const treadHeight =
  stairStyle?.type === "woodTread" || stairStyle?.type === "brickTread"
    ? stairStyle.treadHeight
    : 0;

const finalMaterial =
  stairStyle?.type === "glass"
    ? glassMaterial.clone()
    : material;

const yPos = cfg.solid
  ? b * risePerBlock + height / 2
  : b * risePerBlock + stepHeight * i + height / 2;

const zPos =
  b + i * stepDepth + stepDepth / 2 - (cfg.blocks / 2);

// WOOD TREAD SPLIT
if (
  (stairStyle?.type === "woodTread" || stairStyle?.type === "brickTread") &&
  height > treadHeight
) {

  // LOWER WHITE BODY
  const bodyHeight = height - treadHeight;

  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, bodyHeight, stepDepth),
    new THREE.MeshStandardMaterial()
  );

  bodyMesh.userData.parentStairs = group;
  bodyMesh.position.set(
    0,
    yPos - height / 2 + bodyHeight / 2,
    zPos
  );

  group.add(bodyMesh);

let treadObject;

if (stairStyle.type === "brickTread") {
  treadObject = createBrickTread(1, stepDepth);
} else {
  treadObject = new THREE.Mesh(
    new THREE.BoxGeometry(1, treadHeight, stepDepth),
    woodStairMaterial
  );
}

treadObject.userData.parentStairs = group;
treadObject.position.set(
  0,
  yPos + height / 2 - treadHeight / 2,
  zPos
);

group.add(treadObject);

} else {

  // NORMAL (DEFAULT / GLASS) STEP
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, height, stepDepth),
    finalMaterial
  );

  mesh.userData.parentStairs = group;
  mesh.position.set(0, yPos, zPos);

  group.add(mesh);
}

  }
  }

  return group;
}

//---------- ROTATION ----------
let currentRotation = 0; // radians (0, 90, 180, 270)

//---------- UNDO/REDO STACKS ----------
const undoStack = [];
const redoStack = [];

let selectedItem = {
  type: "indoorWall", // or "outdoorWall"
  variant: "1x5",
  style: "drywall"
};

// ---------- STORIES ----------
let currentStory = 0;
const STORY_HEIGHT = 5; // meters per floor

// ---------- MASTER COLOR PALETTE (80 COLORS) ----------
const COLOR_PALETTE = [
  // Row 1 – Greys
  ["#000000","#2b2b2b","#555555","#7f7f7f","#a9a9a9","#c0c0c0","#d3d3d3","#e0e0e0","#eeeeee","#f5f5f5"],

  // Row 2 – Bright
  ["#b30000","#ff0000","#ff8c00","#ffd700","#00ff00","#00ced1","#4682b4","#0000ff","#8a2be2","#ff00ff"],

  // Row 3
  ["#d9a5a0","#f2b6b6","#f5deb3","#f0e68c","#c8e6c9","#b0e0e6","#b0c4de","#c6d8ef","#d8bfd8","#e6cdda"],

  // Row 4
  ["#d97b66","#e9967a","#f0c27b","#f4d03f","#a9d18e","#93c6cf","#8faadc","#9dc3e6","#b4a7d6","#c27ba0"],

  // Row 5
  ["#cc4c33","#e06666","#f6b26b","#ffd966","#93c47d","#76a5af","#6d9eeb","#6fa8dc","#8e7cc3","#c27ba0"],

  // Row 6
  ["#a61c00","#cc0000","#e69138","#f1c232","#6aa84f","#45818e","#3c78d8","#3d85c6","#674ea7","#a64d79"],

  // Row 7
  ["#85200c","#990000","#b45f06","#bf9000","#38761d","#134f5c","#1155cc","#0b5394","#351c75","#741b47"],

  // Row 8 – Dark
  ["#5b0f00","#660000","#783f04","#7f6000","#274e13","#0c343d","#1c4587","#073763","#20124d","#4c1130"]
];

//---------- BUILD COLOR PALETTE UI ----------
function buildColorPalette(containerId, labelText, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "palette-wrapper";

  const label = document.createElement("h4");
  label.innerText = labelText;
  wrapper.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "color-grid";

  COLOR_PALETTE.forEach(row => {
    row.forEach(color => {
      const btn = document.createElement("div");
      btn.className = "color-swatch";
      btn.style.backgroundColor = color;

      btn.onclick = () => {
        grid.querySelectorAll(".color-swatch")
          .forEach(s => s.classList.remove("active"));
        btn.classList.add("active");
        onSelect(color);
        updatePreviewGeometry();
      };

      grid.appendChild(btn);
    });
  });

  wrapper.appendChild(grid);
  container.appendChild(wrapper);
}

//---------- COMPONENT REGISTERY ----------
const components = {
indoorWall: {
  snap: "wall",
  placement: "wall",
  verticalAlign: "bottom",
  variants: {
    "1x5": { size: { x: 1, y: 5, z: 0.2 } },
    "3x5": { size: { x: 3, y: 5, z: 0.2 } },
    "5x5": { size: { x: 5, y: 5, z: 0.2 } },
    "2x1": { size: { x: 2, y: 1, z: 0.2 } },
    "1x1": { size: { x: 1, y: 1, z: 0.2 } }
  },
  styles: {
  drywall: {thumbnail: "wall-drywall.png" },
  brick: {
  type: "brick",
  brickWidth: 0.45,
  brickHeight: 0.2,
  brickDepth: 0.08,
  mortarGap: 0.03,
  thumbnail: "wall-brick.png"
},
  drywallBaseboard: {
    type: "baseboard",
    baseboardHeight: 0.5,
    baseboardDepthMult: 1.4,
    thumbnail: "wall-drywall-baseboard.png"
  },
  wainscoting: {
  type: "wainscoting",
  baseboardDepthMult: 1.4,
  thumbnail: "wall-wainscoting.png"
},
woodPanels: {
  type: "woodPanels",
  texture: woodWallTexture,
  thumbnail: "wall-wood.png"
}
}
},
outdoorWall: {
  snap: "wall",
  placement: "wall",
  verticalAlign: "bottom",
  variants: {
    "1x5": { size: { x: 1, y: 5, z: 0.2 } },
    "3x5": { size: { x: 3, y: 5, z: 0.2 } },
    "5x5": { size: { x: 5, y: 5, z: 0.2 } },
    "2x1": { size: { x: 2, y: 1, z: 0.2 } },
    "1x1": { size: { x: 1, y: 1, z: 0.2 } }
  },
  styles: {
    brick: {
  type: "brick",
  brickWidth: 0.45,
  brickHeight: 0.2,
  brickDepth: 0.08,
  mortarGap: 0.03,
  thumbnail: "wall-brick.png"
},
shiplap: {
  type: "shiplap",
  plankGap: 0.03,
  plankThickness: 0.08,
  plankHeight: 0.25,
  slant: 0.15
},
    shingles: {
  name: "Shingles",
  type: "shingles",
  shingleHeight: 0.25,
  shingleThickness: 0.04,
  shingleOverlap: 0.06,
}
  }
},
  floor: {
  variants: {
    "1x1": { size: { x: 1, y: 0.05, z: 1 } },
    "5x5": { size: { x: 5, y: 0.05, z: 5 } },
    "3x3": { size: { x: 3, y: 0.05, z: 3 } }
  },
  snap: "grid",
  placement: "ground",
  verticalAlign: "bottom",
  styles: {
    concrete: {thumbnail: "floor-concrete.png" },
    tile: {
  type: "tile",
  groutGap: 0.01
},
    woodPlank: {
  type: "wood",
  texture: woodPlankTexture
},
    brick: {
  type: "brick",
  mortarGap: 0.05
}
  }
},
ceiling: {
  snap: "grid",
  placement: "ceiling",
  verticalAlign: "top",
  variants: {
    "1x1": { size: { x: 1, y: 0.2, z: 1 } },
    "3x3": { size: { x: 3, y: 0.2, z: 3 } },
    "5x5": { size: { x: 5, y: 0.2, z: 5 } },
    "2x1-slope": {
  size: { x: 2, y: 0.2, z: 1 },
  ceiling: {
    type: "slope",
    slope: 0.5
  }
},
"2x2 Slope": {
  size: { x: 2, y: 0.2, z: 2 },
  ceiling: {
    type: "slope",
    slope: 0.5
  }
},
"2x5 Slope": {
  size: { x: 2, y: 0.2, z: 5 },
  ceiling: {
    type: "slope",
    slope: 0.5
  }
},
"1x1 Slope": {
 size: { x: 1, y: 0.2, z: 1 },
 ceiling: {
    type: "slope",
    slope: 0.5
 }
},
"1x1-ridge": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "ridge",
    slope: 0.5
  }
},
"1x5-ridge": {
  size: { x: 1, y: 0.2, z: 5 },
  ceiling: {
    type: "ridge",
    slope: 0.5
  }
},
"Ridge diagonal": {
  size: { x: 0.5, y: 0.2, z: 0.5 },   // adjust if you want a different footprint
  ceiling: {
    type: "ridge-diagonal",
    slope: 0.5
  }
},
"1x1 Ridge Diagonal Flip": {
  size: { x: 0.5, y: 0.2, z: 0.5 },
  ceiling: {
    type: "compound-slope-mix-2",
    slope: 0.5
  }
},
"2x2 Hip": {
  size: { x: 2, y: 0.2, z: 2 },
  ceiling: {
    type: "hip",
    slope: 0.5
  }
},
"1x1 Hip": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "hip",
    slope: 0.5
  }
},
"2x2 Valley": {
  size: { x: 2, y: 0.2, z: 2 },
  ceiling: {
    type: "valley",
    slope: 0.5
  }
},
"1x1 Valley": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "valley",
    slope: 0.5
  }
},
"High Slope": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "slope",
    slope: 3.0
  }
},
"5x1 High Slope": {
  size: { x: 1, y: 0.2, z: 5 },
  ceiling: {
    type: "slope",
    slope: 3.0
  }
},
"High Hip": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "hip",
    slope: 3.0
  }
},
"High Valley": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "valley",
    slope: 3.0
  }
}
  },
  styles: {
    drywall: { thumbnail: "ceiling-drywall.png" },
    woodPanels: {
  type: "woodPanels",
  texture: woodWallTexture,
  thumbnail: "ceiling-wood.png"
}
  }
},
block: {
  snap: "grid",
  placement: "ground",
  verticalAlign: "bottom",
  variants: {
    "1x1x1": {
      size: { x: 1, y: 1, z: 1 }
    },
    "3x1x3": {
      size: { x: 3, y: 1, z: 3 }
    },
    "5x1x5": {
      size: { x: 5, y: 1, z: 5 }
    },
    "Inverted Wedge": {
  size: { x: 1, y: 1, z: 1 },
  geometry: "invertedWedge"
},
"corner-1x": {
  size: { x: 0.3, y: 1, z: 0.3 },
  cornerOffset: true
},
"corner-5x": {
  size: { x: 0.3, y: 5, z: 0.3 },
  cornerOffset: true
},
  },
  styles: {
    default: {
      thumbnail: "block-default.png"
    }
  }
},
window: {
  variants: {
    "1x1": { size: { x: 1, y: 1, z: 0.5 } },
    "2x3": { size: { x: 2, y: 3, z: 0.5 } },
    "1x5": { size: { x: 1, y: 5, z: 0.5 } },
    "3x5": { size: { x: 3, y: 5, z: 0.5 } },
    "5x5": { size: { x: 5, y: 5, z: 0.5 } }
  },
  snap: "grid",
  verticalAlign: "center",
  styles: {
  simpleFramed: {
  type: "simpleFramedWindow",
  glassColor: 0x66ccff,
  thumbnail: "window-simple-framed.png"
},
 Framed4x3: {
    type: "framedWindow",
    glassColor: 0x66ccff,
    thumbnail: "window-classic.png"
  },
  Framed3x2: {
  type: "framedWindow3x2",
  glassColor: 0x66ccff,
  thumbnail: "window-classic-3x2.png"
}
  }
},
door: {
  variants: {
    "Single": { size: { x: 2, y: 4, z: 0.5} }
  },
  snap: "grid",
  verticalAlign: "bottom",
  styles: {
    framed: {
      type: "framedDoor",
      thumbnail: "door-framed.png"
    }
  }
},
roof: {
  snap: "grid",
  placement: "roof",
  verticalAlign: "top",
  variants: {
    "1x1": { size: { x: 1, y: 0.2, z: 1 } },
    "3x3": { size: { x: 3, y: 0.2, z: 3 } },
    "5x5": { size: { x: 5, y: 0.2, z: 5 } },
    "2x1-slope": {
  size: { x: 2, y: 0.2, z: 1 },
  ceiling: {
    type: "slope",
    slope: 0.5
  }
},
"2x2 Slope": {
  size: { x: 2, y: 0.2, z: 2 },
  ceiling: {
    type: "slope",
    slope: 0.5
  }
},
"2x5 Slope": {
  size: { x: 2, y: 0.2, z: 5 },
  ceiling: {
    type: "slope",
    slope: 0.5
  }
},
"1x1 Slope": {
 size: { x: 1, y: 0.2, z: 1 },
 ceiling: {
    type: "slope",
    slope: 0.5
 }
},
"1x1-ridge": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "ridge",
    slope: 0.5
  }
},
"1x5-ridge": {
  size: { x: 1, y: 0.2, z: 5 },
  ceiling: {
    type: "ridge",
    slope: 0.5
  }
},
"Ridge diagonal": {
  size: { x: 0.5, y: 0.2, z: 0.5 },   // adjust if you want a different footprint
  ceiling: {
    type: "ridge-diagonal",
    slope: 0.5
  }
},
"1x1 Ridge Diagonal Flip": {
  size: { x: 0.5, y: 0.2, z: 0.5 },
  ceiling: {
    type: "compound-slope-mix-2",
    slope: 0.5
  }
},
"2x2 Hip": {
  size: { x: 2, y: 0.2, z: 2 },
  ceiling: {
    type: "hip",
    slope: 0.5
  }
},
"1x1 Hip": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "hip",
    slope: 0.5
  }
},
"2x2 Valley": {
  size: { x: 2, y: 0.2, z: 2 },
  ceiling: {
    type: "valley",
    slope: 0.5
  }
},
"1x1 Valley": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "valley",
    slope: 0.5
  }
},
"High Slope": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "slope",
    slope: 3.0
  }
},
"5x1 High Slope": {
  size: { x: 1, y: 0.2, z: 5 },
  ceiling: {
    type: "slope",
    slope: 3.0
  }
},
"High Hip": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "hip",
    slope: 3.0
  }
},
"High Valley": {
  size: { x: 1, y: 0.2, z: 1 },
  ceiling: {
    type: "valley",
    slope: 3.0
  }
}
  },
  styles: {
  flatRoofShingles: {
  type: "flatRoofShingles",

  shingleHeight: 0.3333,
  shingleOverlap: 0.08,
  shingleThickness: 0.06,
  shingleSlant: -0.15
},
    metal:   { thumbnail: "roof-metal.png" }
  }
},
stairs: {
  variants: {
    "1x1-solid": {
      blocks: 1,
      solid: true
    },
    "1x1-hollow": {
      blocks: 1,
      solid: false
    },
    "5x-solid": {
      blocks: 5,
      solid: true
    },
    "5x-hollow": {
      blocks: 5,
      solid: false
    }
  },
  styles: {
  default: {},

  glass: {
    type: "glass",
    thumbnail: "stairs-glass.png"
  },
  woodTread: {
    type: "woodTread",
    treadHeight: 0.05,
    thumbnail: "stairs-wood.png"
  },
  brickTread: {
  type: "brickTread",
  treadHeight: 0.1,
  thumbnail: "stairs-brick.png"
}
}
}
};

let canPlace = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  physicallyCorrectLights: true
});

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const container = document.getElementById("scene-container");
renderer.setSize(container.clientWidth, container.clientHeight);
document.getElementById("scene-container").appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  60,
  container.clientWidth / container.clientHeight,
  0.5,   // 👈 was 0.1
  2000
);

camera.position.set(10, 10, 10);

const mainLight = new THREE.DirectionalLight(0xffffff, 0.6);
mainLight.position.set(5, 10, 5);
scene.add(mainLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
fillLight.position.set(-5, 5, -5);
scene.add(fillLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const gridSize = 200;     // overall size of grid
const gridDivisions = 200; // number of cells

const grid = new THREE.GridHelper(
  gridSize,
  gridDivisions,
  0xdddddd, // center line color (light)
  0xeeeeee  // grid line color (lighter)
);

grid.material.opacity = 0.5;
grid.material.transparent = true;
grid.material.depthWrite = false;
grid.renderOrder = -1;

scene.add(grid);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(gridSize, gridSize),
  new THREE.MeshStandardMaterial({ visible: false })
);

ground.rotation.x = -Math.PI / 2;
scene.add(ground);
buildables.push(ground);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

controls.enablePan = true;

controls.minPolarAngle = 0;           // allow full vertical orbit
controls.maxPolarAngle = Math.PI;     // allow looking straight up
controls.screenSpacePanning = true;
controls.maxDistance = 1000;
controls.minDistance = 1;

const pmrem = new THREE.PMREMGenerator(renderer);

// ---------- CAMERA DRAGGING ----------
controls.addEventListener("start", () => {
  isDraggingCamera = true;
});

controls.addEventListener("end", () => {
  // delay reset slightly so click doesn't fire after drag
  setTimeout(() => {
    isDraggingCamera = false;
  }, 0);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

const previewMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ffff,
  transparent: true,
  opacity: 0.4,
  side: THREE.DoubleSide
});

const previewBlock = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  previewMaterial
);

let previewStairs = null;

function updatePreviewGeometry() {
  if (previewStairs) {
    deleteBuildable(previewStairs);
    previewStairs = null;
  }

  if (selectedItem.type === "stairs") {
    previewBlock.visible = false;

    const material = previewMaterial.clone();

previewStairs = createStairMesh(
  selectedItem.variant || "1x1-solid",
  material
);

scene.add(previewStairs);
return;
  }

let config;

if (selectedItem.type === "wall") {
  config = components.wall.variants[selectedItem.variant];

  if (!config.styles[selectedItem.style]) {
    selectedItem.style = Object.keys(config.styles)[0];
  }
}
else if (components[selectedItem.type].variants) {
  config = components[selectedItem.type].variants[selectedItem.variant];
}
else {
  config = components[selectedItem.type];
}

// determine color safely
let color;

if (selectedItem.type === "wall") {
  color = config.styles[selectedItem.style].color;
}
else {
  const comp = components[selectedItem.type];
  color = comp.styles?.[selectedItem.style]?.color ?? 0xcccccc;
}

// update preview geometry and color
if (previewBlock.geometry) {
  previewBlock.geometry.dispose();
}

  let newGeo; // ✅ DEFINE ONCE

if (config.ceiling) {
  const geo = createCeilingGeometry({
    type: config.ceiling.type,
    lengthX: config.size.x,
    zWidth: config.size.z,
    slope: config.ceiling.slope,
    thickness: config.size.y,
    yOffset: -config.size.y
  });

  if (!geo) return;
  previewBlock.geometry = geo;
} else if (config.ceiling) {
  const geo = createCeilingGeometry({
    type: config.ceiling.type,
    lengthX: config.size.x,
    zWidth: config.size.z,
    slope: config.ceiling.slope,
    thickness: config.size.y,
    yOffset: -config.size.y
  });

  if (!geo) return;
  previewBlock.geometry = geo;
} else if (config.geometry === "invertedWedge") {
  previewBlock.geometry = createInvertedWedgeGeometry();
} else {
  previewBlock.geometry = new THREE.BoxGeometry(
    config.size.x,
    config.size.y,
    config.size.z
  );
}

// ----- APPLY MATERIAL / TEXTURE -----
if (
  selectedItem.type === "ceiling" &&
  components.ceiling.styles[selectedItem.style]?.type === "woodPanels"
) {
  previewBlock.material = new THREE.MeshStandardMaterial({
    map: woodWallTexture,
    side: THREE.DoubleSide
  });
} else {
  if (!previewBlock.material.map) {
  previewBlock.material.color.setHex(color);
}
}

  previewBlock.visible = true;
  previewBlock.rotation.set(0, currentRotation, 0);
}

updatePreviewGeometry();

previewBlock.visible = false;
scene.add(previewBlock);

animate();

window.addEventListener("contextmenu", (e) => e.preventDefault());

const WINDOW_SILL_HEIGHT = 1; // meters above floor
const DOOR_SILL_HEIGHT = 0;

// ---------- INVERTED WEDGE GEOMETRY ----------
function createInvertedWedgeGeometry() {
  // Base right triangle (same as roof)
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, 1);
  shape.lineTo(1, 0);
  shape.lineTo(0, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false
  });

  // Orient same as roof
  geometry.rotateY(Math.PI / 2);

  // 🔥 FLIP UPSIDE DOWN
  geometry.rotateX(Math.PI);

  // Center in 1×1×1 grid
  geometry.translate(-0.5, 0.5, -0.5);

  geometry.computeVertexNormals();
  return geometry;
}

// ---------- SLOPE PIECE GEOMETRY ----------
function createSlopePiece({
  lengthX,
  zWidth,
  slope,
  thickness,
  yOffset
}) {
  return createCeilingGeometry({
    type: "slope",
    lengthX,
    zWidth,
    slope,
    thickness,
    yOffset
  });
}

// ---------- ROOF/CEILING PARAMETRIC SLOPE / RIDGE GENERATOR ----------
function createCeilingGeometry({
  type = "slope",   // "slope" or "ridge"
  lengthX = 1,      // total length along X
  zWidth = 1,       // width along Z
  slope = 0.5,      // rise/run ratio
  thickness = 0.2,  // Y thickness
  yOffset = -0.2    // bottom start
} = {}) {
  let geometry = new THREE.BufferGeometry();

  const t = thickness;
  const y0 = yOffset;
 const halfX = lengthX / 2;
const halfZ = zWidth / 2;

const x0 = -halfX;
const x1 = 0;
const x2 = halfX;

const z0 = -halfZ;
const z1 = halfZ;

  let vertices;

  function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

  if (type === "slope") {
    // Single slope block
    const rise = lengthX * slope;
    const yTop = y0 + rise;

    vertices = new Float32Array([
      // BOTTOM FACE
      x0, y0, z0,  x2, yTop, z0,  x2, yTop, z1,
      x0, y0, z0,  x2, yTop, z1,  x0, y0, z1,

      // TOP FACE
      x0, y0 + t, z0,  x2, yTop + t, z1,  x2, yTop + t, z0,
      x0, y0 + t, z0,  x0, y0 + t, z1,  x2, yTop + t, z1,

      // LEFT FACE
      x0, y0, z0,  x0, y0 + t, z0,  x0, y0 + t, z1,
      x0, y0, z0,  x0, y0 + t, z1,  x0, y0, z1,

      // RIGHT FACE
      x2, yTop, z0,  x2, yTop + t, z1,  x2, yTop + t, z0,
      x2, yTop, z0,  x2, yTop, z1,  x2, yTop + t, z1,

      // FRONT FACE
      x0, y0, z1,  x2, yTop, z1,  x2, yTop + t, z1,
      x0, y0, z1,  x2, yTop + t, z1,  x0, y0 + t, z1,

      // BACK FACE
      x0, y0, z0,  x2, yTop + t, z0,  x2, yTop, z0,
      x0, y0, z0,  x0, y0 + t, z0,  x2, yTop + t, z0
    ]);

  } else if (type === "ridge") {
    // Ridge block (two slopes meeting at center)
    const riseHalf = halfX * slope;
    const yPeak = y0 + riseHalf;

    vertices = new Float32Array([
      // LEFT SLOPE - bottom
      x0, y0, z0,  x1, yPeak, z0,  x1, yPeak, z1,
      x0, y0, z0,  x1, yPeak, z1,  x0, y0, z1,

      // RIGHT SLOPE - bottom
      x1, yPeak, z0,  x2, y0, z0,  x2, y0, z1,
      x1, yPeak, z0,  x2, y0, z1,  x1, yPeak, z1,

      // LEFT SLOPE - top
      x0, y0 + t, z0,  x1, yPeak + t, z1,  x1, yPeak + t, z0,
      x0, y0 + t, z0,  x0, y0 + t, z1,  x1, yPeak + t, z1,

      // RIGHT SLOPE - top
      x1, yPeak + t, z0,  x2, y0 + t, z1,  x2, y0 + t, z0,
      x1, yPeak + t, z0,  x1, yPeak + t, z1,  x2, y0 + t, z1,

      // LEFT SIDE
      x0, y0, z0,  x0, y0 + t, z0,  x1, yPeak + t, z0,
      x0, y0, z0,  x1, yPeak + t, z0,  x1, yPeak, z0,

      // RIGHT SIDE
      x1, yPeak, z0,  x1, yPeak + t, z0,  x2, y0 + t, z0,
      x1, yPeak, z0,  x2, y0 + t, z0,  x2, y0, z0,

      // FRONT FACE
      x0, y0, z1,  x1, yPeak, z1,  x1, yPeak + t, z1,
      x0, y0, z1,  x1, yPeak + t, z1,  x0, y0 + t, z1,

      x1, yPeak, z1,  x2, y0, z1,  x2, y0 + t, z1,
      x1, yPeak, z1,  x2, y0 + t, z1,  x1, yPeak + t, z1,

      // BACK FACE
      x0, y0, z0,  x1, yPeak + t, z0,  x1, yPeak, z0,
      x0, y0, z0,  x0, y0 + t, z0,  x1, yPeak + t, z0,

      x1, yPeak, z0,  x2, y0 + t, z0,  x2, y0, z0,
      x1, yPeak, z0,  x1, yPeak + t, z0,  x2, y0 + t, z0
    ]);
} else if (type === "ridge-diagonal") {

  // --- Part A: slope block, rotated 270°, shifted LEFT by its x-length ---
  const geoA = createCeilingGeometry({
    type: "slope",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });
  geoA.rotateY(3 * Math.PI / 2);     // 270°
  geoA.translate(lengthX, 0, 0);    // shift left by its x-length

  // --- Part B: slope-diagonal block, rotated 270° ---
  const geoB = createCeilingGeometry({
    type: "slope-diagonal",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });
  geoB.rotateY(3 * Math.PI / 2);     // 270°

  // --- Part C: slope-half-diagonal-tr, rotated 90°, 
  //              shifted RIGHT by its x-length and LEFT by its z-length ---
  const geoC = createCeilingGeometry({
    type: "slope-half-diagonal-tr",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });
  geoC.rotateY(Math.PI / 2);         // 90°
  geoC.translate(lengthX, 0, zWidth); // right by x-length, left by z-length

  geometry = mergeGeometries([geoA, geoB, geoC], true);
  geometry.translate(-lengthX / 4 - 0.125, 0, -zWidth / 4 - 0.125);
} else if (type === "compound-slope-mix-2") {

  // --- Part A: slope block ---
  const geoA = createCeilingGeometry({
    type: "slope",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });
  geoA.translate(0, 0, zWidth);    // shift left by its x-length

  // --- Part B: slope-half-diagonal-tr-zflip rotated 180° ---
  const geoB = createCeilingGeometry({
    type: "slope-half-diagonal-tr-zflip",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });
  geoB.rotateY(Math.PI); // 180°
  geoB.translate(lengthX, 0, zWidth); // shift back by its z-length

  // --- Part C: slope-diagonal-flipped ---
  const geoC = createCeilingGeometry({
    type: "slope-diagonal-flipped",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });

  geometry = mergeGeometries([geoA, geoB, geoC], true);
geometry.translate(-lengthX / 4 - 0.125, 0, -zWidth / 4 - 0.125);
} else if (type === "hip") {

  const geoA = createCeilingGeometry({
    type: "slope-diagonal",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });

  const geoB = createCeilingGeometry({
    type: "slope-diagonal-flipped",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });

  // Rotate second diagonal 90 degrees
  geoB.rotateY(Math.PI / 2);

  geometry = mergeGeometries([geoA, geoB], true);
} else if (type === "valley") {

  const geoA = createCeilingGeometry({
    type: "slope-half-diagonal-tr",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });

  const geoB = createCeilingGeometry({
    type: "slope-half-diagonal-tr-zflip",
    lengthX,
    zWidth,
    slope,
    thickness: t,
    yOffset: y0
  });

  // Rotate second piece 90 degrees
  geoB.rotateY(Math.PI / 2);

  geometry = mergeGeometries([geoA, geoB], true);
} else if (type === "slope-diagonal") {

  const rise = lengthX * slope;
  const yTop = y0 + rise;

  vertices = new Float32Array([
    // BOTTOM (triangular)
    x0, y0, z0,
    x2, yTop, z0,
    x0, y0, z1,

    // TOP (triangular)
    x0, y0 + t, z0,
    x2, yTop + t, z0,
    x0, y0 + t, z1,

    // SLOPED FACE (diagonal roof face)
    x0, y0, z1,
    x2, yTop, z0,
    x2, yTop + t, z0,

    x0, y0, z1,
    x2, yTop + t, z0,
    x0, y0 + t, z1,

    // BACK FACE
    x0, y0, z0,
    x0, y0 + t, z0,
    x2, yTop + t, z0,

    x0, y0, z0,
    x2, yTop + t, z0,
    x2, yTop, z0,

    // LEFT FACE
    x0, y0, z0,
    x0, y0 + t, z0,
    x0, y0 + t, z1,

    x0, y0, z0,
    x0, y0 + t, z1,
    x0, y0, z1
  ]);
 } else if (type === "slope-diagonal-flipped") {

  const rise = lengthX * slope;
  const yTop = y0 + rise;

  vertices = new Float32Array([
    // BOTTOM (triangular)
    x0, y0, z1,
    x2, yTop, z1,
    x0, y0, z0,

    // TOP (triangular)
    x0, y0 + t, z1,
    x2, yTop + t, z1,
    x0, y0 + t, z0,

    // SLOPED FACE (diagonal roof face)
    x0, y0, z0,
    x2, yTop, z1,
    x2, yTop + t, z1,

    x0, y0, z0,
    x2, yTop + t, z1,
    x0, y0 + t, z0,

    // BACK FACE
    x0, y0, z1,
    x0, y0 + t, z1,
    x2, yTop + t, z1,

    x0, y0, z1,
    x2, yTop + t, z1,
    x2, yTop, z1,

    // RIGHT FACE
    x0, y0, z0,
    x0, y0 + t, z0,
    x0, y0 + t, z1,

    x0, y0, z0,
    x0, y0 + t, z1,
    x0, y0, z1
  ]);
  } else if (type === "slope-half-diagonal-tr") {

  const rise = lengthX * slope;
  const yTop = y0 + rise;

  // Keep TOP-RIGHT half:
  // Triangle in XZ: (x0,z1) → (x2,z1) → (x2,z0)

  vertices = new Float32Array([

    // BOTTOM FACE (triangular, sloped)
    x0, y0,    z1,
    x2, yTop,  z1,
    x2, yTop,  z0,

    // TOP FACE (triangular, offset by thickness)
    x0, y0 + t,    z1,
    x2, yTop + t,  z1,
    x2, yTop + t,  z0,

    // SLOPED FACE (along z = z1)
    x0, y0,        z1,
    x2, yTop,      z1,
    x2, yTop + t,  z1,

    x0, y0,        z1,
    x2, yTop + t,  z1,
    x0, y0 + t,    z1,

    // RIGHT FACE (x = x2)
    x2, yTop,      z0,
    x2, yTop + t,  z1,
    x2, yTop + t,  z0,

    x2, yTop,      z0,
    x2, yTop,      z1,
    x2, yTop + t,  z1,

    // DIAGONAL CUT FACE (from (x0,z1) to (x2,z0))
    x0, y0,        z1,
    x0, y0 + t,    z1,
    x2, yTop + t,  z0,

    x0, y0,        z1,
    x2, yTop + t,  z0,
    x2, yTop,      z0
  ]);
  } else if (type === "slope-half-diagonal-tr-zflip") {

  const rise = lengthX * slope;
  const yTop = y0 + rise;

  // Same as slope-half-diagonal-tr but mirrored on Z

  vertices = new Float32Array([

    // BOTTOM FACE (triangular, sloped)
    x0, y0,    z0,
    x2, yTop,  z0,
    x2, yTop,  z1,

    // TOP FACE
    x0, y0 + t,    z0,
    x2, yTop + t,  z0,
    x2, yTop + t,  z1,

    // SLOPED FACE (along z = z0)
    x0, y0,        z0,
    x2, yTop,      z0,
    x2, yTop + t,  z0,

    x0, y0,        z0,
    x2, yTop + t,  z0,
    x0, y0 + t,    z0,

    // RIGHT FACE (x = x2)
    x2, yTop,      z1,
    x2, yTop + t,  z0,
    x2, yTop + t,  z1,

    x2, yTop,      z1,
    x2, yTop,      z0,
    x2, yTop + t,  z0,

    // DIAGONAL CUT FACE (from (x0,z0) to (x2,z1))
    x0, y0,        z0,
    x0, y0 + t,    z0,
    x2, yTop + t,  z1,

    x0, y0,        z0,
    x2, yTop + t,  z1,
    x2, yTop,      z1
  ]);
} else {
    console.warn("Unknown ceiling type:", type);
    return null;
  }

  if (vertices) {
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
}

// IMPORTANT: ensure correct normal smoothing
geometry.computeVertexNormals();
geometry.normalizeNormals();

  return geometry;
}

//----------- BUILD MODES ----------
let mode = "build"; // "build" or "delete"

// ---------- GET WALL STACK HEIGHT ----------
function getWallStackHeight(x, z) {
  let maxTop = currentStory * STORY_HEIGHT;
  const { sx, sz } = getStackKey(x, z);

  buildables.forEach(obj => {
    if (!obj.userData.wallSlot) return;
    if (obj.userData.stackX !== sx) return;
    if (obj.userData.stackZ !== sz) return;
    if (typeof obj.userData.height !== "number") return;

    const top = obj.position.y + obj.userData.height / 2;
    maxTop = Math.max(maxTop, top);
  });

  return maxTop;
}

function applyVerticalGradient(geometry, baseColorHex) {
  const pos = geometry.attributes.position;
  const count = pos.count;

  const colors = new Float32Array(count * 3);

  const base = new THREE.Color(baseColorHex);
  const dark = base.clone().multiplyScalar(0.85); // 90% color, 10% black

  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const range = Math.max(0.0001, maxY - minY);

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const t = (y - minY) / range; // 0 = bottom, 1 = top

    const c = dark.clone().lerp(base, t);

    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(colors, 3)
  );
}

// ---------- GET STACK KEY ----------
function getStackKey(x, z) {
  return {
    sx: Math.round(x * 2) / 2,
    sz: Math.round(z * 2) / 2
  };
}

const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x66ccff,
  transmission: 1,        // makes it see-through
  opacity: 0.4,
  transparent: true,
  roughness: 0,
  metalness: 0,
  thickness: 0.1,
  clearcoat: 1,
  clearcoatRoughness: 0.1
});

// ---------- POINTER DOWN ----------
window.addEventListener("pointerdown", (event) => {
  if (isMouseOverUI(event)) return;
  if (event.button !== 0) return;
  if (mode !== "build") return;
  if (isUIInteraction(event)) {
    pointerDown = false;
    return;
  }

  pointerDown = true;
  pointerMoved = false;
  downX = event.clientX;
  downY = event.clientY;
});

// ---------- POINTER UP ----------
window.addEventListener("pointermove", (event) => {
  if (isUIInteraction(event)) return;

  if (!pointerDown) return;

  const dx = event.clientX - downX;
  const dy = event.clientY - downY;

  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    pointerMoved = true;
  }
});

// Track last valid position & rotation for placement
let lastPreviewPosition = new THREE.Vector3();
let lastPreviewRotation = 0;

// Keep track of vertical offset for stairs
let stairVerticalOffset = 0;

// ---------- Arrow Key Handler ----------
document.addEventListener("keydown", (e) => {
  if (selectedItem?.type === "stairs") { // only affect stairs when placing stairs
    if (e.key === "ArrowUp") {
      stairVerticalOffset += 0.5; // move up
    } else if (e.key === "ArrowDown") {
      stairVerticalOffset -= 0.5; // move down
      stairVerticalOffset = Math.max(stairVerticalOffset, 0); // prevent going below floor
    }
  }
});

// ---------- MOUSE MOVE (HOVER PREVIEW) ----------
window.addEventListener("mousemove", (event) => {
  if (isDraggingCamera) {
  previewBlock.visible = false;
  if (previewStairs) previewStairs.visible = false;
  return;
}
  if (isMouseOverUI(event)) {
    previewBlock.visible = false;
    if (previewStairs) previewStairs.visible = false;
    return;
  }

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(ground);

if (intersects.length === 0) {
  previewBlock.visible = false;
  return;
}

  // ---------- PREVIEW ----------
  if (intersects.length > 0) {
    const hit = intersects[0];
    const point = hit.point;

//----------- SNAPPING LOGIC ----------
let config;

if (selectedItem.type === "wall") {
  config = components.wall.variants[selectedItem.variant];
} else if (components[selectedItem.type].variants) {
  // For floors, windows, doors
  config = components[selectedItem.type].variants[selectedItem.variant];
} else {
  config = components[selectedItem.type];
}

let x, y, z;

// ---------- FLOOR (story-based) ----------
if (selectedItem.type === "floor") {
  x = Math.floor(point.x) + 0.5;
  z = Math.floor(point.z) + 0.5;
  y = currentStory * STORY_HEIGHT + config.size.y / 2;

   // 🚫 Block floors above stairs
  const blocked = buildables.some(obj => {
    if (obj.userData.type !== "stairs") return false;

    const sameCell =
      Math.floor(obj.position.x) === Math.floor(x) &&
      Math.floor(obj.position.z) === Math.floor(z);

    return sameCell;
  });

  if (blocked) {
    previewBlock.visible = false;
    return;
  }
}

// ---------- CEILING ----------
else if (selectedItem.type === "ceiling") {
  const is1x1 = config.size.x === 1 && config.size.z === 1;
  const isEvenX = config.size.x % 2 === 0;
  const isEvenZ = config.size.z % 2 === 0;
  const rotationDeg = Math.round((currentRotation * 180) / Math.PI) % 360;
const is2x2 = config.size.x === 2 && config.size.y === 0.2 && config.size.z === 2;

  if (rotationDeg === 0 || rotationDeg === 180) {
  if (isEvenX) {
    x = Math.floor(point.x);
  } else {
    x = Math.floor(point.x) + 0.5;
  }
  if (isEvenZ) {
    z = Math.floor(point.z);
  } else {
    z = Math.floor(point.z) + 0.5;
  }

  } else if (rotationDeg === 90 || rotationDeg === 270) {

     if (is2x2) {
    x = Math.floor(point.x);
     } else if (isEvenX) {
      x = Math.floor(point.x) + 0.5;
        }else if (is1x1){
      x = Math.floor(point.x) + 0.5;
  } else {
    x = Math.floor(point.x) + 0.5;
  }

   if (is1x1){
z= Math.floor(point.z) + 0.5;
    } else if (isEvenZ) {
    z = Math.floor(point.z);
    }else if (isEvenX) {
    z = Math.floor(point.z);
  } else {
    z = Math.floor(point.z) + 0.5;
}
}
  const baseFloorY = currentStory * STORY_HEIGHT;
  if (config.ceiling && (
  config.ceiling.type === "slope" ||
  config.ceiling.type === "ridge" ||
  config.ceiling.type === "ridge-diagonal" ||
  config.ceiling.type === "compound-slope-mix-2" ||
  config.ceiling.type === "hip" ||
  config.ceiling.type === "valley"
)) {
  y = baseFloorY + ceilingHeightOffset + config.size.y / 2 - 0.1;
} else {
  y = baseFloorY + ceilingHeightOffset + config.size.y / 2 - 0.2;
}
}

// ---------- BLOCK ----------
else if (selectedItem.type === "block") {
  x = Math.floor(point.x) + 0.5;
  z = Math.floor(point.z) + 0.5;

  y =
    currentStory * STORY_HEIGHT +
    config.size.y / 2 +
    verticalPlacementOffset;

  // ---- CORNER OFFSET LOGIC ----
  if (config.cornerOffset) {
    const half = 0.5;
    const inset = 0.15; // half of 0.3

    const rot = Math.round((currentRotation * 180) / Math.PI) % 360;

    if (rot === 0) {
      x -= half - inset;
      z -= half - inset;
    } else if (rot === 90) {
      x += half - inset;
      z -= half - inset;
    } else if (rot === 180) {
      x += half - inset;
      z += half - inset;
    } else if (rot === 270) {
      x -= half - inset;
      z += half - inset;
    }
  }
}

// ---------- STAIRS ----------
else if (selectedItem.type === "stairs") {

  const variant = selectedItem.variant || "3-solid";

  previewBlock.visible = false;

  if (previewStairs) {
    deleteBuildable(previewStairs);
  }

  const stairStyle = selectedItem.style || "default";

const material =
  components.stairs.styles[stairStyle]?.type === "glass"
    ? glassMaterial.clone()
    : new THREE.MeshStandardMaterial({
        opacity: 0.7,
        transparent: true
      });

previewStairs = createStairMesh(variant, material, stairStyle);

previewStairs.userData = {
  type: "stairs",
  variant,
  style: stairStyle,
  primaryColor,
  secondaryColor
};

  previewStairs.position.set(
    Math.floor(point.x) + 0.5,
    currentStory * STORY_HEIGHT + stairVerticalOffset,
    Math.floor(point.z) + 0.5
  );
  previewStairs.rotation.y = currentRotation;
  scene.add(previewStairs);
  return;
}

if (previewStairs) previewStairs.visible = false;

// ---------- WINDOW PLACEMENT ----------
else if (selectedItem.type === "window") {
  const config = components.window.variants[selectedItem.variant];
  const evenX = config.size.x % 2 === 0;
  const dx = Math.abs(point.x - Math.round(point.x));
  const dz = Math.abs(point.z - Math.round(point.z));

  if (dx < dz) {
  x = Math.round(point.x) + 0;
  z = Math.floor(point.z) + (evenX ? 0 : 0.5);
} else {
  x = Math.floor(point.x) + (evenX ? 0 : 0.5);
  z = Math.round(point.z) + 0;
}

  // Y position based on story and variant height
  const stackHeight = getWallStackHeight(x, z);
y = stackHeight + config.size.y / 2;

  // Update preview geometry
  previewBlock.geometry.dispose();
  previewBlock.geometry = new THREE.BoxGeometry(
    config.size.x,
    config.size.y,
    config.size.z
  );

  previewBlock.position.set(
  x,
  y + verticalPlacementOffset,
  z
);
  previewBlock.rotation.set(0, currentRotation, 0);
  previewBlock.visible = true;

  // Save last valid position and rotation for placement
lastPreviewPosition.copy(previewBlock.position);
lastPreviewRotation = currentRotation;
  return;
}

// ---------- DOOR PLACEMENT ----------
else if (selectedItem.type === "door") {

  const config = components.door.variants[selectedItem.variant];

  const dx = Math.abs(point.x - Math.round(point.x));
  const dz = Math.abs(point.z - Math.round(point.z));

  if (dx < dz) {
    // Mounted in wall running along Z
    x = Math.round(point.x) + 0.5;
    z = Math.floor(point.z) + 0.5;
  } else {
    // Mounted in wall running along X
    x = Math.floor(point.x) + 1;
    z = Math.round(point.z);
  }

  const stackHeight = getWallStackHeight(x, z);
y = stackHeight + config.size.y / 2;

  previewBlock.geometry.dispose();
  previewBlock.geometry = new THREE.BoxGeometry(
    config.size.x,
    config.size.y,
    config.size.z
  );

  previewBlock.position.set(
  x,
  y + verticalPlacementOffset,
  z
);
  previewBlock.rotation.set(0, currentRotation, 0);
  previewBlock.visible = true;

  // Save last valid position and rotation for placement
lastPreviewPosition.copy(previewBlock.position);
lastPreviewRotation = currentRotation;
  return;
}

// ---------- ROOF ----------
else if (selectedItem.type === "roof") {
  const is1x1 = config.size.x === 1 && config.size.z === 1;
  const isEvenX = config.size.x % 2 === 0;
  const isEvenZ = config.size.z % 2 === 0;
  const rotationDeg = Math.round((currentRotation * 180) / Math.PI) % 360;
const is2x2 = config.size.x === 2 && config.size.y === 0.2 && config.size.z === 2;

  if (rotationDeg === 0 || rotationDeg === 180) {
  if (isEvenX) {
    x = Math.floor(point.x);
  } else {
    x = Math.floor(point.x) + 0.5;
  }
  if (isEvenZ) {
    z = Math.floor(point.z);
  } else {
    z = Math.floor(point.z) + 0.5;
  }

  } else if (rotationDeg === 90 || rotationDeg === 270) {

     if (is2x2) {
    x = Math.floor(point.x);
     } else if (isEvenX) {
      x = Math.floor(point.x) + 0.5;
        }else if (is1x1){
      x = Math.floor(point.x) + 0.5;
  } else {
    x = Math.floor(point.x) + 0.5;
  }

   if (is1x1){
z= Math.floor(point.z) + 0.5;
    } else if (isEvenZ) {
    z = Math.floor(point.z);
    }else if (isEvenX) {
    z = Math.floor(point.z);
  } else {
    z = Math.floor(point.z) + 0.5;
}
}
  const baseFloorY = currentStory * STORY_HEIGHT;
  if (config.ceiling && (
  config.ceiling.type === "slope" ||
  config.ceiling.type === "ridge" ||
  config.ceiling.type === "ridge-diagonal" ||
  config.ceiling.type === "compound-slope-mix-2" ||
  config.ceiling.type === "hip" ||
  config.ceiling.type === "valley"
)) {
  y = baseFloorY + ceilingHeightOffset + config.size.y / 2 + 0.1;
} else {
  y = baseFloorY + ceilingHeightOffset + config.size.y / 2;
}
}

//COPY PASTE 2

// ---------- WALL (on grid lines, offset along length) ----------
else if (selectedItem.type === "indoorWall" || selectedItem.type === "outdoorWall") {
  const config = components[selectedItem.type].variants[selectedItem.variant];

  const isIndoor = selectedItem.type === "indoorWall";
  const rotationDeg = Math.round((currentRotation * 180) / Math.PI) % 360;
const isEvenX = config.size.x % 2 === 0;
  let x, z;

  // --- BASE OFFSET LOGIC ---
  const alignedAlongX = rotationDeg === 90 || rotationDeg === 270;
  const alignedAlongZ = !alignedAlongX;

 // Add half-block offset depending on rotation
if (rotationDeg === 0 || rotationDeg === 180) {

  z = Math.floor(point.z); // ✅ ALWAYS set z

  if (isEvenX) {
    x = Math.floor(point.x);
  } else {
    x = Math.floor(point.x) + 0.5;
  }

} else if (rotationDeg === 90 || rotationDeg === 270) {

  x = Math.floor(point.x); // ✅ ALWAYS set x

  if (isEvenX) {
    z = Math.floor(point.z);
  } else {
    z = Math.floor(point.z) + 0.5;
  }
}

  // Determine offsets based on rotation
  let offset = config.size.z / 2;

  if (isIndoor) {
    // Clockwise rotation for indoor walls
    switch (rotationDeg) {
      case 0:   z += offset; break; // Top
      case 90:  x -= offset; break; // Left
      case 180: z -= offset; break; // Bottom
      case 270: x += offset; break; // Right
    }
  } else {
    // Counter-clockwise rotation for outdoor walls
    switch (rotationDeg) {
      case 0:   z -= offset; break; // Bottom
      case 90:  x += offset; break; // Right
      case 180: z += offset; break; // Top
      case 270: x -= offset; break; // Left
    }
  }

  // Compute height stacking
  const stackHeight = getWallStackHeight(x, z);
  const y = stackHeight + config.size.y / 2;

  // Update preview block
  previewBlock.geometry.dispose();
  previewBlock.geometry = new THREE.BoxGeometry(
    config.size.x,
    config.size.y,
    config.size.z
  );
  previewBlock.position.set(
  x,
  y + verticalPlacementOffset,
  z
);
  previewBlock.rotation.set(0, currentRotation, 0);
  previewBlock.visible = true;

  // Save last valid position and rotation for placement
lastPreviewPosition.copy(previewBlock.position);
lastPreviewRotation = currentRotation;
  return;
}

// Set position & visibility of preview block
previewBlock.position.set(
  x,
  y + verticalPlacementOffset,
  z
);
previewBlock.rotation.set(0, currentRotation, 0);
previewBlock.visible = true;
} else {
  previewBlock.visible = false;
}

// Save last valid position and rotation for placement
lastPreviewPosition.copy(previewBlock.position);
lastPreviewRotation = currentRotation;

  // ---------- HIGHLIGHT ----------
  if (
    intersects.length > 0 &&
    intersects[0].object !== ground
  ) {
    highlightedBlock = intersects[0].object;

  // Match size & rotation of hovered block
  highlightMesh.geometry.dispose();
  highlightMesh.geometry = highlightedBlock.geometry.clone();

  highlightMesh.position.copy(highlightedBlock.position);
  highlightMesh.rotation.copy(highlightedBlock.rotation);
  highlightMesh.visible = true;

  } else {
    highlightedBlock = null;
    highlightMesh.visible = false;
  }
});

if (mode !== "build") {
  previewBlock.visible = false;
}

// ---------- HIGHLIGHT BLOCK UNDER MOUSE ----------
let highlightedBlock = null;

const highlightMaterial = new THREE.MeshBasicMaterial({
  color: 0xff0000,
  wireframe: true
});

const highlightMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  highlightMaterial
);

highlightMesh.visible = false;
scene.add(highlightMesh);

// ---------- RIGHT CLICK (DELETE BLOCK) ----------
window.addEventListener("mousedown", (event) => {
  if (isMouseOverUI(event)) return;
  if (event.button !== 2) return;
  if (mode !== "delete") return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(buildables, true);

  if (intersects.length === 0) return;

 let target = intersects[0].object;

// Walk up until we find an object that was actually placed
while (target && !target.userData?.type) {
  target = target.parent;
}
if (target.userData.parentStairs) {
  target = target.userData.parentStairs;
}
  if (target === ground) return;

  if (!target.userData.type) return;

 // ----- RECORD DELETE FOR UNDO -----
deleteBuildable(target);

undoStack.push({
  type: "remove",
  object: target
});
scheduleSave();

redoStack.length = 0;

highlightMesh.visible = false;
});

//------- Placement Function------
function placeBlockAt({
  position,
  rotation,
  override = {}
}) {
  const {
  type = selectedItem.type,
  variant = selectedItem.variant,
  style: overrideStyle = selectedItem.style,
  primaryColor: pColor = primaryColor,
  secondaryColor: sColor = secondaryColor
} = override;


  // 🔁 TEMP swap selectedItem so existing logic still works
  const prev = { ...selectedItem };
  selectedItem.type = type;
selectedItem.variant = variant;
selectedItem.style = overrideStyle;

  // -----------------------------
   let config;
  if (selectedItem.type === "wall") {
    config = components.wall.variants[selectedItem.variant];
  } else if (components[selectedItem.type]?.variants) {
    config = components[selectedItem.type].variants[selectedItem.variant];
  } else {
    config = components[selectedItem.type];
  }

  let material;

if (
  selectedItem.type === "ceiling" &&
  components.ceiling.styles[selectedItem.style]?.type === "woodPanels"
) {

  const texture = components.ceiling.styles[selectedItem.style].texture.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(config.size.x, 1);
  texture.needsUpdate = true;

  material = new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide
  });

}
else if (selectedItem.type === "window") {
  material = glassMaterial.clone();
}
else {
  material = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide
  });
}

  let geometry;

if (config.geometry === "invertedWedge") {
  geometry = createInvertedWedgeGeometry();
}
else if (config.ceiling) {
  geometry = createCeilingGeometry({
    type: config.ceiling.type,
    lengthX: config.size.x,
    zWidth: config.size.z,
    slope: config.ceiling.slope,
    thickness: config.size.y,
    yOffset: -config.size.y
  });
} else if (config.roof) {
  geometry = createRoofGeometry({
    type: config.roof.type,
    lengthX: config.size.x,
    zWidth: config.size.z,
    slope: config.roof.slope,
    thickness: config.size.y,
    yOffset: -config.size.y
  });
} else {
  geometry = new THREE.BoxGeometry(
    config.size.x,
    config.size.y,
    config.size.z
  );
}

  let block;
  
const styleDef = components[selectedItem.type].styles[selectedItem.style];
if (!styleDef) {
  console.warn("Missing style:", selectedItem.type, selectedItem.style);
  return null;
}
const style = styleDef;

// ---- BASEBOARD + WAINSCOTING WALL SUPPORT ----
if (
  (
    selectedItem.type === "indoorWall" ||
    selectedItem.type === "outdoorWall" ||
    selectedItem.type === "ceiling"
  ) &&
  (
    components[selectedItem.type].styles[selectedItem.style]?.type === "baseboard" ||
    components[selectedItem.type].styles[selectedItem.style]?.type === "wainscoting" ||
    components[selectedItem.type].styles[selectedItem.style]?.type === "brick" ||
    components[selectedItem.type].styles[selectedItem.style]?.type === "shiplap" ||
    components[selectedItem.type].styles[selectedItem.style]?.type === "woodPanels"||
    components[selectedItem.type].styles[selectedItem.style]?.type === "shingles"
  )
) {

  const styleDef = components[selectedItem.type].styles[selectedItem.style];

  // ---- SAFETY DEFAULTS (prevents undefined material colors) ----
const safeBrickColor =
  styleDef.brickColor !== undefined ? styleDef.brickColor : 0x888888;

const safeMortarColor =
  style.mortarColor !== undefined ? style.mortarColor : 0xaaaaaa;

  const group = new THREE.Group();
// ---- WOOD PANEL WALL ----
if (selectedItem.type === "indoorWall" && styleDef.type === "woodPanels") {

  const rotDeg = rotationToDeg(rotation);
  const dir = (rotDeg === 0 || rotDeg === 180) ? -1 : 1;

  const panelWidth = 1;
  const panelDepth = 0.2;

  const panelCount = Math.round(config.size.x / panelWidth);

  const panelMaterial = new THREE.MeshStandardMaterial({
    map: styleDef.texture
  });

  for (let i = 0; i < panelCount; i++) {

    const panelGeo = new THREE.BoxGeometry(
      panelWidth,
      config.size.y,
      panelDepth
    );

    const panel = new THREE.Mesh(panelGeo, panelMaterial);

    panel.position.set(
      -config.size.x / 2 + panelWidth / 2 + i * panelWidth,
      0,
      dir * (config.size.z / 2 - panelDepth / 2)
    );

    group.add(panel);
  }

  block = group;
}

  // ---- BRICK WALL ----
if (selectedItem.type === "indoorWall" && styleDef.type === "brick") {

  const rotDeg = rotationToDeg(rotation);

// Swap 90° and 270° orientations
const brickDir =
  (rotDeg === 90 || rotDeg === 270) ? -1 : 1;
const zShift =
  (rotDeg === 90 || rotDeg === 270) ? 0.05 : 0;

  // backing wall
  const mortarDepth = 0.15;

const backingGeo = new THREE.BoxGeometry(
  config.size.x,
  config.size.y,
  mortarDepth
);

  const backingMat = new THREE.MeshStandardMaterial();
  const backing = new THREE.Mesh(backingGeo, backingMat);
  backing.userData.isSecondary = true;
  backing.position.z = -config.size.z / 2 + mortarDepth / 2 + zShift;
group.add(backing);

const gap = Number.isFinite(style.mortarGap) ? style.mortarGap : 0.05;
const bd = 0.2; // actual brick thickness (NOT mortar)
const brickFaceDepth = 0.05;

// One full block unit
const unitX = 1;
const unitY = 1;

// Brick layout per block unit
const bricksPerUnitX = 2; // 2 bricks wide per block
const bricksPerUnitY = 4; // 4 bricks tall per block

// Brick pitch inside ONE block
const pitchX = unitX / bricksPerUnitX;
const pitchY = unitY / bricksPerUnitY;

// Brick size (leave visible mortar)
const bw = pitchX - gap;
const bh = pitchY - gap;
  const brickMat = new THREE.MeshStandardMaterial();
  for (let y = 0; y < config.size.y * bricksPerUnitY; y++) {

    const isStaggered = (y % 2 === 1);
const rowY =
  -config.size.y / 2 + y * pitchY + pitchY / 2;

// ---- LEFT HALF BRICK (STAGGERED ROWS ONLY) ----
if (isStaggered) {
  const halfBrick = new THREE.Mesh(
    new THREE.BoxGeometry(
      (bw / 2) - gap * 0.3,
      bh - gap * 0.6,
      bd
    ),
    brickMat
  );

  halfBrick.position.set(
    -config.size.x / 2 + (bw / 4),
    rowY,
    brickDir * (config.size.z / 2 - brickFaceDepth / 2) + zShift
  );

  group.add(halfBrick);
}

// ---- FULL BRICKS ----
const fullBrickCount = isStaggered
  ? (config.size.x * bricksPerUnitX) - 1
  : (config.size.x * bricksPerUnitX);

for (let x = 0; x < fullBrickCount; x++) {
  const brick = new THREE.Mesh(
    new THREE.BoxGeometry(
      bw - gap * 0.6,
      bh - gap * 0.6,
      bd
    ),
    brickMat
  );

  const startX = isStaggered
    ? -config.size.x / 2 + bw / 2
    : -config.size.x / 2;

  brick.position.set(
    startX + x * pitchX + pitchX / 2,
    rowY,
    brickDir * (config.size.z / 2 - brickFaceDepth / 2) + zShift
  );

  group.add(brick);
}

// ---- RIGHT HALF BRICK (STAGGERED ROWS ONLY) ----
if (isStaggered) {
  const halfBrick = new THREE.Mesh(
    new THREE.BoxGeometry(
      (bw / 2) - gap * 0.3,
      bh - gap * 0.6,
      bd
    ),
    brickMat
  );

  halfBrick.position.set(
    config.size.x / 2 - (bw / 4),
    rowY,
    brickDir * (config.size.z / 2 - brickFaceDepth / 2) + zShift
  );

  group.add(halfBrick);
}
  }

  block = group;
}

  // ---- BRICK WALL 2 ----
if (selectedItem.type === "outdoorWall" && styleDef.type === "brick") {

 const rotDeg = rotationToDeg(rotation);

// Swap 90° and 270° orientations
const brickDir =
  (rotDeg === 180 || rotDeg === 0) ? -1 : 1;
const zShift =
  (rotDeg === 180 || rotDeg === 0) ? 0.05 : 0;

  // backing wall
  const mortarDepth = 0.15;

const backingGeo = new THREE.BoxGeometry(
  config.size.x,
  config.size.y,
  mortarDepth
);

  const backingMat = new THREE.MeshStandardMaterial();
  const backing = new THREE.Mesh(backingGeo, backingMat);
  backing.userData.isSecondary = true;
  backing.position.z = -config.size.z / 2 + mortarDepth / 2 + zShift;
group.add(backing);

const gap = Number.isFinite(style.mortarGap) ? style.mortarGap : 0.05;
const bd = 0.2; // actual brick thickness (NOT mortar)
const brickFaceDepth = 0.05;

// One full block unit
const unitX = 1;
const unitY = 1;

// Brick layout per block unit
const bricksPerUnitX = 2; // 2 bricks wide per block
const bricksPerUnitY = 4; // 4 bricks tall per block

// Brick pitch inside ONE block
const pitchX = unitX / bricksPerUnitX;
const pitchY = unitY / bricksPerUnitY;

// Brick size (leave visible mortar)
const bw = pitchX - gap;
const bh = pitchY - gap;

  const brickMat = new THREE.MeshStandardMaterial();
  for (let y = 0; y < config.size.y * bricksPerUnitY; y++) {

    const isStaggered = (y % 2 === 1);
const rowY =
  -config.size.y / 2 + y * pitchY + pitchY / 2;

// ---- LEFT HALF BRICK (STAGGERED ROWS ONLY) ----
if (isStaggered) {
  const halfBrick = new THREE.Mesh(
    new THREE.BoxGeometry(
      (bw / 2) - gap * 0.3,
      bh - gap * 0.6,
      bd
    ),
    brickMat
  );

  halfBrick.position.set(
    -config.size.x / 2 + (bw / 4),
    rowY,
    brickDir * (config.size.z / 2 - brickFaceDepth / 2) + zShift
  );

  group.add(halfBrick);
}

// ---- FULL BRICKS ----
const fullBrickCount = isStaggered
  ? (config.size.x * bricksPerUnitX) - 1
  : (config.size.x * bricksPerUnitX);

for (let x = 0; x < fullBrickCount; x++) {
  const brick = new THREE.Mesh(
    new THREE.BoxGeometry(
      bw - gap * 0.6,
      bh - gap * 0.6,
      bd
    ),
    brickMat
  );

  const startX = isStaggered
    ? -config.size.x / 2 + bw / 2
    : -config.size.x / 2;

  brick.position.set(
    startX + x * pitchX + pitchX / 2,
    rowY,
    brickDir * (config.size.z / 2 - brickFaceDepth / 2) + zShift
  );

  group.add(brick);
}

// ---- RIGHT HALF BRICK (STAGGERED ROWS ONLY) ----
if (isStaggered) {
  const halfBrick = new THREE.Mesh(
    new THREE.BoxGeometry(
      (bw / 2) - gap * 0.3,
      bh - gap * 0.6,
      bd
    ),
    brickMat
  );

  halfBrick.position.set(
    config.size.x / 2 - (bw / 4),
    rowY,
    brickDir * (config.size.z / 2 - brickFaceDepth / 2) + zShift
  );

  group.add(halfBrick);
}
  }

  block = group;
}

// ---- SHIPLAP WALL ----
if (styleDef.type === "shiplap") {

  const rotDeg = rotationToDeg(rotation);
  const dir = (rotDeg === 0 || rotDeg === 180) ? -1 : 1;

  // backing board
  const backingDepth = 0.12;

  const backingGeo = new THREE.BoxGeometry(
    config.size.x,
    config.size.y,
    backingDepth
  );

  const backingMat = new THREE.MeshStandardMaterial({
  });

  const backing = new THREE.Mesh(backingGeo, backingMat);
  backing.position.z = dir * (-config.size.z / 2 + backingDepth / 2);
  group.add(backing);

  const plankMat = new THREE.MeshStandardMaterial({
  });

  const plankHeight = style.plankHeight;
  const gap = style.plankGap;
  const thickness = style.plankThickness;
  const slant = style.slant;

  const plankCount = Math.floor(config.size.y / plankHeight);

  for (let i = 0; i < plankCount; i++) {

    const plankGeo = new THREE.BoxGeometry(
      config.size.x,
      plankHeight - gap,
      thickness
    );

    const plank = new THREE.Mesh(plankGeo, plankMat);

    const y =
      -config.size.y / 2 +
      i * plankHeight +
      plankHeight / 2;

    plank.position.set(
      0,
      y,
      dir * (config.size.z / 2 - thickness / 2)
    );

    plank.rotation.x = slant * dir;

    group.add(plank);
  }

  block = group;
}

// ---- SHINGLE WALL (OUTDOOR) ----
if (selectedItem.type === "outdoorWall" && styleDef.type === "shingles") {

  const rotDeg = rotationToDeg(rotation);
  const dir = (rotDeg === 0 || rotDeg === 180) ? -1 : 1;

  const backingDepth = 0.12;

  // ---- BACKING WALL ----
  const backingGeo = new THREE.BoxGeometry(
    config.size.x,
    config.size.y,
    backingDepth
  );

  const backingMat = new THREE.MeshStandardMaterial({
  });

  const backing = new THREE.Mesh(backingGeo, backingMat);
  backing.userData.isSecondary = true;
  backing.position.z = dir * (-config.size.z / 2 + backingDepth / 2);
  group.add(backing);

  // ---- SHINGLE MATERIAL ----
  const shingleMat = new THREE.MeshStandardMaterial({
  });

  const shingleHeight =
  config.size.y === 1
    ? 0.3333
    : styleDef.shingleHeight;
  const overlap = style.shingleOverlap;
  const thickness = style.shingleThickness;
  const shingleSlant = style.shingleSlant ?? -0.15; // radians, subtle tilt

  const pitch = shingleHeight - overlap;
  const rowCount = Math.ceil(config.size.y / pitch);

  // ---- SHINGLE ROWS (TRUE SHINGLE LOOK) ----
const shingleWidth = 0.25;

const wallTopY = config.size.y / 2;

for (let row = 0; row < rowCount; row++) {

  const baseY =
    -config.size.y / 2 +
    row * pitch;

  // stop once we are fully above wall
  if (baseY >= wallTopY) break;

  const visibleHeight = Math.min(
    shingleHeight,
    wallTopY - baseY
  );

  if (visibleHeight <= 0.01) continue;

  const yCenter = baseY + visibleHeight / 2;
  const isStaggeredRow = (row % 2 === 1);

  // ---- LEFT HALF SHINGLE (STAGGERED ROWS ONLY) ----
  if (isStaggeredRow) {

    const halfWidth = shingleWidth * 0.5;

    const halfGeo = new THREE.BoxGeometry(
      halfWidth * 0.95,
      visibleHeight,
      thickness
    );
applyVerticalGradient(halfGeo, style.shingleColor);

    const half = new THREE.Mesh(halfGeo, shingleMat);

    half.position.set(
      -config.size.x / 2 + halfWidth / 2 - 0.005,
      yCenter,
      dir * (config.size.z / 2 - thickness / 2)
    );

    half.rotation.x = shingleSlant * dir;
    group.add(half);
  }

  // ---- FULL SHINGLES ----
  const fullCount = isStaggeredRow
    ? Math.floor(config.size.x / shingleWidth) - 1
    : Math.floor(config.size.x / shingleWidth);

  for (let col = 0; col < fullCount; col++) {

    const startX = isStaggeredRow
      ? -config.size.x / 2 + shingleWidth / 2
      : -config.size.x / 2;

    const x =
      startX +
      col * shingleWidth +
      shingleWidth / 2;

    const shingleGeo = new THREE.BoxGeometry(
      shingleWidth * 0.95,
      visibleHeight,
      thickness
    );
applyVerticalGradient(shingleGeo, style.shingleColor);

    const shingle = new THREE.Mesh(shingleGeo, shingleMat);

    shingle.position.set(
      x,
      yCenter,
      dir * (config.size.z / 2 - thickness / 2)
    );

    shingle.rotation.x = shingleSlant * dir;
    group.add(shingle);
  }

  // ---- RIGHT HALF SHINGLE (STAGGERED ROWS ONLY) ----
  if (isStaggeredRow) {

    const halfWidth = shingleWidth * 0.5;

    const halfGeo = new THREE.BoxGeometry(
      halfWidth * 0.95,
      visibleHeight,
      thickness
    );
applyVerticalGradient(halfGeo, style.shingleColor);

    const half = new THREE.Mesh(halfGeo, shingleMat);

    half.position.set(
      config.size.x / 2 - halfWidth / 2 + 0.005,
      yCenter,
      dir * (config.size.z / 2 - thickness / 2)
    );

    half.rotation.x = shingleSlant * dir;
    group.add(half);
  }
}

  block = group;
}

  //--- DEFAULT SOLID WALL (with optional texture) ----
if (
  styleDef.type !== "brick" &&
  styleDef.type !== "shiplap" &&
  styleDef.type !== "woodPanels" &&
  styleDef.type !== "shingles"
) {
  const wallGeo = new THREE.BoxGeometry(
    config.size.x,
    config.size.y,
    config.size.z
  );
  const wallMat = new THREE.MeshStandardMaterial({
  map: styleDef.texture ?? null
});
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.y = 0;
  group.add(wallMesh);
}
// ---- BASEBOARD ----
  // Baseboard
  let bbHeight;

// normal baseboard
if (styleDef.type === "baseboard") {
  bbHeight = style.baseboardHeight;
}
// wainscoting
else if (styleDef.type === "wainscoting") {
  if (config.size.y === 1) {
    bbHeight = 1;   // 2x1x0.2 wall takes full height
  } else {
    bbHeight = 2;   // all other variants use height 2
  }
}
  const bbDepth =
  config.size.z *
  (Number.isFinite(style.baseboardDepthMult) ? style.baseboardDepthMult : 1);

  const bbGeo = new THREE.BoxGeometry(
    config.size.x,
    bbHeight,
    bbDepth
  );
  const bbMat = new THREE.MeshStandardMaterial();
  const bbMesh = new THREE.Mesh(bbGeo, bbMat);
  bbMesh.userData.isSecondary = true;
 bbMesh.position.y = -(config.size.y / 2) + (bbHeight / 2);

const rotDeg = rotationToDeg(rotation);
const push = (bbDepth - config.size.z) / 2;

if (selectedItem.type === "outdoorWall") {
if (rotDeg === 90) {
  bbMesh.position.x = push - 0.05;
  bbMesh.position.z = 0.05;
} 
else if (rotDeg === 270) {
  bbMesh.position.x = push - 0.05;
  bbMesh.position.z = 0.05;
} 
else if (rotDeg === 180) {
  bbMesh.position.z = -push;
} 
else {
  // 0 degrees
  bbMesh.position.z = -push;
}

  group.add(bbMesh);

  block = group;
} else {
if (rotDeg === 90) {
  bbMesh.position.x = push - 0.05;
  bbMesh.position.z = -0.05;
} 
else if (rotDeg === 270) {
  bbMesh.position.x = push - 0.05;
  bbMesh.position.z = -0.05;
} 
else if (rotDeg === 180) {
  bbMesh.position.z = push;
} 
else {
  // 0 degrees
  bbMesh.position.z = push;
}

  group.add(bbMesh);

  block = group;
}

// ---- FRAMED WINDOW ----
} else if (
  (style?.type === "framedWindow" || style?.type === "framedWindow3x2") &&
  config.size.x === 2 &&
  config.size.y === 3
) {

  const group = new THREE.Group();

  // Depths
  const frameDepth = 0.5;
  const paneDepth = 0.06;

  // Trim sizes
  const casing = 0.15;
  const headHeight = 0.25;
  const stoolHeight = 0.25;

  const frameMat = new THREE.MeshStandardMaterial({
  });

  // ---- CASING ----
  const left = new THREE.Mesh(
    new THREE.BoxGeometry(casing, 3, frameDepth),
    frameMat
  );
  left.position.x = -1 + casing / 2;

  const right = left.clone();
  right.position.x = 1 - casing / 2;

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(2, headHeight, frameDepth),
    frameMat
  );
  head.position.y = 1.5 - headHeight / 2;

  const stool = new THREE.Mesh(
    new THREE.BoxGeometry(2, stoolHeight, frameDepth),
    frameMat
  );
  stool.position.y = -1.5 + stoolHeight / 2;

  group.add(left, right, head, stool);

  const openingWidth = 2 - casing * 2;
const openingHeight = 3 - headHeight - stoolHeight;

// ---- SASH / MULLION SETTINGS ----
const sashConfig =
  styleDef.type === "framedWindow3x2"
    ? {
        verticalXs:   [0, 0.57, 1.13, 1.7],
        horizontalYs: [0, 1.25, 2.5],
        verticalThickness: 0.06,
        horizontalThickness: 0.12
      }
    : {
        verticalXs:   [0, 0.425, 0.85, 1.275, 1.7],
        horizontalYs: [0, 0.8375, 1.67, 2.5],
        verticalThickness: 0.05,
        horizontalThickness: 0.1
      };
const sashDepth = 0.15;      // front-back thickness
const sashInsetZ = 0.01;    // slight offset from glass
const sashMat = new THREE.MeshStandardMaterial({
});
// ---- HORIZONTAL SASHES ----
sashConfig.horizontalYs.forEach(y => {
  const hSash = new THREE.Mesh(
    new THREE.BoxGeometry(openingWidth, sashConfig.horizontalThickness, sashDepth),
    sashMat
  );

  hSash.position.set(
    0,
    -openingHeight / 2 + y,
    sashInsetZ
  );

  group.add(hSash);
});
// ---- VERTICAL SASHES ----
sashConfig.verticalXs.forEach(x => {
  const vSash = new THREE.Mesh(
    new THREE.BoxGeometry(sashConfig.verticalThickness, openingHeight, sashDepth),
    sashMat
  );

  vSash.position.set(
    -openingWidth / 2 + x,
    0,
    sashInsetZ
  );

  group.add(vSash);
});

  // ---- GLASS PANES ----
  let panesX, panesY;

if (styleDef.type === "framedWindow3x2") {
  panesX = 3;
  panesY = 2;
} else {
  panesX = 4;
  panesY = 3;
}

  const paneW = openingWidth / panesX;
const paneH = openingHeight / panesY;

 const glassMat = new THREE.MeshPhysicalMaterial({
  color: style.glassColor,
  transmission: 1,
  opacity: 1,
  transparent: true,
  roughness: 0,
  metalness: 0,
  thickness: 0.05,
  ior: 1.45,
  depthWrite: false,
  side: THREE.DoubleSide
});

  for (let ix = 0; ix < panesX; ix++) {
    for (let iy = 0; iy < panesY; iy++) {
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(paneW * 0.9, paneH * 0.9, paneDepth),
        glassMat
      );

      pane.position.x =
  -openingWidth / 2 + paneW / 2 + ix * paneW;
pane.position.y =
  -openingHeight / 2 + paneH / 2 + iy * paneH;
      pane.position.z = 0;
      pane.renderOrder = 10;

      group.add(pane);
    }
  }

  block = group;
}
// ---- SIMPLE FRAMED WINDOW (ANY SIZE) ----
else if (
  selectedItem.type === "window" &&
  style?.type === "simpleFramedWindow"
) {
  const group = new THREE.Group();

  // ---- DEPTHS ----
  const frameDepth = 0.5;
  const glassDepth = 0.04;

  // ---- FRAME SIZES ----
const casing = 0.15;

let headHeight;
let stoolHeight;

if (config.size.x === 1 && config.size.y === 1) {
  // small window variant (1x1x0.5)
  headHeight = 0.15;
  stoolHeight = 0.15;
} else {
  // default for all other sizes
  headHeight = 0.25;
  stoolHeight = 0.25;
}

  const frameMat = new THREE.MeshStandardMaterial({
  });

  // ---- FRAME PIECES ----

  // Left
  const left = new THREE.Mesh(
    new THREE.BoxGeometry(casing, config.size.y, frameDepth),
    frameMat
  );
  left.position.x = -config.size.x / 2 + casing / 2;
  group.add(left);

  // Right
  const right = left.clone();
  right.position.x = config.size.x / 2 - casing / 2;
  group.add(right);

  // Top (head)
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(config.size.x, headHeight, frameDepth),
    frameMat
  );
  head.position.y = config.size.y / 2 - headHeight / 2;
  group.add(head);

  // Bottom (stool)
  const stool = new THREE.Mesh(
    new THREE.BoxGeometry(config.size.x, stoolHeight, frameDepth),
    frameMat
  );
  stool.position.y = -config.size.y / 2 + stoolHeight / 2;
  group.add(stool);

  // ---- CLEAR OPENING ----
  const openingWidth = config.size.x - casing * 2;
  const openingHeight = config.size.y - headHeight - stoolHeight;

  // ---- GLASS ----
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: style.glassColor,
    transmission: 1,
    transparent: true,
    opacity: 1,
    roughness: 0,
    metalness: 0,
    thickness: 0.05,
    ior: 1.45,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(openingWidth, openingHeight, glassDepth),
    glassMat
  );

  glass.position.z = 0;
  glass.renderOrder = 10;
  glass.castShadow = false;
  glass.receiveShadow = false;

  group.add(glass);

  block = group;
}

 // ---- FRAMED DOOR (REPLACES DEFAULT) ----
 else if (selectedItem.type === "door") {

  const group = new THREE.Group();

  // Dimensions
  const doorDepth = 0.2;
  const frameDepth = 0.5;

  const frameThickness = 0.15;
  const headHeight = 0.25;

  // ---- DOOR SLAB ----
  const doorGeo = new THREE.BoxGeometry(
    config.size.x - 0.2,
    config.size.y - 0.2,
    doorDepth
  );
  const doorMat = new THREE.MeshStandardMaterial();
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.userData.isSecondary = true;
  door.position.y = 0;
  group.add(door);

  const frameMat = new THREE.MeshStandardMaterial();

  // ---- LEFT FRAME ----
  const left = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, config.size.y, frameDepth),
    frameMat
  );
  left.position.x = -config.size.x / 2 + frameThickness / 2;
  group.add(left);

  // ---- RIGHT FRAME ----
  const right = left.clone();
  right.position.x = config.size.x / 2 - frameThickness / 2;
  group.add(right);

  // ---- TOP FRAME (HEAD) ----
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(config.size.x, headHeight, frameDepth),
    frameMat
  );
  head.position.y = config.size.y / 2 - headHeight / 2;
  group.add(head);

  block = group;
}

// ---- BRICK FLOOR ----
else if (
  selectedItem.type === "floor" &&
  components.floor.styles[selectedItem.style]?.type === "brick"
) {

  const style = components.floor.styles[selectedItem.style];

  const safeBrickColor =
    styleDef.brickColor !== undefined ? styleDef.brickColor : 0x888888;

  const safeMortarColor =
    style.mortarColor !== undefined ? style.mortarColor : 0xaaaaaa;

  const group = new THREE.Group();

  // ---- MORTAR BASE ----
  const mortarHeight = 0.025;

  const mortarGeo = new THREE.BoxGeometry(
    config.size.x,
    mortarHeight,
    config.size.z
  );

  const mortarMat = new THREE.MeshStandardMaterial({
  });

  const mortar = new THREE.Mesh(mortarGeo, mortarMat);
  mortar.userData.isSecondary = true;
  mortar.position.y = -config.size.y / 2 + mortarHeight / 2;
  group.add(mortar);

  // ---- BRICK SETTINGS ----
  const gap = Number.isFinite(style.mortarGap) ? style.mortarGap : 0.05;

  const brickHeight = 0.05;

  const unitX = 1;
  const unitZ = 1;

  const bricksPerUnitX = 2;
  const bricksPerUnitZ = 4;

  const pitchX = unitX / bricksPerUnitX;
  const pitchZ = unitZ / bricksPerUnitZ;

  const bw = pitchX - gap;
  const bd = pitchZ - gap;

  const brickMat = new THREE.MeshStandardMaterial({
  });

  // ---- BRICK LOOP ----
  for (let z = 0; z < config.size.z * bricksPerUnitZ; z++) {

    const isStaggered = (z % 2 === 1);

    const rowZ =
      -config.size.z / 2 + z * pitchZ + pitchZ / 2;

    // ---- LEFT HALF BRICK (STAGGERED ROWS) ----
    if (isStaggered) {
      const halfBrick = new THREE.Mesh(
        new THREE.BoxGeometry(
          bw / 2 - gap * 0.3,
          brickHeight,
          bd - gap * 0.6
        ),
        brickMat
      );

      halfBrick.position.set(
        -config.size.x / 2 + bw / 4,
        -config.size.y / 2 + mortarHeight + brickHeight / 2,
        rowZ
      );

      group.add(halfBrick);
    }

    // ---- FULL BRICKS ----
    const fullBrickCount = isStaggered
      ? (config.size.x * bricksPerUnitX) - 1
      : (config.size.x * bricksPerUnitX);

    for (let x = 0; x < fullBrickCount; x++) {

      const brick = new THREE.Mesh(
        new THREE.BoxGeometry(
          bw - gap * 0.6,
          brickHeight,
          bd - gap * 0.6
        ),
        brickMat
      );

      const startX = isStaggered
        ? -config.size.x / 2 + bw / 2
        : -config.size.x / 2;

      brick.position.set(
        startX + x * pitchX + pitchX / 2,
        -config.size.y / 2 + mortarHeight + brickHeight / 2,
        rowZ
      );

      group.add(brick);
    }

    // ---- RIGHT HALF BRICK (STAGGERED ROWS) ----
    if (isStaggered) {
      const halfBrick = new THREE.Mesh(
        new THREE.BoxGeometry(
          bw / 2 - gap * 0.3,
          brickHeight,
          bd - gap * 0.6
        ),
        brickMat
      );

      halfBrick.position.set(
        config.size.x / 2 - bw / 4,
        -config.size.y / 2 + mortarHeight + brickHeight / 2,
        rowZ
      );

      group.add(halfBrick);
    }
  }

  block = group;
}
// ---- TILE FLOOR ----
else if (
  selectedItem.type === "floor" &&
  components.floor.styles[selectedItem.style]?.type === "tile"
) {

  const style = components.floor.styles[selectedItem.style];

  const safeTileColor =
    style.tileColor !== undefined ? style.tileColor : 0xdddddd;

  const safeGroutColor =
    style.groutColor !== undefined ? style.groutColor : 0xaaaaaa;

  const group = new THREE.Group();

  // ---- GROUT BASE ----
  const groutHeight = 0.02;

  const groutGeo = new THREE.BoxGeometry(
    config.size.x,
    groutHeight,
    config.size.z
  );

  const groutMat = new THREE.MeshStandardMaterial({
    roughness: 0.9
  });

  const grout = new THREE.Mesh(groutGeo, groutMat);
  grout.userData.isSecondary = true;
  grout.position.y = -config.size.y / 2 + groutHeight / 2;
  group.add(grout);

  // ---- TILE SETTINGS (BRICK-STYLE LOGIC) ----
  const gap = Number.isFinite(style.groutGap) ? style.groutGap : 0.08;

  const tileHeight = 0.04;

  const unitX = 1;
  const unitZ = 1;

 // Square tiles
const tilesPerUnitX = 1;
const tilesPerUnitZ = 2;

  const pitchX = unitX / tilesPerUnitX;
  const pitchZ = unitZ / tilesPerUnitZ;

  const tw = pitchX - gap;
  const td = pitchZ - gap;

  const tileMat = new THREE.MeshStandardMaterial({
  roughness: 0.15,
  metalness: 0.0
});

  const rowY =
    -config.size.y / 2 + groutHeight + tileHeight / 2;

  // ---- TILE LOOP (MATCHES BRICK LOGIC) ----
  for (let z = 0; z < config.size.z * tilesPerUnitZ; z++) {

    const isStaggered = (z % 2 === 1);

    const rowZ =
      -config.size.z / 2 + z * pitchZ + pitchZ / 2;

    // ---- LEFT HALF TILE (STAGGERED ROWS) ----
    if (isStaggered) {
      const halfTile = new THREE.Mesh(
        new THREE.BoxGeometry(
          (tw / 2) - gap * 0.6,
          tileHeight,
          td - gap * 0.6
        ),
        tileMat
      );

      halfTile.position.set(
        -config.size.x / 2 + tw / 4,
        rowY,
        rowZ
      );

      group.add(halfTile);
    }

    // ---- FULL TILES ----
    const fullTileCount = isStaggered
      ? Math.max((config.size.x * tilesPerUnitX) - 1, 0)
      : (config.size.x * tilesPerUnitX);

    for (let x = 0; x < fullTileCount; x++) {

      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(
          tw - gap * 0.6,
          tileHeight,
          td - gap * 0.6
        ),
        tileMat
      );

      const startX = isStaggered
        ? -config.size.x / 2 + tw / 2
        : -config.size.x / 2;

      tile.position.set(
        startX + x * pitchX + pitchX / 2,
        rowY,
        rowZ
      );

      group.add(tile);
    }

    // ---- RIGHT HALF TILE (STAGGERED ROWS) ----
    if (isStaggered) {
      const halfTile = new THREE.Mesh(
        new THREE.BoxGeometry(
          (tw / 2) - gap * 0.6,
          tileHeight,
          td - gap * 0.6
        ),
        tileMat
      );

      halfTile.position.set(
        config.size.x / 2 - tw / 4,
        rowY,
        rowZ
      );

      group.add(halfTile);
    }
  }

  block = group;
}
// ---- WOOD PLANK FLOOR ----
else if (
  selectedItem.type === "floor" &&
  components.floor.styles[selectedItem.style]?.type === "wood"
) {

  const style = components.floor.styles[selectedItem.style];
  const group = new THREE.Group();

  // ---- PLANK SETTINGS ----
  const plankHeight = 0.04;

  const planksPerUnitX = 1; // 1 unit long
  const planksPerUnitZ = 4; // 4 planks per z-unit

  const pitchX = 1 / planksPerUnitX;
  const pitchZ = 1 / planksPerUnitZ;

  const pw = pitchX; // NO gaps
  const pd = pitchZ;

  // ---- TEXTURE ----
  const texture = styleDef.texture;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);

  // ---- MATERIALS ----

// Full plank (normal)
const fullTexture = texture.clone();
fullTexture.needsUpdate = true;

const fullPlankMat = new THREE.MeshStandardMaterial({
  map: fullTexture
});

// Left half plank → FIRST HALF of texture
const leftHalfTexture = texture.clone();
leftHalfTexture.repeat.set(0.5, 1);
leftHalfTexture.offset.set(0, 0);
leftHalfTexture.needsUpdate = true;

const leftHalfMat = new THREE.MeshStandardMaterial({
  map: leftHalfTexture
});

// Right half plank → SECOND HALF of texture
const rightHalfTexture = texture.clone();
rightHalfTexture.repeat.set(0.5, 1);
rightHalfTexture.offset.set(0.5, 0);
rightHalfTexture.needsUpdate = true;

const rightHalfMat = new THREE.MeshStandardMaterial({
  map: rightHalfTexture
});

  // ---- PLANK GRID ----
  for (let z = 0; z < config.size.z * planksPerUnitZ; z++) {

    const isStaggered = (z % 2 === 1);

    const rowZ =
      -config.size.z / 2 + z * pitchZ + pitchZ / 2;

    // ---- LEFT HALF PLANK (STAGGERED ROWS) ----
if (isStaggered) {
  const halfPlank = new THREE.Mesh(
    new THREE.BoxGeometry(
      pw / 2,
      plankHeight,
      pd
    ),
rightHalfMat
);

  halfPlank.position.set(
    -config.size.x / 2 + pw / 4,
    -config.size.y / 2 + plankHeight / 2,
    rowZ
  );

  group.add(halfPlank);
}

    // ---- FULL PLANKS ----
    const fullPlankCount = isStaggered
  ? (config.size.x * planksPerUnitX) - 1
  : (config.size.x * planksPerUnitX);

for (let x = 0; x < fullPlankCount; x++) {

      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(
          pw,
          plankHeight,
          pd
       ),
fullPlankMat
);

      const startX = isStaggered
  ? -config.size.x / 2 + pw / 2
  : -config.size.x / 2;

plank.position.set(
  startX + x * pitchX + pitchX / 2,
  -config.size.y / 2 + plankHeight / 2,
  rowZ
);

      group.add(plank);
    }
    // ---- RIGHT HALF PLANK (STAGGERED ROWS) ----
if (isStaggered) {
  const halfPlank = new THREE.Mesh(
    new THREE.BoxGeometry(
      pw / 2,
      plankHeight,
      pd
    ),
leftHalfMat
);

  halfPlank.position.set(
    config.size.x / 2 - pw / 4,
    -config.size.y / 2 + plankHeight / 2,
    rowZ
  );

  group.add(halfPlank);
}
  }

  block = group;
}

// ---- NORMAL BLOCK ----
else {
  block = new THREE.Mesh(geometry.clone(), material);
}

  // Copy last valid preview position
 block.position.copy(position);
  block.rotation.set(0, rotation, 0);

block.userData.type = selectedItem.type;
block.userData.style = selectedItem.style;
block.userData.height = config.size.y;
block.userData.wallSlot = true;
block.userData.category = "opening";
block.userData.primaryColor = pColor ?? primaryColor;
block.userData.secondaryColor = sColor ?? secondaryColor;

  scene.add(block);
  buildables.push(block);

Object.assign(block.userData, {
  type,
  variant,
  style: overrideStyle,
});

  block.userData.variant = selectedItem.variant;

block.userData.size = {
  x: config.size.x,
  z: config.size.z
};

  undoStack.push({ type: "add", object: block });
  // -----------------------------

  block.position.copy(position);
  block.rotation.set(0, rotation, 0);

 redoStack.length = 0;

  // 🔁 restore selectedItem
  Object.assign(selectedItem, prev);

  applyColorsToObject(
  block,
  block.userData.primaryColor,
  block.userData.secondaryColor
);

  return block;
}

// ---------- CLICK (PLACE BLOCK) ----------
window.addEventListener("pointerup", (event) => {
  pointerDown = false;
  if (pointerMoved) return;
  if (isMouseOverUI(event)) return;
  if (mode !== "build") return;

  // ---- Handle stairs separately ----
  if (selectedItem.type === "stairs") {
    if (!previewStairs || !previewStairs.visible) return;

const stairStyle = selectedItem.style || "default";

const material =
  components.stairs.styles[stairStyle]?.type === "glass"
    ? glassMaterial.clone()
    : new THREE.MeshStandardMaterial();

const stair = createStairMesh(
  selectedItem.variant,
  material,
  stairStyle
);

    stair.position.copy(previewStairs.position);
    stair.rotation.copy(previewStairs.rotation);

    stair.userData.type = "stairs";
stair.userData.variant = selectedItem.variant; // ⭐ ADD THIS LINE
stair.userData.category = "structure";
stair.userData.height = STORY_HEIGHT;
stair.userData.stackable = true;
stair.userData.style = stairStyle;
stair.userData.primaryColor = primaryColor;
stair.userData.secondaryColor = secondaryColor;

    scene.add(stair);
    buildables.push(stair);

    undoStack.push({ type: "add", object: stair });
    redoStack.length = 0;
    scheduleSave();
    return;
  }

 placeBlockAt({
    position: lastPreviewPosition.clone(),
    rotation: lastPreviewRotation
  });
  scheduleSave();
});

//------- LOAD HELPER ------
function createBlockFromData({
  type,
  variant,
  style,
  position,
  rotation,
  primaryColor,
  secondaryColor
}) {
  selectedItem.type = type;
  selectedItem.variant = variant;
  selectedItem.style = style;

  window.primaryColor = primaryColor ?? "#cccccc";
  window.secondaryColor = secondaryColor ?? "#888888";

  updatePreviewGeometry();

  placeBlockAt({
    position: new THREE.Vector3(position.x, position.y, position.z),
    rotation: rotation || 0,
    override: {
      type,
      variant,
      style,
      primaryColor,
      secondaryColor
    }
  });
}
function createStairFromData({
  variant,
  style = "default",
  position,
  rotation,
  primaryColor,
  secondaryColor
}) {
  const stairStyle = style || "default";

  const material =
    components.stairs.styles[stairStyle]?.type === "glass"
      ? glassMaterial.clone()
      : new THREE.MeshStandardMaterial();

  const stair = createStairMesh(
    variant,
    material,
    stairStyle
  );

  stair.position.set(position.x, position.y, position.z);
  stair.rotation.set(0, rotation || 0, 0);

  stair.userData = {
    type: "stairs",
    variant,
    style: stairStyle,
    category: "structure",
    height: STORY_HEIGHT,
    stackable: true,
    primaryColor,
    secondaryColor
  };

  scene.add(stair);
  buildables.push(stair);
}

// ---------- COLOR BUTTONS ----------
const colorButtons = document.querySelectorAll(".color-btn");

colorButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    colorButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    currentColor = new THREE.Color(btn.dataset.color);
  });
});

//---------- MODE BUTTONS ----------
const buildBtn = document.getElementById("build-mode");
const deleteBtn = document.getElementById("delete-mode");

function setMode(newMode) {
  mode = newMode;

  buildBtn.classList.toggle("active", mode === "build");
  deleteBtn.classList.toggle("active", mode === "delete");
}

buildBtn.addEventListener("click", () => setMode("build"));
deleteBtn.addEventListener("click", () => setMode("delete"));

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "b") setMode("build");
  if (event.key.toLowerCase() === "d") setMode("delete");
});
window.addEventListener("keydown", (e) => {
  if (e.key === "1") {
    selectedItem.type = "floor";
    selectedItem.style = "concrete";
  }
  if (e.key === "2") {
    selectedItem.type = "wall";
    selectedItem.variant = "1x5";
    selectedItem.style = "drywall";
  }
  if (e.key === "3") {
    selectedItem.type = "window";
    selectedItem.variant = "1x1";
    selectedItem.style = "default";
  }
  if (e.key === "4") {
    selectedItem.type = "door";
    selectedItem.style = "default";
  }
  if (e.key === "5") {
    selectedItem.type = "stairs";
    selectedItem.style = "default";
  }
  if (e.key === "6") {
    selectedItem.type = "roof";
    selectedItem.style = "shingles";
  }
if (e.key === "7") {
  selectedItem.type = "ceiling";
  selectedItem.variant = "1x1";
  selectedItem.style = "drywall";
}
  updatePreviewGeometry();
});

// ---------- ROTATE BLOCK (R) ----------
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") {
    currentRotation += Math.PI / 2;
    if (currentRotation >= Math.PI * 2) currentRotation = 0;

    previewBlock.rotation.y = currentRotation;
  }
});

// ---------- KEYBOARD SAVE / LOAD ----------
window.addEventListener("keydown", (e) => {
  // S key → Save
  if (e.key.toLowerCase() === "s") {
    document.getElementById("save-btn").click();
  }

  // L key → Load
  if (e.key.toLowerCase() === "l") {
    document.getElementById("load-btn").click();
  }
});

// ---------- UNDO (CTRL + Z) ----------
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "z") {
    const action = undoStack.pop();
    if (!action) return;

    if (action.type === "add") {
      deleteBuildable(action.object);
      buildables.splice(buildables.indexOf(action.object), 1);
    }

    if (action.type === "remove") {
      scene.add(action.object);
      buildables.push(action.object);
    }

    redoStack.push(action);
  }
  scheduleSave();
});

// ---------- REDO (CTRL + Y) ----------
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "y") {
    const action = redoStack.pop();
    if (!action) return;

    if (action.type === "add") {
      scene.add(action.object);
      buildables.push(action.object);
    }

    if (action.type === "remove") {
      deleteBuildable(action.object);
      buildables.splice(buildables.indexOf(action.object), 1);
    }

        undoStack.push(action);
  }
  scheduleSave();
});

// ---------- STORY CONTROLS ----------
window.addEventListener("keydown", (e) => {
  if (e.key === "]") {
    currentStory++;
    scheduleSave();
    console.log("Story:", currentStory);
  }

  if (e.key === "[" && currentStory > 0) {
    currentStory--;
    scheduleSave();
    console.log("Story:", currentStory);
  }
});

// ---------- CEILING HEIGHT ADJUSTMENT ----------
window.addEventListener("keydown", (e) => {
  if (selectedItem.type !== "ceiling") return;

  if (e.key === "ArrowUp") {
    ceilingHeightOffset += 0.5; // quarter-meter steps
  }

  if (e.key === "ArrowDown") {
    ceilingHeightOffset = Math.max(0, ceilingHeightOffset - 0.5);
  }

  updatePreviewGeometry();
});

// ---------- ROOF HEIGHT ADJUSTMENT ----------
window.addEventListener("keydown", (e) => {
  if (selectedItem.type !== "roof") return;

  if (e.key === "ArrowUp") {
    roofHeightOffset += 0.5; // quarter-meter steps
  }

  if (e.key === "ArrowDown") {
    roofHeightOffset = Math.max(0, roofHeightOffset - 0.5);
  }

  updatePreviewGeometry();
});

//` ---------- OTHER ADJUSTMENT ----------
window.addEventListener("keydown", (e) => {
  if (!previewBlock || !previewBlock.visible) return;

  const step = 0.5; // vertical snap increment

  if (e.key === "ArrowUp") {
    verticalPlacementOffset += step;
  }

  if (e.key === "ArrowDown") {
    verticalPlacementOffset -= step;
  }

  updatePreviewGeometry(); // forces re-evaluation
});

//------ COPY AND PASTE POINT------

// ---------- CREATE BLOCK THUMBNAIL ----------
function createBlockThumbnailFixed(size) {
  const thumbScene = new THREE.Scene();
  const thumbCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);

  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  let geometry;

  if (size.geometry === "invertedWedge") {
    geometry = createInvertedWedgeGeometry();
  } else if (size.geometry === "roofWedge") {
    geometry = createRoofWedgeGeometry();
  } else {
    geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  }

  const mesh = new THREE.Mesh(geometry, material);
  thumbScene.add(mesh);

  // Lights
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(1, 1, 1);
  thumbScene.add(light);
  thumbScene.add(new THREE.AmbientLight(0xffffff, 0.5));

  // --- CENTER THE BLOCK ---
  const centerX = size.x / 2;
  const centerY = size.y / 2;
  const centerZ = size.z / 2;

  // --- CAMERA DISTANCE FIX ---
  // Use a fixed scaling factor for all thumbnails to normalize visual size
  const distance = 3;  // fixed distance so all buttons look the same

  const angleXZ = Math.PI / 4; // 45° around Y axis
  const angleY = Math.PI / 6;  // 30° above

  thumbCamera.position.set(
    centerX + distance * Math.cos(angleY) * Math.cos(angleXZ),
    centerY + distance * Math.sin(angleY),
    centerZ + distance * Math.cos(angleY) * Math.sin(angleXZ)
  );

  thumbCamera.lookAt(centerX, centerY, centerZ);

  thumbRenderer.render(thumbScene, thumbCamera);

  const img = document.createElement("img");
  img.src = thumbRenderer.domElement.toDataURL();
  img.width = 48;
  img.height = 48;

  return img;
}

// ---------- CREATE STAIR THUMBNAIL ----------
function createStairThumbnail(variantKey) {
  const thumbScene = new THREE.Scene();
  const thumbCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
thumbRenderer.render(thumbScene, thumbCamera);

  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const stairs = createStairMesh(variantKey, material);
  thumbScene.add(stairs);

  // lights
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(2, 3, 2);
  thumbScene.add(light);
  thumbScene.add(new THREE.AmbientLight(0xffffff, 0.5));

  // center camera based on variant size
  const cfg = components.stairs.variants[variantKey];
  const height = cfg.blocks === 1 ? 1 : STORY_HEIGHT;
  const depth = cfg.blocks;

  const center = new THREE.Vector3(0.5, height / 2, depth / 2);
  const distance = Math.max(height, depth) * 1.8;

  thumbCamera.position.set(
    center.x + distance,
    center.y + distance * 0.6,
    center.z + distance
  );

  thumbCamera.lookAt(center);

  thumbRenderer.render(thumbScene, thumbCamera);

  const img = document.createElement("img");
  img.src = thumbRenderer.domElement.toDataURL();
  img.width = 48;
  img.height = 48;

  return img;
}

// ---------- BUILD INDOOR WALL VARIANTS ----------
function buildIndoorWallVariantsUI() {
  const container = document.getElementById("indoor-wall-items");
  container.innerHTML = "";

  Object.entries(components.indoorWall.variants).forEach(([variant, data]) => {
    const btn = document.createElement("button");
    btn.className = "tool-item";
    btn.style.display = "flex";
    btn.style.flexDirection = "column";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "2px";

    const thumb = createBlockThumbnailFixed(data.size);
    btn.appendChild(thumb);

    const label = document.createElement("span");
    label.innerText = variant;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
      container.querySelectorAll(".tool-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      selectedItem.type = "indoorWall";
      selectedItem.variant = variant;
const BRICK_TREAD_HEIGHT = 0.1;
const BRICK_MORTAR_HEIGHT = 0.025;
const BRICK_UNIT_HEIGHT = 0.05;

      if (!components.indoorWall.styles[selectedItem.style]) {
        selectedItem.style = Object.keys(components.indoorWall.styles)[0];
      }

      buildIndoorWallStylesUI();
      updatePreviewGeometry();
    };

    container.appendChild(btn);
  });
}

// ---------- BUILD OUTDOOR WALL VARIANTS ----------
function buildOutdoorWallVariantsUI() {
  const container = document.getElementById("outdoor-wall-items");
  container.innerHTML = "";

  Object.entries(components.outdoorWall.variants).forEach(([variant, data]) => {
    const btn = document.createElement("button");
    btn.className = "tool-item";
    btn.style.display = "flex";
    btn.style.flexDirection = "column";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "2px";

    const thumb = createBlockThumbnailFixed(data.size);
    btn.appendChild(thumb);

    const label = document.createElement("span");
    label.innerText = variant;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
      container.querySelectorAll(".tool-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      selectedItem.type = "outdoorWall";
      selectedItem.variant = variant;

      if (!components.outdoorWall.styles[selectedItem.style]) {
        selectedItem.style = Object.keys(components.outdoorWall.styles)[0];
      }

      buildOutdoorWallStylesUI();
      updatePreviewGeometry();
    };

    container.appendChild(btn);
  });
}

// ---------- BUILD FLOOR VARIANTS ----------
function buildFloorVariantsUI() {
  const container = document.getElementById("floor-items");
  container.innerHTML = "";

  Object.entries(components.floor.variants).forEach(([variant, data]) => {
    const btn = document.createElement("button");
    btn.className = "tool-item";

    // Thumbnail
    const thumb = createBlockThumbnailFixed(data.size);
    btn.appendChild(thumb);

    // Label
    const label = document.createElement("span");
    label.innerText = variant;
    label.style.fontSize = "12px";
    btn.appendChild(label);

    btn.onclick = () => {
  selectedItem.type = "floor";
  selectedItem.variant = variant;
  selectedItem.style = Object.keys(components.floor.styles)[0];
  buildFloorStylesUI();
  updatePreviewGeometry();
};

    container.appendChild(btn);
  });
}

// ---------- BUILD CEILING VARIANTS ----------
function buildCeilingVariantsUI() {
  const container = document.getElementById("ceiling-items");
  if (!container) return;

  container.innerHTML = "";

  Object.entries(components.ceiling.variants).forEach(([variant, data]) => {
    const btn = document.createElement("button");
    btn.className = "tool-item";

    btn.appendChild(
      createBlockThumbnailFixed({
        ...data.size,
        geometry: data.geometry
      })
    );

    const label = document.createElement("span");
    label.innerText = variant;
    label.style.fontSize = "12px";
    btn.appendChild(label);

    btn.onclick = () => {
      selectedItem.type = "ceiling";
      selectedItem.variant = variant;
      selectedItem.style = Object.keys(components.ceiling.styles)[0];
      buildCeilingStylesUI();
      updatePreviewGeometry();
    };

    container.appendChild(btn);
  });
}

// ---------- BUILD BLOCK VARIANTS ----------
function buildBlockVariantsUI() {
  const container = document.getElementById("block-items");
  container.innerHTML = "";

  Object.entries(components.block.variants).forEach(([variant, data]) => {
    const btn = document.createElement("button");
    btn.className = "tool-item";

    // ✅ Apply same layout styles as other sections
    btn.style.display = "flex";
    btn.style.flexDirection = "column";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "2px";

    // Thumbnail
    const thumb = createBlockThumbnailFixed(data.size);
    btn.appendChild(thumb);

    // Label
    const label = document.createElement("span");
    label.innerText = variant;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";  // like walls/floors
    btn.appendChild(label);

    btn.onclick = () => {
      selectedItem.type = "block";
      selectedItem.variant = variant;
      selectedItem.style = Object.keys(components.block.styles)[0];
      buildBlockStylesUI();
      updatePreviewGeometry();
    };

    container.appendChild(btn);
  });
}

// ---------- BUILD WINDOW VARIANTS ----------
function buildWindowVariantsUI() {
  const container = document.getElementById("window-items");
  container.innerHTML = "";

  Object.entries(components.window.variants).forEach(([variant, data]) => {
    const btn = document.createElement("button");
    btn.className = "tool-item";

    const thumb = createBlockThumbnailFixed(data.size);
    btn.appendChild(thumb);

    const label = document.createElement("span");
    label.innerText = variant;
    label.style.fontSize = "12px";
    btn.appendChild(label);

    btn.onclick = () => {
  selectedItem.type = "window";
  selectedItem.variant = variant;
  selectedItem.style = Object.keys(components.window.styles)[0];
  buildWindowStylesUI();
  updatePreviewGeometry();
};

    container.appendChild(btn);
  });
}

// ---------- BUILD DOOR VARIANTS ----------
function buildDoorVariantsUI() {
  const container = document.getElementById("door-items");
  container.innerHTML = "";

  Object.entries(components.door.variants).forEach(([variant, data]) => {
    const btn = document.createElement("button");
    btn.className = "tool-item";

    const thumb = createBlockThumbnailFixed(data.size);
    btn.appendChild(thumb);

    const label = document.createElement("span");
    label.innerText = variant;
    label.style.fontSize = "12px";
    btn.appendChild(label);

    btn.onclick = () => {
  selectedItem.type = "door";
  selectedItem.variant = variant;
  selectedItem.style = Object.keys(components.door.styles)[0];
  buildDoorStylesUI();
  updatePreviewGeometry();
};

    container.appendChild(btn);
  });
}

// ---------- BUILD STAIR VARIANTS ----------
function buildStairVariantsUI() {
  const container = document.getElementById("stair-items");
  if (!container) return;
  container.innerHTML = "";

  const labels = {
    "1x1-solid": "1×1 Solid",
    "1x1-hollow": "1×1 Hollow",
    "5x-solid": "5× Solid",
    "5x-hollow": "5× Hollow"
  };

  Object.keys(components.stairs.variants).forEach(variant => {
    const btn = document.createElement("button");
    btn.className = "tool-item";
    btn.style.display = "flex";
    btn.style.flexDirection = "column";
    btn.style.alignItems = "center";
    btn.style.padding = "2px";

    // --- STAIR THUMBNAIL ---
    const thumb = createStairThumbnail(variant);
    btn.appendChild(thumb);

    // --- LABEL ---
    const label = document.createElement("span");
    label.innerText = labels[variant];
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
  selectedItem.type = "stairs";
  selectedItem.variant = variant;
  selectedItem.style = Object.keys(components.stairs.styles)[0];
  buildStairStylesUI();
  updatePreviewGeometry();
};

    container.appendChild(btn);
  });
}

// ---------- BUILD ROOF VARIANTS ----------
function buildRoofVariantsUI() {
  const container = document.getElementById("roof-items");
  if (!container) return;

  container.innerHTML = "";

  Object.entries(components.roof.variants).forEach(([variant, data]) => {
    const btn = document.createElement("button");
    btn.className = "tool-item";

    // Thumbnail (uses roofWedge geometry correctly)
    const thumb = createBlockThumbnailFixed({
      ...data.size,
      geometry: data.geometry
    });
    btn.appendChild(thumb);

    // Label
    const label = document.createElement("span");
    label.innerText = variant;
    label.style.fontSize = "12px";
    btn.appendChild(label);

    btn.onclick = () => {
      selectedItem.type = "roof";
      selectedItem.variant = variant;
      selectedItem.style = components.roof.styles
  ? Object.keys(components.roof.styles)[0]
  : null;

      buildRoofStylesUI();
      updatePreviewGeometry();
    };

    container.appendChild(btn);
  });
}

// ---------- BUILD INDOOR WALL STYLES ----------
function buildIndoorWallStylesUI() {
  const container = document.getElementById("indoor-wall-styles");
  container.innerHTML = "";

  Object.entries(components.indoorWall.styles).forEach(([style, data]) => {
    const btn = document.createElement("button");
    btn.className = "style-btn";
    btn.innerText = style;
    btn.onclick = () => {
      selectedItem.style = style;
      updatePreviewGeometry();
    };
    container.appendChild(btn);
  });
}

// ---------- BUILD OUTDOOR WALL STYLES ----------
function buildOutdoorWallStylesUI() {
  const container = document.getElementById("outdoor-wall-styles");
  container.innerHTML = "";

  Object.entries(components.outdoorWall.styles).forEach(([style, data]) => {
    const btn = document.createElement("button");
    btn.className = "style-btn";
    btn.innerText = style;
    btn.onclick = () => {
      selectedItem.style = style;
      updatePreviewGeometry();
    };
    container.appendChild(btn);
  });
}

// ---------- FLOOR STYLES ----------
function buildFloorStylesUI() {
  const container = document.getElementById("floor-styles");
  if (!container) return;
  container.innerHTML = "";

  const comp = components.floor;
  const variantData = comp.variants[selectedItem.variant] || {};
  const styles = comp.styles || {};

  Object.entries(styles).forEach(([styleName, styleData]) => {
    const btn = document.createElement("button");
    btn.className = "style-item";
    btn.style.display = "flex";
    btn.style.flexDirection = "column";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "2px";

    const size = variantData.size || comp.size || { x:1, y:1, z:1 };
    const thumb = createBlockThumbnailFixed(size);
    btn.appendChild(thumb);

    const label = document.createElement("span");
    label.innerText = styleName;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
      container.querySelectorAll(".style-item")
      .forEach(b => b.classList.remove("active"));
   
    btn.classList.add("active");

      selectedItem.style = styleName;
      updatePreviewGeometry();
    };

    if (styleName === selectedItem.style) btn.classList.add("active");
    container.appendChild(btn);
  });
}

// ---------- CEILING STYLES ----------
function buildCeilingStylesUI() {
  const container = document.getElementById("ceiling-styles");
  if (!container) return;

  container.innerHTML = "";

  const comp = components.ceiling;
  const variantData = comp.variants[selectedItem.variant];

  Object.entries(comp.styles).forEach(([styleName, styleData]) => {
    const btn = document.createElement("button");
    btn.className = "style-item";

    btn.appendChild(
      createBlockThumbnailFixed({
        ...variantData.size,
        geometry: variantData.geometry
      })
    );

    const label = document.createElement("span");
    label.innerText = styleName;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
      container.querySelectorAll(".style-item")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");
      selectedItem.style = styleName;
      updatePreviewGeometry();
    };

    if (styleName === selectedItem.style) {
      btn.classList.add("active");
    }

    container.appendChild(btn);
  });
}

// ---------- BLOCK STYLES ----------
function buildBlockStylesUI() {
  const container = document.getElementById("block-styles");
  if (!container) return;
  container.innerHTML = "";

  const comp = components.block;
  const variantData = comp.variants[selectedItem.variant];

  Object.entries(comp.styles).forEach(([styleName, styleData]) => {
    const btn = document.createElement("button");
    btn.className = "style-item";

    // 🔧 MATCH OTHER TOOLBARS
    btn.style.display = "flex";
    btn.style.flexDirection = "column";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "2px";

    btn.appendChild(
      createBlockThumbnailFixed({
        ...variantData.size,
        geometry: variantData.geometry
      })
    );

    const label = document.createElement("span");
    label.innerText = styleName;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
      container.querySelectorAll(".style-item")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");
      selectedItem.style = styleName;
      updatePreviewGeometry();
    };

    if (styleName === selectedItem.style) {
      btn.classList.add("active");
    }

    container.appendChild(btn);
  });
}

// ---------- WINDOW STYLES ----------
function buildWindowStylesUI() {
  const container = document.getElementById("window-styles");
  if (!container) return;
  container.innerHTML = "";

  const comp = components.window;
  const variantData = comp.variants[selectedItem.variant] || {};
  const styles = comp.styles || {};

  Object.entries(styles).forEach(([styleName, styleData]) => {
    const btn = document.createElement("button");
    btn.className = "style-item";

    const size = variantData.size || comp.size || { x:1, y:1, z:1 };
    btn.appendChild(createBlockThumbnailFixed(size));

    const label = document.createElement("span");
    label.innerText = styleName;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
      container.querySelectorAll(".style-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      selectedItem.style = styleName;
      updatePreviewGeometry();
    };

    if (styleName === selectedItem.style) btn.classList.add("active");
    container.appendChild(btn);
  });
}

// ---------- DOOR STYLES ----------
function buildDoorStylesUI() {
  const container = document.getElementById("door-styles");
  if (!container) return;
  container.innerHTML = "";

  const comp = components.door;
  const variantData = comp.variants[selectedItem.variant] || {};
  const styles = comp.styles || {};

  Object.entries(styles).forEach(([styleName, styleData]) => {
    const btn = document.createElement("button");
    btn.className = "style-item";

    const size = variantData.size || comp.size || { x:1, y:1, z:1 };
    btn.appendChild(createBlockThumbnailFixed(size));

    const label = document.createElement("span");
    label.innerText = styleName;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
      container.querySelectorAll(".style-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      selectedItem.style = styleName;
      updatePreviewGeometry();
    };

    if (styleName === selectedItem.style) btn.classList.add("active");
    container.appendChild(btn);
  });
}

// ---------- STAIR STYLES ----------
function buildStairStylesUI() {
  const container = document.getElementById("stair-styles");
  if (!container) return;
  container.innerHTML = "";

  const comp = components.stairs;
  const styles = comp.styles || {};

  Object.entries(styles).forEach(([styleName, styleData]) => {
    const btn = document.createElement("button");
    btn.className = "style-item";

    btn.appendChild(createStairThumbnail(selectedItem.variant));

    const label = document.createElement("span");
    label.innerText = styleName;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
      container.querySelectorAll(".style-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      selectedItem.style = styleName;
      updatePreviewGeometry();
    };

    if (styleName === selectedItem.style) btn.classList.add("active");
    container.appendChild(btn);
  });
}

// ---------- ROOF STYLES ----------
function buildRoofStylesUI() {
  const container = document.getElementById("roof-styles");
  if (!container) return;

  container.innerHTML = "";

  const comp = components.roof;
  const variantData = comp.variants[selectedItem.variant];

  if (!comp.styles) return;

Object.entries(comp.styles).forEach(([styleName, styleData]) => {
    const btn = document.createElement("button");
    btn.className = "style-item";

    btn.appendChild(
      createBlockThumbnailFixed({
        ...variantData.size,
        geometry: variantData.geometry
      })
    );

    const label = document.createElement("span");
    label.innerText = styleName;
    label.style.fontSize = "12px";
    label.style.marginTop = "2px";
    btn.appendChild(label);

    btn.onclick = () => {
      container.querySelectorAll(".style-item")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");
      selectedItem.style = styleName;
      updatePreviewGeometry();
    };

    if (styleName === selectedItem.style) {
      btn.classList.add("active");
    }

    container.appendChild(btn);
  });
}

// ---------- GET CURRENT COLOR ----------
function getCurrentColor() {

  const comp = components[selectedItem.type];
  if (!comp) return 0xffffff;

  let styleObj = null;

  // ---- VARIANT-BASED TYPES (if any exist) ----
  if (comp.variants && selectedItem.variant) {
    styleObj =
      comp.variants[selectedItem.variant]?.styles?.[selectedItem.style]
      ?? null;
  }

  // ---- STYLE-BASED TYPES (indoorWall, outdoorWall, ceiling, floor, etc.) ----
  if (!styleObj && comp.styles) {
    styleObj = comp.styles[selectedItem.style] ?? null;
  }

  // ---- SAFETY FALLBACKS ----
  if (!styleObj) return 0xffffff;
  if (styleObj.color !== undefined) return styleObj.color;
  if (styleObj.baseboardColor !== undefined) return styleObj.baseboardColor;
  if (styleObj.brickColor !== undefined) return styleObj.brickColor;
  if (styleObj.tileColor !== undefined) return styleObj.tileColor;
  if (styleObj.groutColor !== undefined) return styleObj.groutColor;

  return 0xffffff;
}

buildIndoorWallVariantsUI();
buildOutdoorWallVariantsUI();
buildFloorVariantsUI();
buildWindowVariantsUI();
buildDoorVariantsUI();
buildStairVariantsUI();
buildBlockVariantsUI();
buildCeilingVariantsUI();
buildRoofVariantsUI();

// ---------- BUILD GLOBAL COLOR PALETTES ----------
buildColorPalette(
  "primary-color-palette",
  "Primary Color",
  (color) => {
    primaryColor = color;
    updatePreviewGeometry();
  }
);

buildColorPalette(
  "secondary-color-palette",
  "Secondary Color",
  (color) => {
    secondaryColor = color;
    updatePreviewGeometry();
  }
);

// ---------- TOGGLE LEFT TOOLBAR ----------
const drawer = document.getElementById("color-drawer");
const toggleBtn = document.getElementById("drawer-toggle");

toggleBtn.onclick = () => {
  drawer.classList.toggle("open");
};

const colorDrawer = document.getElementById("color-drawer");

colorDrawer.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
});

colorDrawer.addEventListener("click", (e) => {
  e.stopPropagation();
});

// ---------- BLUEPRINT EXPORT ----------
function exportBlueprintData() {
  const blueprintObjects = [];

  buildables.forEach(obj => {
    const type = obj.userData?.type;
    if (!type || type === "floor" || type === "ceiling") return;

        let size = null;

    // ⭐ SPECIAL CASE FOR STAIRS
    if (type === "stairs") {
      const variant = obj.userData?.variant;
      const blocks =
        components.stairs.variants[variant]?.blocks || 1;

      size = { x: 1, z: blocks };
    }

    // 1. Direct size stored on object
    else if (obj.userData?.size) {
      size = obj.userData.size;
    }

    // 2. Variant-based lookup
    else if (
      obj.userData?.variant &&
      components[type]?.variants?.[obj.userData.variant]?.size
    ) {
      size = components[type].variants[obj.userData.variant].size;
    }

    // 3. Absolute fallback
    if (!size) {
      console.warn("Blueprint size fallback:", obj);
      size = { x: 1, z: 1 };
    }

    blueprintObjects.push({
      type,

      x: obj.position.x,
      z: obj.position.z,
      y: obj.position.y,

      rotation: obj.rotation.y || 0,

      width: size.x,
      depth: size.z
    });
  });

  localStorage.setItem(
    "blueprintData",
    JSON.stringify({
      storyHeight: STORY_HEIGHT,
      objects: blueprintObjects
    })
  );
}

function applyColorsToObject(obj, primary, secondary) {
  if (!obj) return;

  obj.traverse(child => {
    if (!child.isMesh) return;
    if (!child.material) return;

    child.material = child.material.clone();

    // Secondary parts (mortar, backing, trim)
    if (child.userData?.isSecondary && secondary) {
      child.material.color.set(secondary);
    }
    // EVERYTHING ELSE defaults to primary
    else if (primary) {
      child.material.color.set(primary);
    }

    child.material.needsUpdate = true;
  });
}

function placeFromData(data) {
  if (!data || !data.position || !data.type) {
    console.warn("Skipping invalid saved object:", data);
    return;
  }

  const {
    type,
    variant,
    style,
    position,
    rotation,
    primaryColor,
    secondaryColor
  } = data;

  if (type === "stairs") {
    const material =
      components.stairs.styles[style]?.type === "glass"
        ? glassMaterial.clone()
        : new THREE.MeshStandardMaterial();

    const stairs = createStairMesh(variant, material, style);

    stairs.position.set(position.x, position.y, position.z);
    stairs.rotation.y = rotation || 0;

    stairs.userData = data;

    scene.add(stairs);
    buildables.push(stairs);
    return;
  }

  // 🚑 VALIDATE COMPONENT
  const comp = components[type];
  if (!comp) {
    console.warn("Unknown component type:", type);
    return;
  }

  // 🚑 VALIDATE VARIANT (except stairs)
  let safeVariant = variant;
  if (comp.variants && !comp.variants[variant]) {
    safeVariant = Object.keys(comp.variants)[0];
  }

  // 🚑 VALIDATE STYLE
  let safeStyle = style;
  if (comp.styles && style && !comp.styles[style]) {
    safeStyle = Object.keys(comp.styles)[0];
  }

  const obj = placeBlockAt({
    position,
    rotation: rotation ?? 0,
    override: {
      type,
      variant: safeVariant ?? null,
      style: safeStyle ?? null,
      primaryColor,
      secondaryColor
    }
  });

  if (!obj) return;

  obj.rotation.y = rotation ?? 0;

  obj.userData.type = type;
  obj.userData.variant = safeVariant ?? null;
  obj.userData.style = safeStyle ?? null;
  obj.userData.primaryColor = primaryColor;
  obj.userData.secondaryColor = secondaryColor;

  // ✅ APPLY (THIS WAS MISSING)
applyColorsToObject(obj, primaryColor, secondaryColor);
}

function restoreSandboxState(state) {
  if (!state || !state.buildables) return;

  // Clear existing scene
  buildables.forEach(obj => deleteBuildable(obj));
  buildables.length = 0;

  currentStory = state.currentStory ?? 0;

  state.buildables.forEach(data => {
    if (data.type === "stairs") {
  createStairFromData(data);
} else {
  placeFromData(data);
}
  });
}

loadIdea();