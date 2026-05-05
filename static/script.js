/* ── State ───────────────────────────────────────────────────── */
let selectedFiles   = [];
let currentProvider = 'groq';
let isIndexed       = false;

/* ── DOM refs ────────────────────────────────────────────────── */
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const fileList    = document.getElementById('fileList');
const uploadBtn   = document.getElementById('uploadBtn');
const ingestBtn   = document.getElementById('ingestBtn');
const clearBtn    = document.getElementById('clearBtn');
const topKSlider  = document.getElementById('topK');
const topkVal     = document.getElementById('topkVal');
const queryInput  = document.getElementById('queryInput');
const sendBtn     = document.getElementById('sendBtn');
const chatBody    = document.getElementById('chatBody');
const welcomeState= document.getElementById('welcomeState');
const sourcesBar  = document.getElementById('sourcesBar');
const statPdfs    = document.getElementById('statPdfs');
const statChunks  = document.getElementById('statChunks');
const statusBadge = document.getElementById('statusBadge');
const badgeText   = document.getElementById('badgeText');
const headerStatus= document.getElementById('headerStatus');
const envStatus   = document.getElementById('envStatus');
const envDot      = document.getElementById('envDot');
const envLabel    = document.getElementById('envLabel');
const dot         = statusBadge.querySelector('.dot');
const toast       = document.getElementById('toast');
let   toastTimer  = null;

/* ── Toast ───────────────────────────────────────────────────── */
function showToast(msg, type = 'info', dur = 3000) {
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), dur);
}

/* ── Badge ───────────────────────────────────────────────────── */
function setBadge(text, state) {
  badgeText.textContent = text;
  dot.className = 'dot ' + (state || '');
}

/* ── Load config from backend (.env) ────────────────────────── */
async function loadConfig() {
  try {
    const res  = await fetch('/config');
    const data = await res.json();

    const available = data.available_providers || [];
    currentProvider = data.default_provider || 'groq';

    // Show/hide provider tabs based on what keys exist in .env
    document.querySelectorAll('.provider-btn').forEach(btn => {
      const p = btn.dataset.provider;
      if (!available.includes(p)) {
        btn.disabled = true;
        btn.title    = `No ${p.toUpperCase()}_API_KEY in .env`;
        btn.classList.add('disabled-provider');
      }
      btn.classList.toggle('active', p === currentProvider);
    });

    // Env status pill
    if (available.length > 0) {
      envDot.classList.add('env-ok');
      envLabel.textContent = `${currentProvider.charAt(0).toUpperCase() + currentProvider.slice(1)} key loaded ✓`;
    } else {
      envDot.classList.add('env-err');
      envLabel.textContent = 'No API key found in .env';
      showToast('Add GROQ_API_KEY to your .env file', 'error', 6000);
    }
  } catch (_) {
    envDot.classList.add('env-err');
    envLabel.textContent = 'Could not read config';
  }
}

/* ── Provider tabs ───────────────────────────────────────────── */
document.querySelectorAll('.provider-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentProvider = btn.dataset.provider;
    // Update env pill label
    envLabel.textContent = `${currentProvider.charAt(0).toUpperCase() + currentProvider.slice(1)} key loaded ✓`;
  });
});


/* ── Mobile sidebar toggle ───────────────────────────────────── */
const sidebar         = document.getElementById('sidebar');
const hamburger       = document.getElementById('hamburger');
const sidebarOverlay  = document.getElementById('sidebarOverlay');

function openSidebar() {
  sidebar.classList.add('open');
  hamburger.classList.add('open');
  sidebarOverlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  hamburger.classList.remove('open');
  sidebarOverlay.classList.remove('visible');
  document.body.style.overflow = '';
}

hamburger.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

sidebarOverlay.addEventListener('click', closeSidebar);

// Close sidebar on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSidebar();
});

// Close sidebar automatically after ingest/upload on mobile
function closeSidebarOnMobile() {
  if (window.innerWidth <= 768) closeSidebar();
}

/* ── Top-K slider ────────────────────────────────────────────── */
topKSlider.addEventListener('input', () => { topkVal.textContent = topKSlider.value; });

/* ── File handling ───────────────────────────────────────────── */
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => addFiles([...fileInput.files]));

dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles([...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.pdf')));
});

function addFiles(files) {
  const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (!pdfs.length) { showToast('Only PDF files are supported', 'error'); return; }
  pdfs.forEach(f => {
    if (!selectedFiles.find(sf => sf.name === f.name)) selectedFiles.push(f);
  });
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = '';
  selectedFiles.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="file-name" title="${f.name}">${f.name}</span>
      <button class="file-remove" data-i="${i}" title="Remove">×</button>
    `;
    fileList.appendChild(div);
  });
  fileList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedFiles.splice(parseInt(btn.dataset.i), 1);
      renderFileList();
      updateBtns();
    });
  });
  updateBtns();
}

function updateBtns() {
  uploadBtn.disabled = selectedFiles.length === 0;
  ingestBtn.disabled = selectedFiles.length === 0;
}

/* ── Upload ──────────────────────────────────────────────────── */
uploadBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) return;
  uploadBtn.textContent = 'Uploading…';
  uploadBtn.classList.add('loading');
  const fd = new FormData();
  selectedFiles.forEach(f => fd.append('files', f));
  try {
    const res  = await fetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
    await refreshStatus();
    setBadge('Files uploaded', 'yellow');
    headerStatus.textContent = `${data.files.length} PDF(s) ready — click Ingest`;
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    uploadBtn.textContent = 'Upload';
    uploadBtn.classList.remove('loading');
  }
});

/* ── Ingest ──────────────────────────────────────────────────── */
ingestBtn.addEventListener('click', async () => {
  ingestBtn.textContent = '⚡ Ingesting…';
  ingestBtn.classList.add('loading');
  setBadge('Ingesting…', 'pulse');
  headerStatus.textContent = 'Processing PDFs — this may take a moment…';

  if (selectedFiles.length) {
    const fd = new FormData();
    selectedFiles.forEach(f => fd.append('files', f));
    try { await fetch('/upload', { method: 'POST', body: fd }); } catch (_) {}
  }

  try {
    const res  = await fetch('/ingest', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`Indexed ${data.chunks_indexed} chunks from ${data.pdfs_processed} PDF(s)`, 'success', 4000);
    isIndexed = true;
    selectedFiles = [];
    renderFileList();
    await refreshStatus();
    setBadge('Index ready', 'green');
    headerStatus.textContent = `${data.chunks_indexed} chunks indexed — ask anything`;
    sendBtn.disabled = false;
  } catch (e) {
    showToast(e.message, 'error');
    setBadge('Error', '');
    headerStatus.textContent = 'Ingestion failed. Try again.';
  } finally {
    ingestBtn.textContent = '⚡ Ingest';
    ingestBtn.classList.remove('loading');
  }
});

/* ── Clear ───────────────────────────────────────────────────── */
clearBtn.addEventListener('click', async () => {
  if (!confirm('Clear all PDFs and the vector index?')) return;
  try {
    const res  = await fetch('/clear', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    isIndexed = false;
    selectedFiles = [];
    renderFileList();
    await refreshStatus();
    setBadge('Idle', '');
    headerStatus.textContent = 'Upload & ingest PDFs to begin';
    sendBtn.disabled = true;
    showToast('Index cleared', 'info');
    sourcesBar.style.display = 'none';
  } catch (e) {
    showToast(e.message, 'error');
  }
});

/* ── Status ──────────────────────────────────────────────────── */
async function refreshStatus() {
  try {
    const res  = await fetch('/status');
    const data = await res.json();
    statPdfs.textContent   = data.uploaded_pdfs;
    statChunks.textContent = data.indexed_chunks;
    if (data.indexed_chunks > 0) {
      isIndexed = true;
      sendBtn.disabled = false;
      setBadge('Index ready', 'green');
      headerStatus.textContent = `${data.indexed_chunks} chunks indexed — ask anything`;
    }
  } catch (_) {}
}

/* ── Chat ────────────────────────────────────────────────────── */
queryInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuery(); }
});

queryInput.addEventListener('input', () => {
  queryInput.style.height = 'auto';
  queryInput.style.height = Math.min(queryInput.scrollHeight, 140) + 'px';
});

sendBtn.addEventListener('click', sendQuery);

document.querySelectorAll('.hint-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    queryInput.value = chip.dataset.hint;
    queryInput.dispatchEvent(new Event('input'));
    sendQuery();
  });
});

async function sendQuery() {
  const q = queryInput.value.trim();
  if (!q) return;
  if (!isIndexed) { showToast('Ingest PDFs before querying', 'error'); return; }

  if (welcomeState) welcomeState.style.display = 'none';
  appendMsg('user', q);
  queryInput.value = '';
  queryInput.style.height = 'auto';
  sendBtn.disabled = true;
  sourcesBar.style.display = 'none';

  const thinkingId = appendThinking();
  setBadge('Thinking…', 'pulse');

  try {
    const res = await fetch('/query', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:    q,
        provider: currentProvider,
        top_k:    parseInt(topKSlider.value),
      }),
    });
    const data = await res.json();
    removeThinking(thinkingId);
    if (!res.ok) throw new Error(data.error);
    appendMsg('assistant', data.answer);
    renderSources(data.sources || []);
    setBadge('Index ready', 'green');
  } catch (e) {
    removeThinking(thinkingId);
    appendMsg('assistant', `⚠️ ${e.message}`);
    showToast(e.message, 'error');
    setBadge('Index ready', 'green');
  } finally {
    sendBtn.disabled = false;
    scrollBottom();
  }
}

function appendMsg(role, text) {
  const div    = document.createElement('div');
  div.className = `msg ${role}`;
  const avatar  = role === 'user' ? 'You' : 'AI';
  div.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
  `;
  chatBody.appendChild(div);
  scrollBottom();
  return div;
}

function appendThinking() {
  const id      = 'think_' + Date.now();
  const div     = document.createElement('div');
  div.className  = 'msg assistant msg-thinking';
  div.id         = id;
  div.innerHTML  = `
    <div class="msg-avatar">AI</div>
    <div class="msg-bubble">
      <div class="thinking-dots"><span></span><span></span><span></span></div>
      Thinking…
    </div>
  `;
  chatBody.appendChild(div);
  scrollBottom();
  return id;
}

function removeThinking(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function renderSources(sources) {
  if (!sources || !sources.length) return;
  sourcesBar.innerHTML = '';
  sources.forEach(s => {
    const chip  = document.createElement('div');
    chip.className = 'source-chip';
    const fname = s.source ? s.source.split('/').pop().split('\\').pop() : 'Unknown';
    chip.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      ${fname} · p${s.page ?? '?'}
      <span class="source-score">${(s.score * 100).toFixed(0)}%</span>
    `;
    chip.title = s.snippet || '';
    sourcesBar.appendChild(chip);
  });
  sourcesBar.style.display = 'flex';
}

function scrollBottom() { chatBody.scrollTop = chatBody.scrollHeight; }

function escapeHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/* ── Init ────────────────────────────────────────────────────── */
loadConfig();
refreshStatus();