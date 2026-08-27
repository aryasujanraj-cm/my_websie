const tools = document.querySelectorAll('.tool[data-tool]');
const toolStatus = document.getElementById('toolStatus');
const selectionMeta = document.getElementById('selectionMeta');
const artboard = document.getElementById('artboard');
const selectionBox = document.getElementById('selectionBox');
const codeDrawer = document.getElementById('codeDrawer');
const codeBlock = document.getElementById('codeBlock');
const opacityRange = document.getElementById('opacityRange');
const opacityValue = document.getElementById('opacityValue');
const zoomValue = document.getElementById('zoomValue');
const layersList = document.querySelector('.layers-list');

let currentTool = 'select';
let zoom = 100;
let selectedElement = document.querySelector('.orbit-shape');
let currentCode = 'html';
let shapeCount = 0;
let dragState = null;

const shapeData = new Map();
const colors = { rectangle: '#72d9ec', circle: '#9c7bff' };

function slug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
function getName(element) { return element.dataset.layer || 'Untitled shape'; }
function getBox(element) {
  return { x: parseFloat(element.dataset.x || element.offsetLeft), y: parseFloat(element.dataset.y || element.offsetTop), w: element.offsetWidth, h: element.offsetHeight };
}
function updateInspector(element) {
  if (!element) return;
  const box = getBox(element);
  const fill = element.dataset.fill || getComputedStyle(element).backgroundColor;
  const values = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), fill };
  document.querySelectorAll('[data-prop]').forEach((input) => { if (values[input.dataset.prop] !== undefined) input.value = values[input.dataset.prop]; });
  selectionMeta.textContent = `${getName(element)} selected`;
  document.querySelectorAll('.layer').forEach((layer) => layer.classList.toggle('active', layer.dataset.layerSelect === getName(element)));
}
function positionSelection(element) {
  if (!element) return;
  const box = getBox(element);
  selectionBox.style.left = `${box.x - 2}px`;
  selectionBox.style.top = `${box.y - 2}px`;
  selectionBox.style.width = `${box.w + 4}px`;
  selectionBox.style.height = `${box.h + 4}px`;
  selectionBox.style.opacity = opacityRange.value / 100;
  updateInspector(element);
}
function selectElement(element) {
  selectedElement = element;
  document.querySelectorAll('[data-layer]').forEach((item) => item.classList.toggle('shape-selected', item === element));
  positionSelection(element);
}
function addLayerButton(element) {
  const button = document.createElement('button');
  button.className = 'layer';
  button.dataset.layerSelect = getName(element);
  button.innerHTML = `<span class="layer-icon ${element.dataset.shape === 'circle' ? 'circle-layer' : 'card-layer'}"></span><span>${getName(element)}</span><span class="eye">◉</span>`;
  button.addEventListener('click', () => selectElement(element));
  layersList.prepend(button);
}
function createShape(type) {
  shapeCount += 1;
  const element = document.createElement('div');
  const name = `${type === 'rectangle' ? 'Rectangle' : 'Circle'} ${shapeCount}`;
  const x = 110 + (shapeCount % 4) * 42;
  const y = 110 + (shapeCount % 3) * 38;
  const size = type === 'circle' ? 112 : 168;
  element.className = `canvas-shape ${type}`;
  element.dataset.layer = name;
  element.dataset.shape = type;
  element.dataset.x = x;
  element.dataset.y = y;
  element.dataset.fill = colors[type];
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.style.width = `${size}px`;
  element.style.height = `${type === 'circle' ? size : 104}px`;
  element.style.background = colors[type];
  artboard.insertBefore(element, selectionBox);
  shapeData.set(element, { type, name });
  addLayerButton(element);
  selectElement(element);
  toolStatus.textContent = `${name} added to canvas`;
  currentTool = 'select';
  tools.forEach((item) => item.classList.toggle('active', item.dataset.tool === 'select'));
}
function startDrag(event, element) {
  if (currentTool !== 'select') return;
  event.preventDefault();
  const rect = artboard.getBoundingClientRect();
  const box = getBox(element);
  dragState = { element, offsetX: (event.clientX - rect.left) / (zoom / 100) - box.x, offsetY: (event.clientY - rect.top) / (zoom / 100) - box.y };
  selectElement(element);
  element.setPointerCapture?.(event.pointerId);
}
function moveDrag(event) {
  if (!dragState) return;
  const rect = artboard.getBoundingClientRect();
  const x = Math.max(8, (event.clientX - rect.left) / (zoom / 100) - dragState.offsetX);
  const y = Math.max(8, (event.clientY - rect.top) / (zoom / 100) - dragState.offsetY);
  dragState.element.dataset.x = x;
  dragState.element.dataset.y = y;
  dragState.element.style.left = `${x}px`;
  dragState.element.style.top = `${y}px`;
  positionSelection(dragState.element);
}
function endDrag() { dragState = null; }

// Existing artboard items and newly created shapes share the same selection/drag model.
document.querySelectorAll('[data-layer]').forEach((item) => {
  item.addEventListener('pointerdown', (event) => startDrag(event, item));
  item.addEventListener('click', () => selectElement(item));
});
artboard.addEventListener('pointermove', moveDrag);
artboard.addEventListener('pointerup', endDrag);
artboard.addEventListener('pointercancel', endDrag);

tools.forEach((tool) => tool.addEventListener('click', () => {
  currentTool = tool.dataset.tool;
  tools.forEach((item) => item.classList.toggle('active', item === tool));
  toolStatus.textContent = `${tool.title} active`;
  if (currentTool === 'rectangle' || currentTool === 'circle') createShape(currentTool);
}));

document.querySelectorAll('[data-layer-select]').forEach((layer) => layer.addEventListener('click', () => {
  const element = [...document.querySelectorAll('[data-layer]')].find((item) => item.dataset.layer === layer.dataset.layerSelect);
  if (element) selectElement(element);
}));
document.querySelectorAll('.inspector-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.inspector-tab').forEach((item) => item.classList.toggle('active', item === tab));
  document.getElementById('designPanel').classList.toggle('hidden', tab.dataset.tab !== 'design');
  document.getElementById('layersPanel').classList.toggle('hidden', tab.dataset.tab !== 'layers');
}));
document.getElementById('zoomIn').addEventListener('click', () => { zoom = Math.min(160, zoom + 10); zoomValue.textContent = `${zoom}%`; artboard.style.transform = `scale(${zoom / 100})`; });
document.getElementById('zoomOut').addEventListener('click', () => { zoom = Math.max(60, zoom - 10); zoomValue.textContent = `${zoom}%`; artboard.style.transform = `scale(${zoom / 100})`; });
document.getElementById('undoBtn').addEventListener('click', () => { toolStatus.textContent = 'Undo — canvas restored'; });
document.getElementById('redoBtn').addEventListener('click', () => { toolStatus.textContent = 'Redo — canvas restored'; });
document.getElementById('previewToggle').addEventListener('change', (event) => { document.body.classList.toggle('preview-mode', event.target.checked); toolStatus.textContent = event.target.checked ? 'Preview mode' : 'Select tool active'; });
opacityRange.addEventListener('input', (event) => { opacityValue.textContent = `${event.target.value}%`; if (selectedElement) selectedElement.style.opacity = event.target.value / 100; selectionBox.style.opacity = event.target.value / 100; });
document.querySelectorAll('[data-prop]').forEach((input) => input.addEventListener('change', () => {
  if (!selectedElement) return;
  const prop = input.dataset.prop;
  if (prop === 'fill') { selectedElement.dataset.fill = input.value; selectedElement.style.background = input.value; }
  if (prop === 'x' || prop === 'y') { selectedElement.dataset[prop] = parseFloat(input.value) || 0; selectedElement.style[prop === 'x' ? 'left' : 'top'] = `${selectedElement.dataset[prop]}px`; }
  if (prop === 'w' || prop === 'h') selectedElement.style[prop === 'w' ? 'width' : 'height'] = `${parseFloat(input.value) || 1}px`;
  positionSelection(selectedElement);
  toolStatus.textContent = `${prop} updated`;
}));

function generatedCode() {
  const shapes = [...document.querySelectorAll('.canvas-shape')];
  const html = shapes.map((shape) => `  <div class="${shape.dataset.shape}" data-name="${getName(shape)}"></div>`).join('\n');
  const css = shapes.map((shape) => { const box = getBox(shape); return `.${shape.dataset.shape} {\n  position: absolute;\n  left: ${Math.round(box.x)}px; top: ${Math.round(box.y)}px;\n  width: ${Math.round(box.w)}px; height: ${Math.round(box.h)}px;\n  background: ${shape.dataset.fill};\n  ${shape.dataset.shape === 'circle' ? 'border-radius: 50%;' : 'border-radius: 8px;'}\n}`; }).join('\n\n');
  return { html: `<div class="canvas">\n${html}\n</div>`, css: `.canvas { position: relative; width: 760px; height: 520px; }\n\n${css}`, js: `document.querySelectorAll('.canvas > div').forEach((shape) => {\n  shape.addEventListener('pointerdown', () => shape.classList.add('selected'));\n});` };
}
document.getElementById('exportBtn').addEventListener('click', () => { codeDrawer.classList.add('open'); codeBlock.textContent = generatedCode()[currentCode]; });
document.getElementById('closeDrawer').addEventListener('click', () => codeDrawer.classList.remove('open'));
document.querySelectorAll('.code-tab').forEach((tab) => tab.addEventListener('click', () => { currentCode = tab.dataset.code; document.querySelectorAll('.code-tab').forEach((item) => item.classList.toggle('active', item === tab)); codeBlock.textContent = generatedCode()[currentCode]; }));
document.getElementById('copyCode').addEventListener('click', async () => { await navigator.clipboard?.writeText(codeBlock.textContent); document.getElementById('copyCode').textContent = 'Copied'; setTimeout(() => { document.getElementById('copyCode').textContent = 'Copy code'; }, 1200); });
document.getElementById('downloadCode').addEventListener('click', () => {
  const output = generatedCode();
  const html = `<!doctype html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>Framecraft export</title><style>${output.css}</style></head>\n<body>${output.html}</body>\n</html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const link = document.createElement('a'); link.href = url; link.download = 'framecraft-export.html'; link.click(); URL.revokeObjectURL(url);
  document.getElementById('downloadCode').textContent = 'Downloaded';
  setTimeout(() => { document.getElementById('downloadCode').textContent = 'Download HTML'; }, 1200);
});
selectElement(selectedElement);

// Keep the inspector aligned if the browser resizes the board.
window.addEventListener('resize', () => positionSelection(selectedElement));

/* Download the generated HTML/CSS bundle from the export drawer. */
document.getElementById('exportBtn').addEventListener('dblclick', () => {
  const output = generatedCode();
  const blob = new Blob([`<!doctype html><html><head><style>${output.css}</style></head><body>${output.html}</body></html>`], { type: 'text/html' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'framecraft-export.html'; link.click(); URL.revokeObjectURL(link.href);
});

// Preserve the existing layer count label as new layers are added.
const layerCount = document.querySelector('.inspector-tab[data-tab="layers"] span');
const observer = new MutationObserver(() => { if (layerCount) layerCount.textContent = document.querySelectorAll('.layer').length; });
observer.observe(layersList, { childList: true });
positionSelection(selectedElement);
