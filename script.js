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
let currentTool = 'select';
let zoom = 100;
let selectedLayer = 'Orbit / blend';
let currentCode = 'html';

const snippets = {
  html: `<div class="framecraft-hero">\n  <span class="eyebrow">Digital product studio</span>\n  <h1>Make the <em>invisible</em> visible.</h1>\n  <p>A flexible canvas for ideas that move at the speed of thought.</p>\n  <button>Explore system ↗</button>\n</div>`,
  css: `.framecraft-hero {\n  position: relative;\n  display: grid;\n  gap: 24px;\n  color: #24262b;\n}\n\n.framecraft-hero h1 {\n  font-size: 52px;\n  letter-spacing: -0.08em;\n}`,
  js: `const canvas = document.querySelector('.framecraft-hero');\n\ncanvas.addEventListener('pointerdown', (event) => {\n  canvas.classList.toggle('is-active');\n  console.log('Frame selected', event.clientX, event.clientY);\n});`
};

function renderCode() { codeBlock.textContent = snippets[currentCode]; }
function selectLayer(name) {
  selectedLayer = name;
  selectionMeta.textContent = `${name} selected`;
  document.querySelectorAll('.layer').forEach((layer) => layer.classList.toggle('active', layer.dataset.layerSelect === name));
  document.querySelectorAll('[data-layer]').forEach((item) => item.classList.toggle('shape-selected', item.dataset.layer === name));
  if (name === 'Hero statement') { selectionBox.style.left = '52px'; selectionBox.style.top = '68px'; selectionBox.style.width = '274px'; selectionBox.style.height = '211px'; }
  else if (name === 'Signal card') { selectionBox.style.left = '523px'; selectionBox.style.top = '271px'; selectionBox.style.width = '140px'; selectionBox.style.height = '98px'; }
  else { selectionBox.style.left = '338px'; selectionBox.style.top = '72px'; selectionBox.style.width = '280px'; selectionBox.style.height = '243px'; }
}

tools.forEach((tool) => tool.addEventListener('click', () => {
  currentTool = tool.dataset.tool;
  tools.forEach((item) => item.classList.toggle('active', item === tool));
  toolStatus.textContent = `${tool.title} active`;
  if (currentTool !== 'select') selectionMeta.textContent = `${tool.title} ready`;
}));

document.querySelectorAll('[data-layer-select]').forEach((layer) => layer.addEventListener('click', () => selectLayer(layer.dataset.layerSelect)));
document.querySelectorAll('.inspector-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.inspector-tab').forEach((item) => item.classList.toggle('active', item === tab));
  document.getElementById('designPanel').classList.toggle('hidden', tab.dataset.tab !== 'design');
  document.getElementById('layersPanel').classList.toggle('hidden', tab.dataset.tab !== 'layers');
}));

document.querySelectorAll('[data-layer]').forEach((item) => item.addEventListener('click', () => selectLayer(item.dataset.layer)));
document.getElementById('zoomIn').addEventListener('click', () => { zoom = Math.min(160, zoom + 10); zoomValue.textContent = `${zoom}%`; artboard.style.transform = `scale(${zoom / 100})`; });
document.getElementById('zoomOut').addEventListener('click', () => { zoom = Math.max(60, zoom - 10); zoomValue.textContent = `${zoom}%`; artboard.style.transform = `scale(${zoom / 100})`; });
document.getElementById('undoBtn').addEventListener('click', () => { toolStatus.textContent = 'Undo — canvas restored'; });
document.getElementById('redoBtn').addEventListener('click', () => { toolStatus.textContent = 'Redo — canvas restored'; });
document.getElementById('previewToggle').addEventListener('change', (event) => { document.body.classList.toggle('preview-mode', event.target.checked); toolStatus.textContent = event.target.checked ? 'Preview mode' : 'Select tool active'; });
opacityRange.addEventListener('input', (event) => { opacityValue.textContent = `${event.target.value}%`; selectionBox.style.opacity = event.target.value / 100; });
document.querySelectorAll('[data-prop]').forEach((input) => input.addEventListener('change', () => { toolStatus.textContent = `${input.dataset.prop} updated`; }));
document.getElementById('exportBtn').addEventListener('click', () => { codeDrawer.classList.add('open'); renderCode(); });
document.getElementById('closeDrawer').addEventListener('click', () => codeDrawer.classList.remove('open'));
document.querySelectorAll('.code-tab').forEach((tab) => tab.addEventListener('click', () => { currentCode = tab.dataset.code; document.querySelectorAll('.code-tab').forEach((item) => item.classList.toggle('active', item === tab)); renderCode(); }));
document.getElementById('copyCode').addEventListener('click', async () => { await navigator.clipboard?.writeText(snippets[currentCode]); document.getElementById('copyCode').textContent = 'Copied'; setTimeout(() => { document.getElementById('copyCode').textContent = 'Copy code'; }, 1200); });
selectLayer(selectedLayer);
