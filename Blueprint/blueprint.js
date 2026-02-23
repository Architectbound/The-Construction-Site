const canvas = document.getElementById("blueprintCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth - 40;
canvas.height = window.innerHeight - 40;

const GRID_SIZE = 40; // pixels per block
const STORY_HEIGHT = 5;

let blueprintMeta = {
  client: "",
  title: "",
  date: ""
};

function drawTitleBlock() {

  const boxWidth = 320;
  const boxHeight = 170; // slightly taller for extra line
  const margin = 20;

  const x = canvas.width - boxWidth - margin;
  const y = canvas.height - boxHeight - margin;

  ctx.save();

  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;

  // Outer box
  ctx.strokeRect(x, y, boxWidth, boxHeight);

  ctx.fillStyle = "white";
  ctx.textAlign = "left";

  const lineSpacing = 25;
  let textY = y + 30;

  // Client
  ctx.font = "16px Arial";
  ctx.fillText(`Client: ${blueprintMeta.client}`, x + 15, textY);
  textY += lineSpacing;

  // Architect (normal)
  ctx.font = "16px Arial";
  ctx.fillText(`Architect: ${blueprintMeta.client}`, x + 15, textY);
  textY += lineSpacing;

  // The Construction Site (italic, on new line)
  ctx.font = "italic 16px Arial";
  ctx.fillText(`The Construction Site`, x + 30, textY);
  textY += lineSpacing;

  // Back to normal
  ctx.font = "16px Arial";

  // Title
  ctx.fillText(`Title: ${blueprintMeta.title}`, x + 15, textY);
  textY += lineSpacing;

  ctx.fillText(`Story: ${currentStory + 1}`, x + 15, textY);
textY += lineSpacing;

  // Date
  ctx.fillText(`Date: ${blueprintMeta.date}`, x + 15, textY);

  ctx.restore();
}

// Load data
const data = JSON.parse(localStorage.getItem("blueprintData"));
if (!data) {
  alert("No blueprint data found.");
}

// ---------- STORY COUNT ----------
const totalStories = Math.max(
  1,
  Math.ceil(
    Math.max(...data.objects.map(o => o.y || 0)) / STORY_HEIGHT
  )
);

let currentStory = 0;

const storySelect = document.getElementById("storySelect");

for (let i = 0; i < totalStories; i++) {
  const option = document.createElement("option");
  option.value = i;
  option.textContent = `Story ${i + 1}`;
  storySelect.appendChild(option);
}

storySelect.value = currentStory;

storySelect.addEventListener("change", () => {
  currentStory = Number(storySelect.value);
  drawStory(currentStory);
});

// ---------- GRID ----------
function drawGrid() {
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawSingleDoor(ctx, radius) {
  // swing arc
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI / 2);
  ctx.stroke();

  // door panel
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, radius);
  ctx.stroke();
}

// ---------- OBJECT DRAWING ----------
function drawObject(obj) {
  const x = view.offsetX + obj.x * view.scale;
const y = view.offsetY + obj.z * view.scale;

const w = (obj.width || 1) * view.scale;
const d = (obj.depth || 1) * view.scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(obj.rotation || 0);

ctx.lineWidth = 2;

// ---------- DOOR (BLUEPRINT-CORRECT SINGLE + DOUBLE) ----------
if (obj.type === "door") {
  ctx.strokeStyle = "white";

  // Full door width in world units
  const doorWidth = obj.width + 1.3 || 2;
  const radius = doorWidth * GRID_SIZE;

  // ---------- SINGLE DOOR ----------
ctx.translate(-radius / 2, 0);
drawSingleDoor(ctx, radius);
ctx.restore();
return;
}

// ---------- FILLED SOLIDS ----------
if (
  obj.type === "indoorWall" ||
  obj.type === "outdoorWall" ||
  obj.type === "block"
) {
  ctx.fillStyle = "white";
  ctx.fillRect(-w / 2, -d / 2, w, d);

  ctx.strokeStyle = "white";
  ctx.strokeRect(-w / 2, -d / 2, w, d);
}

// ---------- OUTLINES ONLY ----------
else {
  ctx.strokeStyle = "white";
  ctx.strokeRect(-w / 2, -d / 2, w, d);
}

  // Windows
  if (obj.type === "window") {
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();
  }

 // Stairs
if (obj.type === "stairs") {

  // Number of stair blocks (depth is already correct from export fix)
  const blocks = obj.depth || 1;

  // 3 steps per block
  const steps = blocks * 3;

  const stepDepth = d / steps;

  for (let i = 0; i < steps; i++) {
    ctx.strokeRect(
      -w / 2,
      -d / 2 + i * stepDepth,
      w,
      stepDepth
    );
  }
}

  ctx.restore();
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.w / 2 <= b.x - b.w / 2 ||
    a.x - a.w / 2 >= b.x + b.w / 2 ||
    a.y + a.h / 2 <= b.y - b.h / 2 ||
    a.y - a.h / 2 >= b.y + b.h / 2
  );
}

function calculateView(objects) {

  if (objects.length === 0) {
    return {
      offsetX: canvas.width / 2,
      offsetY: canvas.height / 2,
      scale: GRID_SIZE
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  objects.forEach(obj => {
    const halfW = (obj.width || 1) / 2;
    const halfD = (obj.depth || 1) / 2;

    minX = Math.min(minX, obj.x - halfW);
    maxX = Math.max(maxX, obj.x + halfW);

    minZ = Math.min(minZ, obj.z - halfD);
    maxZ = Math.max(maxZ, obj.z + halfD);
  });

  const worldWidth = maxX - minX;
  const worldHeight = maxZ - minZ;

  const padding = 0.9; // leave margin around drawing

  const scaleX = (canvas.width * padding) / worldWidth;
  const scaleZ = (canvas.height * padding) / worldHeight;

  const scale = Math.min(scaleX, scaleZ);

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const offsetX = canvas.width / 2 - centerX * scale;
  const offsetY = canvas.height / 2 - centerZ * scale;

  return { offsetX, offsetY, scale };
}

//------ SAVE -------
function saveBlueprint() {

  const client = document.getElementById("clientInput").value || "Unknown";
  const title = document.getElementById("titleInput").value || "Blueprint";

  blueprintMeta.client = client;
  blueprintMeta.title = title;

  const today = new Date();
  blueprintMeta.date = today.toLocaleDateString();

  drawStory(0); // redraw with updated title block

  const link = document.createElement("a");
  link.download = `${title}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ---------- STORY FILTER ----------
function drawStory(storyIndex) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  const minY = storyIndex * STORY_HEIGHT;
  const maxY = minY + STORY_HEIGHT;

  // Visible objects for this story
const visibleObjects = data.objects.filter(obj =>
  obj.y >= minY &&
  obj.y < maxY &&
  obj.width &&
  obj.depth
);

// Calculate dynamic centering + scaling
window.view = calculateView(visibleObjects);

  // ---------- COLLECT OPENINGS FIRST ----------
const openings = data.objects.filter(obj =>
  (obj.type === "door" || obj.type === "window") &&
  obj.y >= minY &&
  obj.y < maxY
).map(obj => {
  if (!obj.width || !obj.depth) return null;

  return {
    x: obj.x,
    y: obj.z,
    w: obj.width,
    h: obj.depth
  };
}).filter(Boolean);

// ---------- COLLECT STAIRS ----------
const stairRects = data.objects
  .filter(obj =>
    obj.type === "stairs" &&
    obj.y >= minY &&
    obj.y < maxY
  )
  .map(obj => ({
    x: obj.x,
    y: obj.z,
    w: obj.width,
    h: obj.depth
  }));

// ---------- DRAW OBJECTS ----------
data.objects.forEach(obj => {
  if (obj.y < minY || obj.y >= maxY) return;

  if (!obj.width || !obj.depth) return;

  // ----- WALL CANCELLATION LOGIC -----
  if (obj.type === "indoorWall" || obj.type === "outdoorWall") {

    const wallRect = {
  x: obj.x,
  y: obj.z,
  w: obj.width,
  h: obj.depth
};

    const blocked = openings.some(opening =>
      rectsOverlap(wallRect, opening)
    );

    if (blocked) return; // ❌ do not draw wall
  }

// ----- BLOCK CANCELLATION BY STAIRS -----
if (obj.type === "block") {

  const blockRect = {
    x: obj.x,
    y: obj.z,
    w: obj.width,
    h: obj.depth
  };

  const coveredByStair = stairRects.some(stair =>
    rectsOverlap(blockRect, stair)
  );

  if (coveredByStair) return; // ❌ do not draw block
}

  drawObject(obj);
});
drawTitleBlock();
}

// ---------- INITIAL DRAW ----------
drawStory(currentStory);
