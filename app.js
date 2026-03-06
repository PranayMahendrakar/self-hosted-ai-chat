/**
 * Self-Hosted AI Chat - app.js
 * Browser-based LLM inference using wllama (WebAssembly llama.cpp)
 * No backend, no API keys - everything runs locally in the browser
 *
 * Architecture: Browser -> WebAssembly (llama.cpp) -> Local GGUF Model
 */

// ================================================================
// WLLAMA CDN - WebAssembly llama.cpp wrapper
// ================================================================
const WLLAMA_CDN = 'https://cdn.jsdelivr.net/npm/wllama@1.8.0/esm/index.js';
const WLLAMA_CONFIG = {
  'single-thread/wllama.js': 'https://cdn.jsdelivr.net/npm/wllama@1.8.0/esm/single-thread/wllama.js',
  'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/wllama@1.8.0/esm/single-thread/wllama.wasm',
  'multi-thread/wllama.js': 'https://cdn.jsdelivr.net/npm/wllama@1.8.0/esm/multi-thread/wllama.js',
  'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/wllama@1.8.0/esm/multi-thread/wllama.wasm',
  'multi-thread/wllama.worker.mjs': 'https://cdn.jsdelivr.net/npm/wllama@1.8.0/esm/multi-thread/wllama.worker.mjs',
};

// App state
const state = {
  engine: null, modelLoaded: false, modelName: '',
  isGenerating: false, abortController: null,
  sessions: [], activeSessionId: null,
  cancelDownload: false, wllamaModule: null,
};

let currentMessages = [];
let toastTimer = null;
const $ = id => document.getElementById(id);
const dom = {};

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  const ids = [
    'sidebar','sidebarToggle','newChatBtn','modelSelect','customModelUrl',
    'localModelFile','loadModelBtn','modelName','modelBadge','chatHistory',
    'modelLoadArea','progressBar','loadedBytes','totalBytes','loadPercent',
    'loadTitle','loadSubtitle','cancelLoadBtn','welcomeScreen','messagesArea',
    'messagesContainer','inputArea','messageInput','sendBtn','stopBtn',
    'charCount','statusDot','statusText','modelNameFooter','inferenceStats',
    'toast','quickLoadBtn'
  ];
  ids.forEach(id => dom[id] = $(id));
  loadSessionsFromStorage();
  bindEvents();
  showWelcome();
  if (navigator.gpu) showToast('WebGPU available - GPU acceleration supported!', 'success');
});

// ================================================================
// EVENT BINDING
// ================================================================
function bindEvents() {
  dom.sidebarToggle.addEventListener('click', () => dom.sidebar.classList.toggle('collapsed'));
  dom.newChatBtn.addEventListener('click', startNewChat);
  dom.quickLoadBtn.addEventListener('click', () => {
    dom.modelSelect.value = 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf';
    loadModel();
  });
  dom.loadModelBtn.addEventListener('click', loadModel);
  dom.cancelLoadBtn.addEventListener('click', () => { state.cancelDownload = true; });
  dom.sendBtn.addEventListener('click', sendMessage);
  dom.stopBtn.addEventListener('click', stopGeneration);
  dom.messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  dom.messageInput.addEventListener('input', handleInputChange);
}

// ================================================================
// MODEL LOADING
// ================================================================
async function loadModel() {
  if (dom.localModelFile.files.length > 0) { await loadLocalFile(dom.localModelFile.files[0]); return; }
  const url = dom.customModelUrl.value.trim() || dom.modelSelect.value;
  if (!url) { showToast('Please select or enter a model URL first.', 'warning'); return; }
  const name = dom.customModelUrl.value.trim()
    ? url.split('/').pop().replace(/\.gguf$/i,'')
    : (dom.modelSelect.options[dom.modelSelect.selectedIndex]?.text || url);
  await loadModelFromUrl(url, name);
}

async function loadModelFromUrl(url, name) {
  setStatus('loading', 'Loading...');
  showLoadArea(name);
  state.cancelDownload = false;
  try {
    if (!state.wllamaModule) {
      dom.loadSubtitle.textContent = 'Downloading WASM runtime...';
      state.wllamaModule = await import(WLLAMA_CDN);
    }
    const { Wllama } = state.wllamaModule;
    const engine = new Wllama(WLLAMA_CONFIG, {
      logger: { debug:()=>{}, info:()=>{}, warn: console.warn, error: console.error }
    });
    dom.loadTitle.textContent = 'Downloading model...';
    dom.loadSubtitle.textContent = 'This may take several minutes for large models.';
    await engine.loadModelFromUrl(url, {
      n_ctx: 2048, n_batch: 512, n_threads: navigator.hardwareConcurrency || 4,
      progressCallback: ({ loaded, total }) => {
        if (state.cancelDownload) throw new Error('Cancelled by user');
        const pct = total > 0 ? Math.round((loaded/total)*100) : 0;
        dom.progressBar.style.width = pct + '%';
        dom.loadPercent.textContent = pct + '%';
        dom.loadedBytes.textContent = fmtBytes(loaded);
        dom.totalBytes.textContent = total > 0 ? fmtBytes(total) : '?';
      }
    });
    state.engine = engine;
    onModelLoaded(name);
  } catch(err) {
    hideLoadArea();
    if (state.cancelDownload) { showToast('Loading cancelled.', 'warning'); showWelcome(); }
    else { setStatus('error', 'Failed'); showToast('Load failed: ' + err.message, 'error'); }
  }
}

async function loadLocalFile(file) {
  setStatus('loading', 'Loading...');
  showLoadArea(file.name);
  try {
    if (!state.wllamaModule) {
      dom.loadSubtitle.textContent = 'Loading WASM runtime...';
      state.wllamaModule = await import(WLLAMA_CDN);
    }
    const { Wllama } = state.wllamaModule;
    const engine = new Wllama(WLLAMA_CONFIG);
    dom.loadTitle.textContent = 'Reading local file...';
    dom.loadSubtitle.textContent = 'Loading into memory...';
    const buf = await file.arrayBuffer();
    dom.progressBar.style.width = '100%';
    dom.loadPercent.textContent = '100%';
    dom.loadedBytes.textContent = fmtBytes(buf.byteLength);
    dom.totalBytes.textContent = fmtBytes(buf.byteLength);
    dom.loadSubtitle.textContent = 'Initializing in WebAssembly...';
    await engine.loadModelFromBuffer([{ name: file.name, buffer: buf }], {
      n_ctx: 2048, n_batch: 512, n_threads: navigator.hardwareConcurrency || 4
    });
    state.engine = engine;
    onModelLoaded(file.name.replace(/\.(gguf|bin)$/i, ''));
  } catch(err) {
    hideLoadArea(); setStatus('error', 'Failed');
    showToast('Local file load failed: ' + err.message, 'error');
  }
}

function onModelLoaded(name) {
  state.modelLoaded = true;
  state.modelName = name;
  hideLoadArea();
  setStatus('ready', 'Ready');
  const short = name.length > 22 ? name.slice(0,22)+'...' : name;
  dom.modelName.textContent = short;
  dom.modelBadge.textContent = 'Loaded';
  dom.modelBadge.classList.add('loaded');
  dom.modelNameFooter.textContent = short;
  showChatInterface();
  startNewChat();
  showToast('Model loaded! You can start chatting.', 'success');
}

// ================================================================
// UI SCREENS
// ================================================================
function showWelcome() {
  dom.welcomeScreen.style.display = 'flex';
  dom.messagesArea.style.display = 'none';
  dom.inputArea.style.display = 'none';
  dom.modelLoadArea.style.display = 'none';
}
function showChatInterface() {
  dom.welcomeScreen.style.display = 'none';
  dom.messagesArea.style.display = 'flex';
  dom.inputArea.style.display = 'block';
  dom.modelLoadArea.style.display = 'none';
}
function showLoadArea(name) {
  dom.welcomeScreen.style.display = 'none';
  dom.messagesArea.style.display = 'none';
  dom.inputArea.style.display = 'none';
  dom.modelLoadArea.style.display = 'flex';
  dom.loadTitle.textContent = 'Loading: ' + name;
  dom.loadSubtitle.textContent = 'Initializing...';
  dom.progressBar.style.width = '0%';
  dom.loadPercent.textContent = '0%';
  dom.loadedBytes.textContent = '0 B';
  dom.totalBytes.textContent = '?';
}
function hideLoadArea() { dom.modelLoadArea.style.display = 'none'; }
function setStatus(type, text) {
  dom.statusDot.className = 'status-dot ' + type;
  dom.statusText.textContent = text;
}

// ================================================================
// SESSION MANAGEMENT
// ================================================================
function startNewChat() {
  const id = 'chat_' + Date.now();
  state.sessions.unshift({ id, title: 'New Chat', messages: [], createdAt: Date.now() });
  state.activeSessionId = id;
  currentMessages = [];
  dom.messagesContainer.innerHTML = '';
  renderChatHistory();
  if (state.modelLoaded) showChatInterface();
  saveSessionsToStorage();
  dom.messageInput.focus();
}

function loadSession(id) {
  const s = state.sessions.find(s => s.id === id);
  if (!s) return;
  state.activeSessionId = id;
  currentMessages = [...s.messages];
  dom.messagesContainer.innerHTML = '';
  currentMessages.forEach(m => appendMsg(m.role, m.content, m.timestamp));
  renderChatHistory();
  if (state.modelLoaded) showChatInterface();
  dom.messagesArea.scrollTop = dom.messagesArea.scrollHeight;
}

function renderChatHistory() {
  dom.chatHistory.innerHTML = '';
  if (!state.sessions.length) {
    dom.chatHistory.innerHTML = '<div class="chat-history-empty">No chats yet</div>';
    return;
  }
  state.sessions.forEach(s => {
    const el = document.createElement('div');
    el.className = 'chat-history-item' + (s.id === state.activeSessionId ? ' active' : '');
    el.textContent = s.title; el.title = s.title;
    el.addEventListener('click', () => loadSession(s.id));
    dom.chatHistory.appendChild(el);
  });
}

function updateActiveSession() {
  const s = state.sessions.find(s => s.id === state.activeSessionId);
  if (s) s.messages = [...currentMessages];
  renderChatHistory();
}

function updateTitle(t) {
  const s = state.sessions.find(s => s.id === state.activeSessionId);
  if (s) { s.title = t; renderChatHistory(); }
}

function saveSessionsToStorage() {
  try {
    const d = state.sessions.slice(0,20).map(s => ({...s, messages: s.messages.slice(-50)}));
    localStorage.setItem('localai_sessions', JSON.stringify(d));
  } catch(e) {}
}

function loadSessionsFromStorage() {
  try {
    const d = localStorage.getItem('localai_sessions');
    if (d) { state.sessions = JSON.parse(d); renderChatHistory(); }
  } catch(e) { state.sessions = []; }
}

// ================================================================
// CHAT / INFERENCE
// ================================================================
async function sendMessage() {
  if (!state.modelLoaded) { showToast('Please load a model first.', 'warning'); return; }
  const text = dom.messageInput.value.trim();
  if (!text || state.isGenerating) return;

  const userMsg = { role: 'user', content: text, timestamp: Date.now() };
  currentMessages.push(userMsg);
  updateActiveSession();
  appendMsg('user', text, userMsg.timestamp);
  dom.messageInput.value = '';
  handleInputChange();
  dom.messagesArea.scrollTop = dom.messagesArea.scrollHeight;

  const typingEl = addTypingIndicator();
  state.isGenerating = true;
  state.abortController = new AbortController();
  dom.sendBtn.style.display = 'none';
  dom.stopBtn.style.display = 'flex';
  dom.messageInput.disabled = true;
  setStatus('generating', 'Generating...');

  const t0 = performance.now();
  let tokens = 0;

  try {
    let fullText = '';
    const aiEl = createAIEl();
    typingEl.remove();
    dom.messagesContainer.appendChild(aiEl.wrapper);

    // Build ChatML prompt
    const history = [
      { role: 'system', content: 'You are a helpful, harmless AI assistant running locally in the user\'s browser via WebAssembly. Be concise and accurate.' },
      ...currentMessages.slice(-18).map(m => ({ role: m.role, content: m.content }))
    ];
    const prompt = history.map(m => {
      if (m.role === 'system') return '<|system|>\n' + m.content + '</s>\n';
      if (m.role === 'user') return '<|user|>\n' + m.content + '</s>\n';
      return '<|assistant|>\n' + m.content + '</s>\n';
    }).join('') + '<|assistant|>\n';

    await state.engine.createCompletion(prompt, {
      nPredict: 2048, temperature: 0.7, stopTokens: [2],
      onNewToken: (_tok, _piece, cur) => {
        if (state.abortController.signal.aborted) return false;
        fullText = cur; tokens++;
        aiEl.bubble.innerHTML = fmtContent(cur);
        dom.messagesArea.scrollTop = dom.messagesArea.scrollHeight;
        if (tokens % 10 === 0) {
          const tps = (tokens / ((performance.now()-t0)/1000)).toFixed(1);
          dom.inferenceStats.textContent = tps + ' tok/s';
        }
      }
    });

    const elapsed = ((performance.now()-t0)/1000).toFixed(2);
    const tps = (tokens / parseFloat(elapsed)).toFixed(1);
    dom.inferenceStats.textContent = tokens + ' tokens | ' + tps + ' tok/s | ' + elapsed + 's';

    currentMessages.push({ role: 'assistant', content: fullText, timestamp: Date.now() });
    updateActiveSession();
    if (currentMessages.length === 2) updateTitle(text.slice(0, 40) + (text.length > 40 ? '...' : ''));

  } catch(err) {
    if (!state.abortController?.signal.aborted) {
      appendMsg('ai', 'Error generating response: ' + err.message, Date.now());
      showToast('Error: ' + err.message, 'error');
    }
  } finally {
    state.isGenerating = false;
    dom.sendBtn.style.display = 'flex';
    dom.stopBtn.style.display = 'none';
    dom.messageInput.disabled = false;
    setStatus('ready', 'Ready');
    dom.messagesArea.scrollTop = dom.messagesArea.scrollHeight;
    dom.messageInput.focus();
    saveSessionsToStorage();
  }
}

function stopGeneration() {
  state.abortController?.abort();
  state.isGenerating = false;
  dom.sendBtn.style.display = 'flex';
  dom.stopBtn.style.display = 'none';
  dom.messageInput.disabled = false;
  setStatus('ready', 'Stopped');
}

// ================================================================
// DOM HELPERS
// ================================================================
function appendMsg(role, content, ts) {
  const w = document.createElement('div'); w.className = 'message ' + role;
  const av = document.createElement('div'); av.className = 'message-avatar'; av.textContent = role === 'user' ? '👤' : '🤖';
  const mc = document.createElement('div'); mc.className = 'message-content';
  const bub = document.createElement('div'); bub.className = 'message-bubble'; bub.innerHTML = fmtContent(content);
  const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = fmtTime(ts);
  mc.appendChild(bub); mc.appendChild(meta); w.appendChild(av); w.appendChild(mc);
  dom.messagesContainer.appendChild(w);
}

function createAIEl() {
  const w = document.createElement('div'); w.className = 'message ai';
  const av = document.createElement('div'); av.className = 'message-avatar'; av.textContent = '🤖';
  const mc = document.createElement('div'); mc.className = 'message-content';
  const bub = document.createElement('div'); bub.className = 'message-bubble';
  const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = fmtTime(Date.now());
  mc.appendChild(bub); mc.appendChild(meta); w.appendChild(av); w.appendChild(mc);
  return { wrapper: w, bubble: bub };
}

function addTypingIndicator() {
  const w = document.createElement('div'); w.className = 'message ai';
  const av = document.createElement('div'); av.className = 'message-avatar'; av.textContent = '🤖';
  const mc = document.createElement('div'); mc.className = 'message-content';
  const ind = document.createElement('div'); ind.className = 'typing-indicator';
  for (let i=0;i<3;i++) { const d=document.createElement('div'); d.className='typing-dot'; ind.appendChild(d); }
  mc.appendChild(ind); w.appendChild(av); w.appendChild(mc);
  dom.messagesContainer.appendChild(w);
  dom.messagesArea.scrollTop = dom.messagesArea.scrollHeight;
  return w;
}

// ================================================================
// FORMATTING
// ================================================================
function fmtContent(text) {
  if (!text) return '';
  let h = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_,l,c) => '<pre><code>' + c + '</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/\n/g, '<br>');
  return h;
}

function fmtBytes(b) {
  if (!b || b===0) return '0 B';
  const k=1024, s=['B','KB','MB','GB'], i=Math.floor(Math.log(b)/Math.log(k));
  return (b/Math.pow(k,i)).toFixed(1) + ' ' + s[i];
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

function handleInputChange() {
  const l = dom.messageInput.value.length;
  dom.charCount.textContent = l+'/4096';
  dom.sendBtn.disabled = l===0 || state.isGenerating;
  dom.messageInput.style.height = 'auto';
  dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight,200)+'px';
}

function showToast(msg, type='info') {
  if (toastTimer) clearTimeout(toastTimer);
  dom.toast.textContent = msg;
  dom.toast.className = 'toast '+type+' show';
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 4000);
}

// Debug access
window.LocalAIChat = { state, sendMessage, startNewChat };
console.log('LocalAI Chat ready. Use window.LocalAIChat for debugging.');
