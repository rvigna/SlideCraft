/* ========================================================
   SlideCraft — Presentation Editor Application
   Author: Rodrigo Vigna (rvigna@outlook.com)
   License: MIT
   ======================================================== */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---- Core State ----
  let slides = [];
  let currentSlideIndex = 0;
  let selectedObjectId = null;
  let clipboard = null;
  let undoStack = [];
  let redoStack = [];
  let nextObjectId = 1;
  let currentZoom = 100;
  let autoSaveTimer = null;
  const AUTO_SAVE_DELAY = 1500;

  // ---- Interaction State ----
  let isDragging = false;
  let isResizing = false;
  let isRotating = false;
  let dragThresholdMet = false;
  const DRAG_THRESHOLD = 3;
  let dragStart = { x: 0, y: 0 };
  let dragObjStart = { x: 0, y: 0, w: 0, h: 0, rotation: 0 };
  let resizeHandle = '';

  // ---- DOM ----
  const canvas = $('#slide-canvas');
  const slideList = $('#slide-list');
  const dropdown = $('#dropdown-menu');
  const contextMenu = $('#context-menu');
  const zoomSlider = $('#zoom-slider');

  // ============================================================
  //  SLIDE DATA MODEL
  // ============================================================
  function createBlankSlide() {
    return {
      id: Date.now() + Math.random(),
      background: '#ffffff',
      backgroundImage: '',
      transition: 'none',
      transitionDuration: 0.5,
      objects: [],
      notes: '',
    };
  }

  function createTitleSlide() {
    const slide = createBlankSlide();
    slide.objects.push(
      createTextObject({
        x: 80, y: 140, w: 800, h: 80,
        text: 'Presentation Title',
        fontSize: 44, fontWeight: '700', textAlign: 'center',
        fontFamily: 'Montserrat',
        color: '#1f2937',
      }),
      createTextObject({
        x: 180, y: 240, w: 600, h: 50,
        text: 'Click to add subtitle',
        fontSize: 22, fontWeight: '400', textAlign: 'center',
        fontFamily: 'Inter',
        color: '#6b7280',
      })
    );
    return slide;
  }

  function createTextObject(overrides = {}) {
    return {
      id: nextObjectId++,
      type: 'text',
      x: 100, y: 100, w: 300, h: 60,
      rotation: 0,
      text: 'Text',
      fontFamily: 'Inter',
      fontSize: 24,
      fontWeight: '400',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'left',
      color: '#1f2937',
      backgroundColor: 'transparent',
      borderStyle: 'none',
      borderWidth: 0,
      borderColor: '#000000',
      borderRadius: 0,
      opacity: 100,
      shadow: 'none',
      lineHeight: 1.4,
      ...overrides,
    };
  }

  function createImageObject(src, overrides = {}) {
    return {
      id: nextObjectId++,
      type: 'image',
      x: 100, y: 100, w: 300, h: 200,
      rotation: 0,
      src,
      backgroundColor: 'transparent',
      borderStyle: 'none',
      borderWidth: 0,
      borderColor: '#000000',
      borderRadius: 0,
      opacity: 100,
      shadow: 'none',
      objectFit: 'cover',
      ...overrides,
    };
  }

  function createShapeObject(shapeType, overrides = {}) {
    return {
      id: nextObjectId++,
      type: 'shape',
      shapeType,
      x: 200, y: 150, w: 200, h: 150,
      rotation: 0,
      backgroundColor: '#4361ee',
      borderStyle: 'solid',
      borderWidth: 0,
      borderColor: '#3a56d4',
      borderRadius: 0,
      opacity: 100,
      shadow: 'none',
      text: '',
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: '400',
      color: '#ffffff',
      textAlign: 'center',
      ...overrides,
    };
  }

  function createIconObject(iconClass, overrides = {}) {
    return {
      id: nextObjectId++,
      type: 'icon',
      x: 400, y: 200, w: 80, h: 80,
      rotation: 0,
      iconClass,
      color: '#4361ee',
      fontSize: 48,
      backgroundColor: 'transparent',
      borderStyle: 'none',
      borderWidth: 0,
      borderColor: '#000000',
      borderRadius: 0,
      opacity: 100,
      shadow: 'none',
      ...overrides,
    };
  }

  // ============================================================
  //  CURRENT SLIDE HELPERS
  // ============================================================
  function currentSlide() { return slides[currentSlideIndex]; }

  function getObject(id) {
    return currentSlide()?.objects.find(o => o.id === id) || null;
  }

  function selectedObject() { return getObject(selectedObjectId); }

  // ============================================================
  //  UNDO / REDO
  // ============================================================
  function pushUndo() {
    undoStack.push(JSON.parse(JSON.stringify({ slides, currentSlideIndex, nextObjectId })));
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.parse(JSON.stringify({ slides, currentSlideIndex, nextObjectId })));
    const state = undoStack.pop();
    slides = state.slides;
    currentSlideIndex = Math.min(state.currentSlideIndex, slides.length - 1);
    nextObjectId = state.nextObjectId;
    selectedObjectId = null;
    renderAll();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.parse(JSON.stringify({ slides, currentSlideIndex, nextObjectId })));
    const state = redoStack.pop();
    slides = state.slides;
    currentSlideIndex = Math.min(state.currentSlideIndex, slides.length - 1);
    nextObjectId = state.nextObjectId;
    selectedObjectId = null;
    renderAll();
  }

  // ============================================================
  //  RENDERING
  // ============================================================
  function renderAll() {
    renderSlidePanel();
    renderCanvas();
    updatePropertiesPanel();
    updateStatusBar();
  }

  // ---- Slide Panel (Thumbnails) ----
  function renderSlidePanel() {
    slideList.innerHTML = '';
    slides.forEach((slide, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'slide-thumb' + (i === currentSlideIndex ? ' active' : '');
      thumb.dataset.index = i;

      const inner = document.createElement('div');
      inner.className = 'slide-thumb-inner';
      inner.style.background = slide.backgroundImage
        ? `url(${slide.backgroundImage}) center/cover`
        : slide.background;

      // Mini render objects
      const scale = 184 / 960; // thumb width / slide width
      slide.objects.forEach(obj => {
        const mini = createMiniObject(obj, scale);
        if (mini) inner.appendChild(mini);
      });

      const num = document.createElement('div');
      num.className = 'slide-thumb-number';
      num.textContent = i + 1;

      thumb.appendChild(inner);
      thumb.appendChild(num);
      slideList.appendChild(thumb);

      // Click to select slide
      thumb.addEventListener('click', () => {
        saveCurrentEditing();
        currentSlideIndex = i;
        selectedObjectId = null;
        renderAll();
      });

      // Context menu
      thumb.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showSlideContextMenu(e, i);
      });
    });
  }

  function createMiniObject(obj, scale) {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = (obj.x * scale) + 'px';
    div.style.top = (obj.y * scale) + 'px';
    div.style.width = (obj.w * scale) + 'px';
    div.style.height = (obj.h * scale) + 'px';
    div.style.opacity = (obj.opacity || 100) / 100;
    if (obj.rotation) div.style.transform = `rotate(${obj.rotation}deg)`;
    div.style.overflow = 'hidden';
    div.style.borderRadius = (obj.borderRadius * scale || 0) + 'px';

    if (obj.type === 'text') {
      div.style.fontSize = Math.max(4, obj.fontSize * scale) + 'px';
      div.style.fontFamily = obj.fontFamily;
      div.style.fontWeight = obj.fontWeight;
      div.style.fontStyle = obj.fontStyle;
      div.style.color = obj.color;
      div.style.textAlign = obj.textAlign;
      div.style.lineHeight = obj.lineHeight || 1.4;
      div.style.backgroundColor = obj.backgroundColor !== 'transparent' ? obj.backgroundColor : '';
      div.textContent = obj.text;
    } else if (obj.type === 'image') {
      const img = document.createElement('img');
      img.src = obj.src;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = obj.objectFit || 'cover';
      div.appendChild(img);
    } else if (obj.type === 'shape') {
      div.style.backgroundColor = obj.backgroundColor;
      if (obj.shapeType === 'circle' || obj.shapeType === 'ellipse') {
        div.style.borderRadius = '50%';
      } else if (obj.shapeType === 'rounded-rect') {
        div.style.borderRadius = (12 * scale) + 'px';
      } else if (obj.shapeType === 'triangle') {
        div.style.backgroundColor = 'transparent';
        div.style.borderLeft = `${obj.w * scale / 2}px solid transparent`;
        div.style.borderRight = `${obj.w * scale / 2}px solid transparent`;
        div.style.borderBottom = `${obj.h * scale}px solid ${obj.backgroundColor}`;
        div.style.width = '0';
        div.style.height = '0';
      }
    } else if (obj.type === 'icon') {
      const icon = document.createElement('i');
      icon.className = obj.iconClass;
      icon.style.fontSize = Math.max(6, obj.fontSize * scale) + 'px';
      icon.style.color = obj.color;
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'center';
      div.appendChild(icon);
    }

    return div;
  }

  // ---- Main Canvas ----
  function renderCanvas() {
    const slide = currentSlide();
    if (!slide) return;

    canvas.style.background = slide.backgroundImage
      ? `url(${slide.backgroundImage}) center/cover`
      : slide.background;

    // Preserve editing state
    const editingEl = canvas.querySelector('[contenteditable="true"]');
    let editingObjId = null;
    let savedSelection = null;
    if (editingEl) {
      editingObjId = parseInt(editingEl.closest('.slide-object')?.dataset.id);
      savedSelection = saveSelection(editingEl);
      // Sync current text content back to model before re-rendering
      const editObj = getObject(editingObjId);
      if (editObj && editObj.type === 'text') {
        editObj.text = editingEl.innerHTML;
      }
    }

    canvas.innerHTML = '';

    slide.objects.forEach(obj => {
      const el = createObjectElement(obj);
      canvas.appendChild(el);

      if (obj.id === editingObjId && obj.type === 'text') {
        const textEl = el.querySelector('.obj-text');
        textEl.contentEditable = 'true';
        el.classList.add('editing');
        setTimeout(() => {
          textEl.focus();
          if (savedSelection) restoreSelection(textEl, savedSelection);
        }, 0);
      }
    });
  }

  function createObjectElement(obj) {
    const wrapper = document.createElement('div');
    wrapper.className = 'slide-object' + (obj.id === selectedObjectId ? ' selected' : '');
    wrapper.dataset.id = obj.id;

    // Position and size
    wrapper.style.left = obj.x + 'px';
    wrapper.style.top = obj.y + 'px';
    wrapper.style.width = obj.w + 'px';
    wrapper.style.height = obj.h + 'px';
    wrapper.style.opacity = (obj.opacity ?? 100) / 100;
    if (obj.rotation) wrapper.style.transform = `rotate(${obj.rotation}deg)`;

    // Border
    if (obj.borderStyle && obj.borderStyle !== 'none' && obj.borderWidth > 0) {
      wrapper.style.border = `${obj.borderWidth}px ${obj.borderStyle} ${obj.borderColor}`;
    }
    if (obj.borderRadius) wrapper.style.borderRadius = obj.borderRadius + 'px';

    // Shadow
    const shadowMap = {
      sm: '0 1px 3px rgba(0,0,0,0.15)',
      md: '0 4px 12px rgba(0,0,0,0.2)',
      lg: '0 8px 30px rgba(0,0,0,0.25)',
    };
    if (obj.shadow && obj.shadow !== 'none') {
      wrapper.style.boxShadow = shadowMap[obj.shadow] || '';
    }

    // Content
    if (obj.type === 'text') {
      const textDiv = document.createElement('div');
      textDiv.className = 'obj-text';
      textDiv.style.fontFamily = obj.fontFamily;
      textDiv.style.fontSize = obj.fontSize + 'px';
      textDiv.style.fontWeight = obj.fontWeight;
      textDiv.style.fontStyle = obj.fontStyle || 'normal';
      textDiv.style.textDecoration = obj.textDecoration || 'none';
      textDiv.style.textAlign = obj.textAlign;
      textDiv.style.color = obj.color;
      textDiv.style.lineHeight = obj.lineHeight || 1.4;
      textDiv.style.width = '100%';
      textDiv.style.height = '100%';
      if (obj.backgroundColor && obj.backgroundColor !== 'transparent') {
        wrapper.style.backgroundColor = obj.backgroundColor;
      }
      textDiv.innerHTML = obj.text || '';
      wrapper.appendChild(textDiv);
    } else if (obj.type === 'image') {
      wrapper.classList.add('obj-image-wrap');
      const imgDiv = document.createElement('div');
      imgDiv.className = 'obj-image';
      imgDiv.style.width = '100%';
      imgDiv.style.height = '100%';
      const img = document.createElement('img');
      img.src = obj.src;
      img.style.objectFit = obj.objectFit || 'cover';
      img.draggable = false;
      imgDiv.appendChild(img);
      wrapper.appendChild(imgDiv);
    } else if (obj.type === 'shape') {
      const shapeDiv = document.createElement('div');
      shapeDiv.className = 'obj-shape';
      shapeDiv.style.width = '100%';
      shapeDiv.style.height = '100%';
      shapeDiv.style.backgroundColor = obj.backgroundColor;

      if (obj.shapeType === 'circle' || obj.shapeType === 'ellipse') {
        shapeDiv.style.borderRadius = '50%';
      } else if (obj.shapeType === 'rounded-rect') {
        shapeDiv.style.borderRadius = '12px';
      } else if (obj.shapeType === 'triangle') {
        shapeDiv.style.backgroundColor = 'transparent';
        shapeDiv.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="50,0 100,100 0,100" fill="${obj.backgroundColor}"/>
        </svg>`;
      } else if (obj.shapeType === 'diamond') {
        shapeDiv.style.backgroundColor = 'transparent';
        shapeDiv.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="50,0 100,50 50,100 0,50" fill="${obj.backgroundColor}"/>
        </svg>`;
      } else if (obj.shapeType === 'arrow-right') {
        shapeDiv.style.backgroundColor = 'transparent';
        shapeDiv.innerHTML = `<svg viewBox="0 0 100 60" preserveAspectRatio="none">
          <polygon points="0,10 70,10 70,0 100,30 70,60 70,50 0,50" fill="${obj.backgroundColor}"/>
        </svg>`;
      } else if (obj.shapeType === 'arrow-left') {
        shapeDiv.style.backgroundColor = 'transparent';
        shapeDiv.innerHTML = `<svg viewBox="0 0 100 60" preserveAspectRatio="none">
          <polygon points="30,0 30,10 100,10 100,50 30,50 30,60 0,30" fill="${obj.backgroundColor}"/>
        </svg>`;
      } else if (obj.shapeType === 'star') {
        shapeDiv.style.backgroundColor = 'transparent';
        shapeDiv.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35" fill="${obj.backgroundColor}"/>
        </svg>`;
      } else if (obj.shapeType === 'hexagon') {
        shapeDiv.style.backgroundColor = 'transparent';
        shapeDiv.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="25,0 75,0 100,50 75,100 25,100 0,50" fill="${obj.backgroundColor}"/>
        </svg>`;
      } else if (obj.shapeType === 'line') {
        shapeDiv.style.backgroundColor = 'transparent';
        shapeDiv.innerHTML = `<svg viewBox="0 0 100 10" preserveAspectRatio="none">
          <line x1="0" y1="5" x2="100" y2="5" stroke="${obj.backgroundColor}" stroke-width="4"/>
        </svg>`;
      }

      // Shape text overlay
      if (obj.text && obj.shapeType !== 'line') {
        const textOverlay = document.createElement('div');
        textOverlay.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:8px;font-family:${obj.fontFamily};font-size:${obj.fontSize}px;font-weight:${obj.fontWeight};color:${obj.color};text-align:${obj.textAlign};pointer-events:none;`;
        textOverlay.textContent = obj.text;
        wrapper.style.position = 'absolute';
        shapeDiv.style.position = 'relative';
        shapeDiv.appendChild(textOverlay);
      }

      wrapper.appendChild(shapeDiv);
    } else if (obj.type === 'icon') {
      const iconDiv = document.createElement('div');
      iconDiv.className = 'obj-icon';
      iconDiv.style.width = '100%';
      iconDiv.style.height = '100%';
      iconDiv.style.fontSize = obj.fontSize + 'px';
      iconDiv.style.color = obj.color;
      if (obj.backgroundColor && obj.backgroundColor !== 'transparent') {
        wrapper.style.backgroundColor = obj.backgroundColor;
      }
      const icon = document.createElement('i');
      icon.className = obj.iconClass;
      iconDiv.appendChild(icon);
      wrapper.appendChild(iconDiv);
    }

    // Resize handles
    ['nw','n','ne','e','se','s','sw','w'].forEach(dir => {
      const handle = document.createElement('div');
      handle.className = `resize-handle ${dir}`;
      handle.dataset.dir = dir;
      wrapper.appendChild(handle);
    });

    // Rotate handle
    const rotateH = document.createElement('div');
    rotateH.className = 'rotate-handle';
    wrapper.appendChild(rotateH);

    return wrapper;
  }

  // ---- Properties Panel ----
  function updatePropertiesPanel() {
    const obj = selectedObject();
    const slide = currentSlide();

    // Transition
    if (slide) {
      $('#prop-transition').value = slide.transition || 'none';
      $('#prop-transition-duration').value = slide.transitionDuration || 0.5;
      $('#speaker-notes').value = slide.notes || '';
    }

    if (!obj) {
      $('#section-position').style.display = 'none';
      $('#section-appearance').style.display = 'none';
      return;
    }

    $('#section-position').style.display = '';
    $('#section-appearance').style.display = '';

    $('#prop-x').value = Math.round(obj.x);
    $('#prop-y').value = Math.round(obj.y);
    $('#prop-w').value = Math.round(obj.w);
    $('#prop-h').value = Math.round(obj.h);
    $('#prop-rotation').value = Math.round(obj.rotation || 0);
    $('#prop-opacity').value = obj.opacity ?? 100;
    $('#prop-border-style').value = obj.borderStyle || 'none';
    $('#prop-border-width').value = obj.borderWidth || 0;
    $('#prop-border-radius').value = obj.borderRadius || 0;
    $('#prop-shadow').value = obj.shadow || 'none';

    // Update toolbar state for text
    if (obj.type === 'text' || obj.type === 'shape') {
      $('#font-family').value = obj.fontFamily || 'Inter';
      $('#font-size').value = obj.fontSize || 24;
      $('#btn-bold').classList.toggle('active', obj.fontWeight === 'bold' || parseInt(obj.fontWeight) >= 700);
      $('#btn-italic').classList.toggle('active', obj.fontStyle === 'italic');
      $('#btn-underline').classList.toggle('active', obj.textDecoration === 'underline');
      $('#btn-strikethrough').classList.toggle('active', obj.textDecoration === 'line-through');
    }
  }

  function updateStatusBar() {
    $('#slide-counter').textContent = `Slide ${currentSlideIndex + 1} of ${slides.length}`;
    const objCount = currentSlide()?.objects.length || 0;
    $('#object-count').textContent = `${objCount} object${objCount !== 1 ? 's' : ''}`;
  }

  // ============================================================
  //  OBJECT INTERACTION: DRAG, RESIZE, ROTATE
  // ============================================================
  canvas.addEventListener('mousedown', (e) => {
    const resizeH = e.target.closest('.resize-handle');
    const rotateH = e.target.closest('.rotate-handle');
    const objEl = e.target.closest('.slide-object');

    // Close any text editing first
    if (!objEl || (objEl && parseInt(objEl.dataset.id) !== selectedObjectId)) {
      saveCurrentEditing();
    }

    if (resizeH && selectedObjectId) {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      resizeHandle = resizeH.dataset.dir;
      const obj = selectedObject();
      dragStart = { x: e.clientX, y: e.clientY };
      dragObjStart = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
      pushUndo();
      return;
    }

    if (rotateH && selectedObjectId) {
      e.preventDefault();
      e.stopPropagation();
      isRotating = true;
      const obj = selectedObject();
      const rect = canvas.getBoundingClientRect();
      const scale = currentZoom / 100;
      const cx = rect.left + (obj.x + obj.w / 2) * scale;
      const cy = rect.top + (obj.y + obj.h / 2) * scale;
      dragStart = { x: cx, y: cy };
      const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
      dragObjStart = { rotation: obj.rotation || 0, startAngle };
      pushUndo();
      return;
    }

    if (objEl) {
      const id = parseInt(objEl.dataset.id);
      if (id === selectedObjectId && objEl.classList.contains('editing')) {
        return; // Already editing text, don't move
      }
      const wasAlreadySelected = (id === selectedObjectId);
      selectedObjectId = id;
      isDragging = true;
      dragThresholdMet = false;
      const obj = getObject(id);
      const rect = canvas.getBoundingClientRect();
      const scale = currentZoom / 100;
      dragStart = { x: e.clientX, y: e.clientY };
      dragObjStart = { x: obj.x, y: obj.y };
      // Only re-render if selecting a different object;
      // re-rendering on same object destroys DOM and breaks dblclick
      if (!wasAlreadySelected) {
        renderAll();
      }
    } else {
      selectedObjectId = null;
      renderAll();
    }
  });

  canvas.addEventListener('dblclick', (e) => {
    // Cancel any drag that started from the mousedown events of this dblclick
    isDragging = false;

    // Find the object element — try e.target first, fall back to querying by selectedObjectId
    let objEl = e.target.closest('.slide-object');
    let id;
    if (objEl) {
      id = parseInt(objEl.dataset.id);
    } else if (selectedObjectId) {
      id = selectedObjectId;
      objEl = canvas.querySelector(`.slide-object[data-id="${id}"]`);
    }
    if (!objEl || !id) return;

    const obj = getObject(id);
    if (!obj) return;

    if (obj.type === 'text') {
      selectedObjectId = id;
      const textEl = objEl.querySelector('.obj-text');
      if (textEl) {
        textEl.contentEditable = 'true';
        objEl.classList.add('editing');
        textEl.focus();
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(textEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else if (obj.type === 'shape' && !obj.text) {
      // Allow adding text to shapes
      const text = prompt('Enter text for this shape:', obj.text || '');
      if (text !== null) {
        pushUndo();
        obj.text = text;
        renderAll();
        scheduleAutoSave();
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    const scale = currentZoom / 100;

    if (isDragging && selectedObjectId) {
      const obj = selectedObject();
      if (!obj) return;

      // Require a minimum movement before initiating actual drag
      // to prevent accidental micro-drags during double-click
      if (!dragThresholdMet) {
        const rawDx = Math.abs(e.clientX - dragStart.x);
        const rawDy = Math.abs(e.clientY - dragStart.y);
        if (rawDx < DRAG_THRESHOLD && rawDy < DRAG_THRESHOLD) return;
        dragThresholdMet = true;
        pushUndo();
      }

      const dx = (e.clientX - dragStart.x) / scale;
      const dy = (e.clientY - dragStart.y) / scale;
      obj.x = Math.round(dragObjStart.x + dx);
      obj.y = Math.round(dragObjStart.y + dy);

      // Snap to edges
      const snap = 5;
      if (Math.abs(obj.x) < snap) obj.x = 0;
      if (Math.abs(obj.y) < snap) obj.y = 0;
      if (Math.abs(obj.x + obj.w - 960) < snap) obj.x = 960 - obj.w;
      if (Math.abs(obj.y + obj.h - 540) < snap) obj.y = 540 - obj.h;
      // Center snap
      if (Math.abs(obj.x + obj.w/2 - 480) < snap) obj.x = 480 - obj.w/2;
      if (Math.abs(obj.y + obj.h/2 - 270) < snap) obj.y = 270 - obj.h/2;

      renderCanvas();
      updatePropertiesPanel();
    }

    if (isResizing && selectedObjectId) {
      const obj = selectedObject();
      if (!obj) return;
      const dx = (e.clientX - dragStart.x) / scale;
      const dy = (e.clientY - dragStart.y) / scale;

      const d = resizeHandle;
      let newX = dragObjStart.x;
      let newY = dragObjStart.y;
      let newW = dragObjStart.w;
      let newH = dragObjStart.h;

      if (d.includes('e')) newW = Math.max(20, dragObjStart.w + dx);
      if (d.includes('w')) { newW = Math.max(20, dragObjStart.w - dx); newX = dragObjStart.x + dx; }
      if (d.includes('s')) newH = Math.max(20, dragObjStart.h + dy);
      if (d.includes('n')) { newH = Math.max(20, dragObjStart.h - dy); newY = dragObjStart.y + dy; }

      // Shift for proportional resize
      if (e.shiftKey) {
        const ratio = dragObjStart.w / dragObjStart.h;
        if (d === 'se' || d === 'nw' || d === 'ne' || d === 'sw') {
          newH = newW / ratio;
        }
      }

      obj.x = Math.round(newX);
      obj.y = Math.round(newY);
      obj.w = Math.round(newW);
      obj.h = Math.round(newH);
      renderCanvas();
      updatePropertiesPanel();
    }

    if (isRotating && selectedObjectId) {
      const obj = selectedObject();
      if (!obj) return;
      const angle = Math.atan2(e.clientY - dragStart.y, e.clientX - dragStart.x);
      const currentAngle = angle * 180 / Math.PI + 90;
      let deg = dragObjStart.rotation + (currentAngle - dragObjStart.startAngle);
      // Snap to 15deg increments if shift held
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((deg % 360) + 360) % 360;
      obj.rotation = Math.round(deg);
      renderCanvas();
      updatePropertiesPanel();
    }
  });

  document.addEventListener('mouseup', () => {
    if ((isDragging && dragThresholdMet) || isResizing || isRotating) {
      scheduleAutoSave();
    }
    isDragging = false;
    dragThresholdMet = false;
    isResizing = false;
    isRotating = false;
  });

  // ============================================================
  //  TEXT EDITING
  // ============================================================

  // Sync the current contenteditable text back to the data model
  // WITHOUT exiting edit mode (used by auto-save and renderCanvas)
  function syncEditingContent() {
    const editingEl = canvas.querySelector('[contenteditable="true"]');
    if (editingEl) {
      const objEl = editingEl.closest('.slide-object');
      const id = parseInt(objEl.dataset.id);
      const obj = getObject(id);
      if (obj && obj.type === 'text') {
        obj.text = editingEl.innerHTML;
      }
    }
  }

  // Save text content AND exit edit mode
  function saveCurrentEditing() {
    const editingEl = canvas.querySelector('[contenteditable="true"]');
    if (editingEl) {
      syncEditingContent();
      editingEl.contentEditable = 'false';
      editingEl.closest('.slide-object')?.classList.remove('editing');
      scheduleAutoSave();
    }
  }

  // Selection save / restore for text editing
  function saveSelection(containerEl) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(containerEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    return { start: preRange.toString().length, length: range.toString().length };
  }

  function restoreSelection(containerEl, saved) {
    if (!saved) return;
    const range = document.createRange();
    const sel = window.getSelection();
    let charCount = 0;
    let startNode, startOffset, endNode, endOffset;

    function walk(node) {
      if (node.nodeType === 3) {
        const nextCount = charCount + node.textContent.length;
        if (!startNode && saved.start <= nextCount) {
          startNode = node;
          startOffset = saved.start - charCount;
        }
        if (!endNode && (saved.start + saved.length) <= nextCount) {
          endNode = node;
          endOffset = (saved.start + saved.length) - charCount;
        }
        charCount = nextCount;
      } else {
        for (const child of node.childNodes) walk(child);
      }
    }
    walk(containerEl);

    if (startNode) {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode || startNode, endOffset || startOffset);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // ============================================================
  //  TOOLBAR EVENT HANDLERS
  // ============================================================
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);

  // Insert text box
  $('#btn-add-text').addEventListener('click', () => {
    pushUndo();
    const obj = createTextObject({
      x: 100 + Math.random() * 100,
      y: 100 + Math.random() * 100,
    });
    currentSlide().objects.push(obj);
    selectedObjectId = obj.id;
    renderAll();
    scheduleAutoSave();
  });

  // Insert image
  $('#btn-add-image').addEventListener('click', showImageDialog);

  // Insert shape
  $('#btn-add-shape').addEventListener('click', (e) => {
    const picker = $('#shape-picker');
    if (picker.style.display === 'none') {
      const rect = e.currentTarget.getBoundingClientRect();
      picker.style.left = rect.left + 'px';
      picker.style.top = rect.bottom + 4 + 'px';
      picker.style.display = 'block';
    } else {
      picker.style.display = 'none';
    }
  });

  // Insert icon
  $('#btn-add-icon').addEventListener('click', (e) => {
    const picker = $('#icon-picker');
    if (picker.style.display === 'none') {
      const rect = e.currentTarget.getBoundingClientRect();
      picker.style.left = rect.left + 'px';
      picker.style.top = rect.bottom + 4 + 'px';
      picker.style.display = 'block';
      $('#icon-search').focus();
    } else {
      picker.style.display = 'none';
    }
  });

  // Font family
  $('#font-family').addEventListener('change', (e) => {
    const obj = selectedObject();
    if (!obj || (obj.type !== 'text' && obj.type !== 'shape')) return;
    pushUndo();
    obj.fontFamily = e.target.value;
    applyInlineTextStyle();
    renderAll();
    scheduleAutoSave();
  });

  // Font size
  function changeFontSize(size) {
    const obj = selectedObject();
    if (!obj || (obj.type !== 'text' && obj.type !== 'shape')) return;
    pushUndo();
    obj.fontSize = Math.max(1, Math.min(400, parseInt(size) || 24));
    $('#font-size').value = obj.fontSize;
    renderAll();
    scheduleAutoSave();
  }

  $('#font-size').addEventListener('change', (e) => changeFontSize(e.target.value));
  $('#font-size').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); changeFontSize(e.target.value); } });
  $('#btn-font-decrease').addEventListener('click', () => {
    const cur = parseInt($('#font-size').value) || 24;
    changeFontSize(cur - 2);
  });
  $('#btn-font-increase').addEventListener('click', () => {
    const cur = parseInt($('#font-size').value) || 24;
    changeFontSize(cur + 2);
  });

  // Bold, Italic, Underline, Strikethrough
  $('#btn-bold').addEventListener('click', () => toggleTextProp('fontWeight', 'bold', '400'));
  $('#btn-italic').addEventListener('click', () => toggleTextProp('fontStyle', 'italic', 'normal'));
  $('#btn-underline').addEventListener('click', () => toggleTextProp('textDecoration', 'underline', 'none'));
  $('#btn-strikethrough').addEventListener('click', () => toggleTextProp('textDecoration', 'line-through', 'none'));

  function toggleTextProp(prop, onVal, offVal) {
    const obj = selectedObject();
    if (!obj || (obj.type !== 'text' && obj.type !== 'shape')) return;
    pushUndo();
    obj[prop] = obj[prop] === onVal ? offVal : onVal;
    renderAll();
    scheduleAutoSave();
  }

  function applyInlineTextStyle() {
    // Only applies to the data model; canvas re-renders
  }

  // Text color
  $('#btn-text-color').addEventListener('click', () => $('#text-color-picker').click());
  $('#text-color-picker').addEventListener('input', (e) => {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    obj.color = e.target.value;
    $('#text-color-indicator').style.background = e.target.value;
    renderAll();
    scheduleAutoSave();
  });

  // Fill color
  $('#btn-fill-color').addEventListener('click', () => $('#fill-color-picker').click());
  $('#fill-color-picker').addEventListener('input', (e) => {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    obj.backgroundColor = e.target.value;
    $('#fill-color-indicator').style.background = e.target.value;
    renderAll();
    scheduleAutoSave();
  });

  // Border color
  $('#btn-border-color').addEventListener('click', () => $('#border-color-picker').click());
  $('#border-color-picker').addEventListener('input', (e) => {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    obj.borderColor = e.target.value;
    if (obj.borderStyle === 'none') obj.borderStyle = 'solid';
    if (!obj.borderWidth) obj.borderWidth = 2;
    $('#border-color-indicator').style.background = e.target.value;
    renderAll();
    scheduleAutoSave();
  });

  // Alignment
  $('#btn-align-left').addEventListener('click', () => setAlignment('left'));
  $('#btn-align-center').addEventListener('click', () => setAlignment('center'));
  $('#btn-align-right').addEventListener('click', () => setAlignment('right'));

  function setAlignment(align) {
    const obj = selectedObject();
    if (!obj || (obj.type !== 'text' && obj.type !== 'shape')) return;
    pushUndo();
    obj.textAlign = align;
    renderAll();
    scheduleAutoSave();
  }

  // Lists (insert as html in text objects)
  $('#btn-ul').addEventListener('click', () => insertListHTML('ul'));
  $('#btn-ol').addEventListener('click', () => insertListHTML('ol'));

  function insertListHTML(tag) {
    const obj = selectedObject();
    if (!obj || obj.type !== 'text') return;
    pushUndo();
    const isAlready = obj.text.includes(`<${tag}>`);
    if (isAlready) {
      obj.text = obj.text.replace(/<\/?[uo]l>/g, '').replace(/<li>/g, '').replace(/<\/li>/g, '<br>');
    } else {
      const lines = (obj.text || 'Item 1').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').split('\n').filter(l => l.trim());
      obj.text = `<${tag}>${lines.map(l => `<li>${l}</li>`).join('')}</${tag}>`;
    }
    renderAll();
    scheduleAutoSave();
  }

  // Arrange: bring to front, send to back
  $('#btn-bring-front').addEventListener('click', () => {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    const arr = currentSlide().objects;
    const idx = arr.findIndex(o => o.id === obj.id);
    if (idx < arr.length - 1) {
      arr.splice(idx, 1);
      arr.push(obj);
      renderAll();
      scheduleAutoSave();
    }
  });

  $('#btn-send-back').addEventListener('click', () => {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    const arr = currentSlide().objects;
    const idx = arr.findIndex(o => o.id === obj.id);
    if (idx > 0) {
      arr.splice(idx, 1);
      arr.unshift(obj);
      renderAll();
      scheduleAutoSave();
    }
  });

  // Delete
  $('#btn-delete-obj').addEventListener('click', deleteSelectedObject);

  function deleteSelectedObject() {
    if (!selectedObjectId) return;
    pushUndo();
    const arr = currentSlide().objects;
    const idx = arr.findIndex(o => o.id === selectedObjectId);
    if (idx >= 0) arr.splice(idx, 1);
    selectedObjectId = null;
    renderAll();
    scheduleAutoSave();
  }

  // Slide background
  $('#btn-slide-bg').addEventListener('click', () => $('#slide-bg-picker').click());
  $('#slide-bg-picker').addEventListener('input', (e) => {
    pushUndo();
    currentSlide().background = e.target.value;
    currentSlide().backgroundImage = '';
    $('#slide-bg-indicator').style.background = e.target.value;
    renderAll();
    scheduleAutoSave();
  });

  // Add slide
  $('#btn-add-slide').addEventListener('click', () => {
    pushUndo();
    const newSlide = createBlankSlide();
    slides.splice(currentSlideIndex + 1, 0, newSlide);
    currentSlideIndex++;
    selectedObjectId = null;
    renderAll();
    scheduleAutoSave();
  });

  // ---- Properties Panel Inputs ----
  ['prop-x', 'prop-y', 'prop-w', 'prop-h', 'prop-rotation'].forEach(id => {
    $(`#${id}`).addEventListener('change', (e) => {
      const obj = selectedObject();
      if (!obj) return;
      pushUndo();
      const key = { 'prop-x': 'x', 'prop-y': 'y', 'prop-w': 'w', 'prop-h': 'h', 'prop-rotation': 'rotation' }[id];
      obj[key] = parseInt(e.target.value) || 0;
      renderAll();
      scheduleAutoSave();
    });
  });

  $('#prop-opacity').addEventListener('input', (e) => {
    const obj = selectedObject();
    if (!obj) return;
    obj.opacity = parseInt(e.target.value);
    renderCanvas();
  });
  $('#prop-opacity').addEventListener('change', () => { pushUndo(); scheduleAutoSave(); });

  $('#prop-border-style').addEventListener('change', (e) => {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    obj.borderStyle = e.target.value;
    if (e.target.value !== 'none' && !obj.borderWidth) obj.borderWidth = 2;
    renderAll();
    scheduleAutoSave();
  });

  $('#prop-border-width').addEventListener('change', (e) => {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    obj.borderWidth = parseInt(e.target.value) || 0;
    renderAll();
    scheduleAutoSave();
  });

  $('#prop-border-radius').addEventListener('change', (e) => {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    obj.borderRadius = parseInt(e.target.value) || 0;
    renderAll();
    scheduleAutoSave();
  });

  $('#prop-shadow').addEventListener('change', (e) => {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    obj.shadow = e.target.value;
    renderAll();
    scheduleAutoSave();
  });

  // Transition
  $('#prop-transition').addEventListener('change', (e) => {
    pushUndo();
    currentSlide().transition = e.target.value;
    scheduleAutoSave();
  });
  $('#prop-transition-duration').addEventListener('change', (e) => {
    pushUndo();
    currentSlide().transitionDuration = parseFloat(e.target.value) || 0.5;
    scheduleAutoSave();
  });

  // Speaker notes
  $('#speaker-notes').addEventListener('input', (e) => {
    currentSlide().notes = e.target.value;
    scheduleAutoSave();
  });

  // ============================================================
  //  SHAPE PICKER
  // ============================================================
  const shapes = [
    { type: 'rect', label: 'Rectangle', svg: '<rect x="4" y="6" width="20" height="16" rx="1" fill="#4361ee" />' },
    { type: 'rounded-rect', label: 'Rounded Rect', svg: '<rect x="4" y="6" width="20" height="16" rx="4" fill="#4361ee" />' },
    { type: 'circle', label: 'Circle', svg: '<circle cx="14" cy="14" r="10" fill="#4361ee" />' },
    { type: 'ellipse', label: 'Ellipse', svg: '<ellipse cx="14" cy="14" rx="12" ry="8" fill="#4361ee" />' },
    { type: 'triangle', label: 'Triangle', svg: '<polygon points="14,3 26,25 2,25" fill="#4361ee" />' },
    { type: 'diamond', label: 'Diamond', svg: '<polygon points="14,2 26,14 14,26 2,14" fill="#4361ee" />' },
    { type: 'star', label: 'Star', svg: '<polygon points="14,2 17,10 26,10 19,16 21,25 14,20 7,25 9,16 2,10 11,10" fill="#4361ee" />' },
    { type: 'hexagon', label: 'Hexagon', svg: '<polygon points="7,3 21,3 28,14 21,25 7,25 0,14" fill="#4361ee" />' },
    { type: 'arrow-right', label: 'Arrow Right', svg: '<polygon points="2,8 18,8 18,3 26,14 18,25 18,20 2,20" fill="#4361ee" />' },
    { type: 'arrow-left', label: 'Arrow Left', svg: '<polygon points="10,3 10,8 26,8 26,20 10,20 10,25 2,14" fill="#4361ee" />' },
    { type: 'line', label: 'Line', svg: '<line x1="2" y1="14" x2="26" y2="14" stroke="#4361ee" stroke-width="3" />' },
  ];

  function buildShapePicker() {
    const grid = $('#shape-grid');
    shapes.forEach(s => {
      const item = document.createElement('div');
      item.className = 'shape-grid-item';
      item.title = s.label;
      item.innerHTML = `<svg viewBox="0 0 28 28">${s.svg}</svg>`;
      item.addEventListener('click', () => {
        pushUndo();
        const obj = createShapeObject(s.type);
        if (s.type === 'line') { obj.h = 8; obj.w = 300; }
        currentSlide().objects.push(obj);
        selectedObjectId = obj.id;
        $('#shape-picker').style.display = 'none';
        renderAll();
        scheduleAutoSave();
      });
      grid.appendChild(item);
    });
  }

  // ============================================================
  //  ICON PICKER
  // ============================================================
  const commonIcons = [
    'fa-solid fa-star', 'fa-solid fa-heart', 'fa-solid fa-check', 'fa-solid fa-xmark',
    'fa-solid fa-arrow-right', 'fa-solid fa-arrow-left', 'fa-solid fa-arrow-up', 'fa-solid fa-arrow-down',
    'fa-solid fa-circle-check', 'fa-solid fa-circle-xmark', 'fa-solid fa-circle-info', 'fa-solid fa-circle-exclamation',
    'fa-solid fa-lightbulb', 'fa-solid fa-bolt', 'fa-solid fa-fire', 'fa-solid fa-droplet',
    'fa-solid fa-sun', 'fa-solid fa-moon', 'fa-solid fa-cloud', 'fa-solid fa-snowflake',
    'fa-solid fa-user', 'fa-solid fa-users', 'fa-solid fa-user-tie', 'fa-solid fa-people-group',
    'fa-solid fa-house', 'fa-solid fa-building', 'fa-solid fa-city', 'fa-solid fa-globe',
    'fa-solid fa-chart-line', 'fa-solid fa-chart-bar', 'fa-solid fa-chart-pie', 'fa-solid fa-chart-simple',
    'fa-solid fa-rocket', 'fa-solid fa-plane', 'fa-solid fa-car', 'fa-solid fa-bicycle',
    'fa-solid fa-phone', 'fa-solid fa-envelope', 'fa-solid fa-comment', 'fa-solid fa-bell',
    'fa-solid fa-lock', 'fa-solid fa-unlock', 'fa-solid fa-shield-halved', 'fa-solid fa-key',
    'fa-solid fa-gear', 'fa-solid fa-wrench', 'fa-solid fa-screwdriver-wrench', 'fa-solid fa-toolbox',
    'fa-solid fa-trophy', 'fa-solid fa-medal', 'fa-solid fa-award', 'fa-solid fa-crown',
    'fa-solid fa-flag', 'fa-solid fa-bookmark', 'fa-solid fa-tag', 'fa-solid fa-thumbtack',
    'fa-solid fa-camera', 'fa-solid fa-film', 'fa-solid fa-music', 'fa-solid fa-palette',
    'fa-solid fa-graduation-cap', 'fa-solid fa-book', 'fa-solid fa-microscope', 'fa-solid fa-atom',
  ];

  function buildIconPicker() {
    renderIconGrid(commonIcons);
    $('#icon-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      if (!q) { renderIconGrid(commonIcons); return; }
      const filtered = commonIcons.filter(ic => ic.toLowerCase().includes(q));
      renderIconGrid(filtered);
    });
  }

  function renderIconGrid(icons) {
    const grid = $('#icon-grid');
    grid.innerHTML = '';
    icons.forEach(ic => {
      const item = document.createElement('div');
      item.className = 'icon-grid-item';
      item.title = ic.split(' ').pop().replace('fa-', '');
      item.innerHTML = `<i class="${ic}"></i>`;
      item.addEventListener('click', () => {
        pushUndo();
        const obj = createIconObject(ic);
        currentSlide().objects.push(obj);
        selectedObjectId = obj.id;
        $('#icon-picker').style.display = 'none';
        renderAll();
        scheduleAutoSave();
      });
      grid.appendChild(item);
    });
  }

  // ============================================================
  //  IMAGE DIALOG
  // ============================================================
  function showImageDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog">
        <h3>Insert Image</h3>
        <div class="dialog-field">
          <label>Image URL</label>
          <input type="text" id="dlg-img-url" placeholder="https://example.com/image.jpg">
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn" id="dlg-upload-btn"><i class="fa-solid fa-upload"></i> Upload</button>
          <span style="flex:1"></span>
          <button class="dialog-btn" id="dlg-cancel">Cancel</button>
          <button class="dialog-btn primary" id="dlg-insert">Insert</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#dlg-img-url').focus();

    overlay.querySelector('#dlg-insert').addEventListener('click', () => {
      const url = overlay.querySelector('#dlg-img-url').value.trim();
      if (url) insertImage(url);
      overlay.remove();
    });

    overlay.querySelector('#dlg-upload-btn').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { insertImage(ev.target.result); overlay.remove(); };
        reader.readAsDataURL(file);
      });
      input.click();
    });

    overlay.querySelector('#dlg-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.remove();
      if (e.key === 'Enter') overlay.querySelector('#dlg-insert').click();
    });
  }

  function insertImage(src) {
    pushUndo();
    const obj = createImageObject(src, {
      x: 200 + Math.random() * 50,
      y: 100 + Math.random() * 50,
      w: 350, h: 250,
    });
    currentSlide().objects.push(obj);
    selectedObjectId = obj.id;
    renderAll();
    scheduleAutoSave();
  }

  // ============================================================
  //  SLIDE CONTEXT MENU
  // ============================================================
  function showSlideContextMenu(e, slideIndex) {
    contextMenu.innerHTML = '';
    const items = [
      { label: 'New Slide', icon: 'fa-plus', action: () => { pushUndo(); slides.splice(slideIndex + 1, 0, createBlankSlide()); currentSlideIndex = slideIndex + 1; selectedObjectId = null; renderAll(); scheduleAutoSave(); } },
      { label: 'Duplicate Slide', icon: 'fa-copy', action: () => { pushUndo(); const dup = JSON.parse(JSON.stringify(slides[slideIndex])); dup.id = Date.now() + Math.random(); slides.splice(slideIndex + 1, 0, dup); currentSlideIndex = slideIndex + 1; selectedObjectId = null; renderAll(); scheduleAutoSave(); } },
      { sep: true },
      { label: 'Move Up', icon: 'fa-arrow-up', disabled: slideIndex === 0, action: () => { pushUndo(); [slides[slideIndex], slides[slideIndex-1]] = [slides[slideIndex-1], slides[slideIndex]]; currentSlideIndex = slideIndex - 1; renderAll(); scheduleAutoSave(); } },
      { label: 'Move Down', icon: 'fa-arrow-down', disabled: slideIndex === slides.length - 1, action: () => { pushUndo(); [slides[slideIndex], slides[slideIndex+1]] = [slides[slideIndex+1], slides[slideIndex]]; currentSlideIndex = slideIndex + 1; renderAll(); scheduleAutoSave(); } },
      { sep: true },
      { label: 'Change Background...', icon: 'fa-palette', action: () => showSlideBackgroundDialog(slideIndex) },
      { label: 'Apply Layout...', icon: 'fa-table-columns', action: () => showLayoutPicker(slideIndex) },
      { sep: true },
      { label: 'Delete Slide', icon: 'fa-trash', danger: true, disabled: slides.length <= 1, action: () => { if (slides.length <= 1) return; pushUndo(); slides.splice(slideIndex, 1); if (currentSlideIndex >= slides.length) currentSlideIndex = slides.length - 1; selectedObjectId = null; renderAll(); scheduleAutoSave(); } },
    ];

    items.forEach(item => {
      if (item.sep) {
        contextMenu.appendChild(Object.assign(document.createElement('div'), { className: 'ctx-sep' }));
      } else {
        const div = document.createElement('div');
        div.className = 'ctx-item' + (item.danger ? ' danger' : '');
        if (item.disabled) div.style.opacity = '0.4';
        div.innerHTML = `<i class="fa-solid ${item.icon}"></i> ${item.label}`;
        div.addEventListener('click', () => {
          contextMenu.style.display = 'none';
          if (!item.disabled) item.action();
        });
        contextMenu.appendChild(div);
      }
    });

    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    contextMenu.style.display = 'block';
  }

  // Canvas right-click context menu
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const objEl = e.target.closest('.slide-object');

    contextMenu.innerHTML = '';
    const items = [];

    if (objEl) {
      const id = parseInt(objEl.dataset.id);
      selectedObjectId = id;
      renderAll();

      items.push(
        { label: 'Cut', icon: 'fa-scissors', action: () => cutObject() },
        { label: 'Copy', icon: 'fa-copy', action: () => copyObject() },
        { label: 'Paste', icon: 'fa-paste', action: () => pasteObject(), disabled: !clipboard },
        { sep: true },
        { label: 'Duplicate', icon: 'fa-clone', action: () => duplicateObject() },
        { sep: true },
        { label: 'Bring to Front', icon: 'fa-layer-group', action: () => $('#btn-bring-front').click() },
        { label: 'Send to Back', icon: 'fa-layer-group', action: () => $('#btn-send-back').click() },
        { sep: true },
        { label: 'Delete', icon: 'fa-trash', danger: true, action: deleteSelectedObject },
      );
    } else {
      items.push(
        { label: 'Paste', icon: 'fa-paste', action: () => pasteObject(), disabled: !clipboard },
        { sep: true },
        { label: 'Add Text Box', icon: 'fa-font', action: () => $('#btn-add-text').click() },
        { label: 'Add Image', icon: 'fa-image', action: () => $('#btn-add-image').click() },
        { label: 'Add Shape', icon: 'fa-shapes', action: () => $('#btn-add-shape').click() },
        { sep: true },
        { label: 'Change Background...', icon: 'fa-palette', action: () => showSlideBackgroundDialog(currentSlideIndex) },
      );
    }

    items.forEach(item => {
      if (item.sep) {
        contextMenu.appendChild(Object.assign(document.createElement('div'), { className: 'ctx-sep' }));
      } else {
        const div = document.createElement('div');
        div.className = 'ctx-item' + (item.danger ? ' danger' : '');
        if (item.disabled) div.style.opacity = '0.4';
        div.innerHTML = `<i class="fa-solid ${item.icon}"></i> ${item.label}`;
        div.addEventListener('click', () => {
          contextMenu.style.display = 'none';
          if (!item.disabled) item.action();
        });
        contextMenu.appendChild(div);
      }
    });

    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    contextMenu.style.display = 'block';
  });

  // ============================================================
  //  CLIPBOARD
  // ============================================================
  function copyObject() {
    const obj = selectedObject();
    if (!obj) return;
    clipboard = JSON.parse(JSON.stringify(obj));
  }

  function cutObject() {
    copyObject();
    deleteSelectedObject();
  }

  function pasteObject() {
    if (!clipboard) return;
    pushUndo();
    const obj = JSON.parse(JSON.stringify(clipboard));
    obj.id = nextObjectId++;
    obj.x += 20;
    obj.y += 20;
    currentSlide().objects.push(obj);
    selectedObjectId = obj.id;
    renderAll();
    scheduleAutoSave();
  }

  function duplicateObject() {
    const obj = selectedObject();
    if (!obj) return;
    pushUndo();
    const dup = JSON.parse(JSON.stringify(obj));
    dup.id = nextObjectId++;
    dup.x += 30;
    dup.y += 30;
    currentSlide().objects.push(dup);
    selectedObjectId = dup.id;
    renderAll();
    scheduleAutoSave();
  }

  // ============================================================
  //  SLIDE BACKGROUND DIALOG
  // ============================================================
  function showSlideBackgroundDialog(idx) {
    const slide = slides[idx];
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" style="min-width:380px;">
        <h3>Slide Background</h3>
        <div class="dialog-field">
          <label>Solid Color</label>
          <input type="color" id="dlg-bg-color" value="${slide.background || '#ffffff'}" style="width:100%;height:40px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">
        </div>
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-bottom:12px;" id="bg-preset-colors"></div>
        <div class="dialog-field">
          <label>Gradient (CSS)</label>
          <input type="text" id="dlg-bg-gradient" placeholder="linear-gradient(135deg, #667eea, #764ba2)" value="${slide.background.includes('gradient') ? slide.background : ''}">
        </div>
        <div class="dialog-field">
          <label>Background Image URL</label>
          <input type="text" id="dlg-bg-img" placeholder="https://..." value="${slide.backgroundImage || ''}">
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn" id="dlg-bg-upload"><i class="fa-solid fa-upload"></i> Upload</button>
          <span style="flex:1"></span>
          <button class="dialog-btn" id="dlg-bg-cancel">Cancel</button>
          <button class="dialog-btn primary" id="dlg-bg-apply">Apply</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Preset colors
    const presets = ['#ffffff','#f1f5f9','#1e293b','#0f172a','#1e3a5f','#1a1a2e','#16213e','#0d1b2a',
      '#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#6366f1','#a855f7','#ec4899',
      '#fef2f2','#fff7ed','#fefce8','#f0fdf4','#eff6ff','#eef2ff','#faf5ff','#fdf2f8'];
    const presetGrid = overlay.querySelector('#bg-preset-colors');
    presets.forEach(c => {
      const swatch = document.createElement('div');
      swatch.style.cssText = `width:28px;height:28px;border-radius:4px;background:${c};cursor:pointer;border:1px solid var(--border-light);`;
      swatch.addEventListener('click', () => {
        overlay.querySelector('#dlg-bg-color').value = c;
        overlay.querySelector('#dlg-bg-gradient').value = '';
      });
      presetGrid.appendChild(swatch);
    });

    overlay.querySelector('#dlg-bg-upload').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => { overlay.querySelector('#dlg-bg-img').value = ev.target.result; };
        reader.readAsDataURL(file);
      });
      input.click();
    });

    overlay.querySelector('#dlg-bg-apply').addEventListener('click', () => {
      pushUndo();
      const gradient = overlay.querySelector('#dlg-bg-gradient').value.trim();
      const color = overlay.querySelector('#dlg-bg-color').value;
      const img = overlay.querySelector('#dlg-bg-img').value.trim();
      slide.background = gradient || color;
      slide.backgroundImage = img;
      overlay.remove();
      renderAll();
      scheduleAutoSave();
    });

    overlay.querySelector('#dlg-bg-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ============================================================
  //  LAYOUT PICKER
  // ============================================================
  function showLayoutPicker(slideIndex) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" style="min-width:480px;">
        <h3>Choose Layout</h3>
        <div class="layout-grid" id="dlg-layout-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;"></div>
        <div class="dialog-actions" style="margin-top:16px;">
          <button class="dialog-btn" id="dlg-layout-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const layouts = [
      { name: 'Blank', apply: (s) => { s.objects = []; } },
      { name: 'Title Slide', apply: (s) => {
        s.objects = [
          createTextObject({ x: 80, y: 140, w: 800, h: 80, text: 'Title', fontSize: 44, fontWeight: '700', textAlign: 'center', fontFamily: 'Montserrat' }),
          createTextObject({ x: 180, y: 240, w: 600, h: 50, text: 'Subtitle', fontSize: 22, textAlign: 'center', color: '#6b7280' }),
        ];
      }},
      { name: 'Title + Content', apply: (s) => {
        s.objects = [
          createTextObject({ x: 60, y: 30, w: 840, h: 60, text: 'Slide Title', fontSize: 36, fontWeight: '700', fontFamily: 'Montserrat' }),
          createTextObject({ x: 60, y: 110, w: 840, h: 380, text: 'Content goes here...', fontSize: 20 }),
        ];
      }},
      { name: 'Two Columns', apply: (s) => {
        s.objects = [
          createTextObject({ x: 60, y: 30, w: 840, h: 60, text: 'Slide Title', fontSize: 36, fontWeight: '700', fontFamily: 'Montserrat' }),
          createTextObject({ x: 60, y: 110, w: 400, h: 380, text: 'Left column', fontSize: 18 }),
          createTextObject({ x: 500, y: 110, w: 400, h: 380, text: 'Right column', fontSize: 18 }),
        ];
      }},
      { name: 'Image + Text', apply: (s) => {
        s.objects = [
          createShapeObject('rect', { x: 0, y: 0, w: 480, h: 540, backgroundColor: '#e2e8f0' }),
          createTextObject({ x: 510, y: 100, w: 420, h: 60, text: 'Title Here', fontSize: 32, fontWeight: '700', fontFamily: 'Montserrat' }),
          createTextObject({ x: 510, y: 180, w: 420, h: 280, text: 'Description text goes here. Replace the gray area with an image.', fontSize: 18, color: '#6b7280' }),
        ];
      }},
      { name: 'Section Header', apply: (s) => {
        s.background = '#1e293b';
        s.objects = [
          createTextObject({ x: 80, y: 180, w: 800, h: 80, text: 'Section Title', fontSize: 48, fontWeight: '800', textAlign: 'center', color: '#ffffff', fontFamily: 'Montserrat' }),
          createShapeObject('line', { x: 360, y: 280, w: 240, h: 4, backgroundColor: '#4361ee' }),
        ];
      }},
      { name: 'Big Number', apply: (s) => {
        s.objects = [
          createTextObject({ x: 80, y: 100, w: 800, h: 150, text: '100%', fontSize: 96, fontWeight: '900', textAlign: 'center', color: '#4361ee', fontFamily: 'Montserrat' }),
          createTextObject({ x: 180, y: 300, w: 600, h: 60, text: 'Description of this statistic', fontSize: 22, textAlign: 'center', color: '#6b7280' }),
        ];
      }},
    ];

    const grid = overlay.querySelector('#dlg-layout-grid');
    layouts.forEach(layout => {
      const btn = document.createElement('div');
      btn.style.cssText = 'padding:16px;border:2px solid var(--border-light);border-radius:8px;cursor:pointer;text-align:center;transition:all 0.15s;';
      btn.innerHTML = `<div style="font-weight:600;font-size:13px;margin-bottom:4px;">${layout.name}</div>`;
      btn.addEventListener('mouseenter', () => btn.style.borderColor = 'var(--accent)');
      btn.addEventListener('mouseleave', () => btn.style.borderColor = 'var(--border-light)');
      btn.addEventListener('click', () => {
        pushUndo();
        layout.apply(slides[slideIndex]);
        selectedObjectId = null;
        overlay.remove();
        renderAll();
        scheduleAutoSave();
      });
      grid.appendChild(btn);
    });

    overlay.querySelector('#dlg-layout-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ============================================================
  //  MENU BAR
  // ============================================================
  $$('.menu-btn').forEach(btn => {
    btn.addEventListener('click', () => showDropdownMenu(btn.dataset.menu, btn));
  });

  function showDropdownMenu(menuName, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    let items = [];

    switch (menuName) {
      case 'file':
        items = [
          { label: 'New Presentation', icon: 'fa-file', action: () => { if (confirm('Create new presentation? Unsaved changes will be lost.')) { slides = [createTitleSlide()]; currentSlideIndex = 0; selectedObjectId = null; $('#doc-title').value = 'Untitled Presentation'; renderAll(); localStorage.removeItem('slidecraft-data'); } } },
          { sep: true },
          { label: 'Save', icon: 'fa-floppy-disk', shortcut: '⌘S', action: savePresentation },
          { label: 'Load', icon: 'fa-folder-open', action: loadPresentation },
          { sep: true },
          { label: 'Download as HTML', icon: 'fa-file-code', action: exportHTML },
          { label: 'Download as JSON', icon: 'fa-file-export', action: exportJSON },
          { sep: true },
          { label: 'Import JSON', icon: 'fa-file-import', action: importJSON },
          { sep: true },
          { label: 'Print', icon: 'fa-print', shortcut: '⌘P', action: () => window.print() },
        ];
        break;
      case 'edit':
        items = [
          { label: 'Undo', icon: 'fa-rotate-left', shortcut: '⌘Z', action: undo },
          { label: 'Redo', icon: 'fa-rotate-right', shortcut: '⌘Y', action: redo },
          { sep: true },
          { label: 'Cut', icon: 'fa-scissors', shortcut: '⌘X', action: cutObject },
          { label: 'Copy', icon: 'fa-copy', shortcut: '⌘C', action: copyObject },
          { label: 'Paste', icon: 'fa-paste', shortcut: '⌘V', action: pasteObject },
          { label: 'Duplicate', icon: 'fa-clone', shortcut: '⌘D', action: duplicateObject },
          { sep: true },
          { label: 'Select All', icon: 'fa-object-group', action: () => { /* multi-select all */ } },
          { label: 'Delete', icon: 'fa-trash', action: deleteSelectedObject },
        ];
        break;
      case 'view':
        items = [
          { label: 'Zoom In', icon: 'fa-magnifying-glass-plus', action: () => setZoom(currentZoom + 10) },
          { label: 'Zoom Out', icon: 'fa-magnifying-glass-minus', action: () => setZoom(currentZoom - 10) },
          { label: 'Zoom to Fit', icon: 'fa-expand', action: zoomToFit },
          { label: 'Reset Zoom (100%)', icon: 'fa-compress', action: () => setZoom(100) },
          { sep: true },
          { label: 'Full Screen', icon: 'fa-expand', action: () => {
            document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
          }},
        ];
        break;
      case 'insert':
        items = [
          { label: 'Text Box', icon: 'fa-font', action: () => $('#btn-add-text').click() },
          { label: 'Image', icon: 'fa-image', action: showImageDialog },
          { label: 'Shape', icon: 'fa-shapes', action: () => $('#btn-add-shape').click() },
          { label: 'Icon', icon: 'fa-icons', action: () => $('#btn-add-icon').click() },
          { sep: true },
          { label: 'New Slide', icon: 'fa-plus', action: () => $('#btn-add-slide').click() },
        ];
        break;
      case 'format':
        items = [
          { label: 'Bold', icon: 'fa-bold', shortcut: '⌘B', action: () => $('#btn-bold').click() },
          { label: 'Italic', icon: 'fa-italic', shortcut: '⌘I', action: () => $('#btn-italic').click() },
          { label: 'Underline', icon: 'fa-underline', shortcut: '⌘U', action: () => $('#btn-underline').click() },
          { sep: true },
          { label: 'Align Left', icon: 'fa-align-left', action: () => setAlignment('left') },
          { label: 'Align Center', icon: 'fa-align-center', action: () => setAlignment('center') },
          { label: 'Align Right', icon: 'fa-align-right', action: () => setAlignment('right') },
        ];
        break;
      case 'slide':
        items = [
          { label: 'New Slide', icon: 'fa-plus', action: () => $('#btn-add-slide').click() },
          { label: 'Duplicate Slide', icon: 'fa-copy', action: () => { pushUndo(); const dup = JSON.parse(JSON.stringify(currentSlide())); dup.id = Date.now() + Math.random(); slides.splice(currentSlideIndex + 1, 0, dup); currentSlideIndex++; selectedObjectId = null; renderAll(); scheduleAutoSave(); } },
          { sep: true },
          { label: 'Delete Slide', icon: 'fa-trash', action: () => { if (slides.length <= 1) return; pushUndo(); slides.splice(currentSlideIndex, 1); if (currentSlideIndex >= slides.length) currentSlideIndex = slides.length - 1; selectedObjectId = null; renderAll(); scheduleAutoSave(); } },
          { sep: true },
          { label: 'Change Background...', icon: 'fa-palette', action: () => showSlideBackgroundDialog(currentSlideIndex) },
          { label: 'Apply Layout...', icon: 'fa-table-columns', action: () => showLayoutPicker(currentSlideIndex) },
          { sep: true },
          { label: 'Start Presentation', icon: 'fa-play', shortcut: 'F5', action: startPresentation },
        ];
        break;
      case 'help':
        items = [
          { label: 'Keyboard Shortcuts', icon: 'fa-keyboard', action: showShortcutsDialog },
          { sep: true },
          { label: 'About SlideCraft', icon: 'fa-circle-info', action: () => showInfoDialog('About SlideCraft', 'SlideCraft is a professional presentation editor built with vanilla HTML, CSS & JavaScript. Create stunning slides with text, images, shapes, and more.') },
        ];
        break;
    }

    dropdown.innerHTML = '';
    items.forEach(item => {
      if (item.sep) {
        dropdown.appendChild(Object.assign(document.createElement('div'), { className: 'dropdown-sep' }));
      } else {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.innerHTML = `<i class="fa-solid ${item.icon}"></i> ${item.label}${item.shortcut ? `<span class="shortcut">${item.shortcut}</span>` : ''}`;
        div.addEventListener('click', () => { dropdown.style.display = 'none'; item.action(); });
        dropdown.appendChild(div);
      }
    });

    dropdown.style.display = 'block';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = rect.bottom + 2 + 'px';
  }

  // Close popups on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-menu') && !e.target.closest('.menu-btn')) dropdown.style.display = 'none';
    if (!e.target.closest('.context-menu')) contextMenu.style.display = 'none';
    if (!e.target.closest('.shape-picker') && !e.target.closest('#btn-add-shape')) $('#shape-picker').style.display = 'none';
    if (!e.target.closest('.icon-picker') && !e.target.closest('#btn-add-icon')) $('#icon-picker').style.display = 'none';
  });

  // ============================================================
  //  ZOOM
  // ============================================================
  function setZoom(level) {
    currentZoom = Math.max(25, Math.min(200, level));
    zoomSlider.value = currentZoom;
    $('#zoom-level').textContent = currentZoom + '%';
    const scale = currentZoom / 100;
    const wrapper = $('#canvas-wrapper');
    wrapper.style.transform = `scale(${scale})`;
  }

  function zoomToFit() {
    const area = $('#editor-area');
    const padding = 60;
    const availW = area.clientWidth - padding * 2;
    const availH = area.clientHeight - padding * 2;
    const scaleW = availW / 960;
    const scaleH = availH / 540;
    const scale = Math.min(scaleW, scaleH, 1.5);
    setZoom(Math.round(scale * 100));
  }

  zoomSlider.addEventListener('input', (e) => setZoom(parseInt(e.target.value)));
  $('#zoom-in').addEventListener('click', () => setZoom(currentZoom + 10));
  $('#zoom-out').addEventListener('click', () => setZoom(currentZoom - 10));
  $('#zoom-fit').addEventListener('click', zoomToFit);

  // ============================================================
  //  PRESENTATION MODE
  // ============================================================
  let presSlideIndex = 0;

  function startPresentation(fromIndex) {
    presSlideIndex = typeof fromIndex === 'number' ? fromIndex : currentSlideIndex;
    const overlay = $('#presentation-overlay');
    overlay.style.display = 'flex';

    // Size to screen
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const scale = Math.min(sw / 960, sh / 540);
    const presSlide = $('#presentation-slide');
    presSlide.style.width = '960px';
    presSlide.style.height = '540px';
    presSlide.style.transform = `scale(${scale})`;
    presSlide.style.transformOrigin = 'center center';

    renderPresentationSlide();

    try { document.documentElement.requestFullscreen(); } catch (e) {}
  }

  function renderPresentationSlide() {
    const slide = slides[presSlideIndex];
    if (!slide) return;

    const presSlide = $('#presentation-slide');
    presSlide.style.background = slide.backgroundImage
      ? `url(${slide.backgroundImage}) center/cover`
      : slide.background;

    // Apply transition
    presSlide.className = 'presentation-slide';
    if (slide.transition && slide.transition !== 'none') {
      presSlide.classList.add('transition-' + slide.transition);
      presSlide.style.animationDuration = (slide.transitionDuration || 0.5) + 's';
    }

    presSlide.innerHTML = '';
    slide.objects.forEach(obj => {
      const el = createObjectElement(obj);
      el.classList.remove('selected');
      el.querySelectorAll('.resize-handle, .rotate-handle').forEach(h => h.remove());
      el.style.cursor = 'default';
      presSlide.appendChild(el);
    });

    $('#pres-slide-num').textContent = `${presSlideIndex + 1} / ${slides.length}`;
  }

  function exitPresentation() {
    $('#presentation-overlay').style.display = 'none';
    if (document.fullscreenElement) document.exitFullscreen();
  }

  $('#btn-present').addEventListener('click', () => startPresentation());
  $('#pres-prev').addEventListener('click', () => {
    if (presSlideIndex > 0) { presSlideIndex--; renderPresentationSlide(); }
  });
  $('#pres-next').addEventListener('click', () => {
    if (presSlideIndex < slides.length - 1) { presSlideIndex++; renderPresentationSlide(); }
  });
  $('#pres-exit').addEventListener('click', exitPresentation);

  // Presentation keyboard nav
  document.addEventListener('keydown', (e) => {
    if ($('#presentation-overlay').style.display === 'none') return;

    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (presSlideIndex < slides.length - 1) { presSlideIndex++; renderPresentationSlide(); }
    } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
      e.preventDefault();
      if (presSlideIndex > 0) { presSlideIndex--; renderPresentationSlide(); }
    } else if (e.key === 'Escape') {
      exitPresentation();
    } else if (e.key === 'Home') {
      presSlideIndex = 0; renderPresentationSlide();
    } else if (e.key === 'End') {
      presSlideIndex = slides.length - 1; renderPresentationSlide();
    }
  });

  // ============================================================
  //  KEYBOARD SHORTCUTS (editor)
  // ============================================================
  document.addEventListener('keydown', (e) => {
    if ($('#presentation-overlay').style.display !== 'none') return;

    // Don't intercept when editing text
    const editing = canvas.querySelector('[contenteditable="true"]:focus');

    const isMeta = e.metaKey || e.ctrlKey;

    if (isMeta && e.key === 's') { e.preventDefault(); savePresentation(); return; }
    if (isMeta && e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (isMeta && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'F5') { e.preventDefault(); startPresentation(); return; }

    // Exit text editing on Escape
    if (editing && e.key === 'Escape') {
      e.preventDefault();
      saveCurrentEditing();
      renderAll();
      return;
    }

    if (editing) return; // let text editing handle the rest

    if (isMeta && e.key === 'c') { e.preventDefault(); copyObject(); return; }
    if (isMeta && e.key === 'x') { e.preventDefault(); cutObject(); return; }
    if (isMeta && e.key === 'v') { e.preventDefault(); pasteObject(); return; }
    if (isMeta && e.key === 'd') { e.preventDefault(); duplicateObject(); return; }
    if (isMeta && e.key === 'b') { e.preventDefault(); $('#btn-bold').click(); return; }
    if (isMeta && e.key === 'i') { e.preventDefault(); $('#btn-italic').click(); return; }
    if (isMeta && e.key === 'u') { e.preventDefault(); $('#btn-underline').click(); return; }

    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelectedObject(); return; }

    // Arrow keys: move selected object
    if (selectedObjectId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const obj = selectedObject();
      if (!obj) return;
      const step = e.shiftKey ? 10 : 1;
      pushUndo();
      if (e.key === 'ArrowUp') obj.y -= step;
      if (e.key === 'ArrowDown') obj.y += step;
      if (e.key === 'ArrowLeft') obj.x -= step;
      if (e.key === 'ArrowRight') obj.x += step;
      renderAll();
      scheduleAutoSave();
    }

    // Page navigation
    if (e.key === 'PageDown' || (e.key === 'ArrowDown' && !selectedObjectId)) {
      if (currentSlideIndex < slides.length - 1) {
        saveCurrentEditing(); currentSlideIndex++; selectedObjectId = null; renderAll();
      }
    }
    if (e.key === 'PageUp' || (e.key === 'ArrowUp' && !selectedObjectId)) {
      if (currentSlideIndex > 0) {
        saveCurrentEditing(); currentSlideIndex--; selectedObjectId = null; renderAll();
      }
    }
  });

  // ============================================================
  //  PERSISTENCE
  // ============================================================
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    $('#save-status').textContent = 'Unsaved';
    $('#save-status').style.color = 'var(--warning)';
    autoSaveTimer = setTimeout(savePresentation, AUTO_SAVE_DELAY);
  }

  function savePresentation() {
    syncEditingContent();
    const data = {
      title: $('#doc-title').value,
      slides,
      currentSlideIndex,
      nextObjectId,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem('slidecraft-data', JSON.stringify(data));
    $('#save-status').textContent = 'Saved';
    $('#save-status').style.color = 'var(--success)';
    setTimeout(() => { $('#save-status').textContent = ''; }, 2000);
  }

  function loadPresentation() {
    const raw = localStorage.getItem('slidecraft-data');
    if (!raw) { showInfoDialog('Load', 'No saved presentation found.'); return; }
    tryRestore(raw);
  }

  function tryRestore(raw) {
    try {
      const data = JSON.parse(raw);
      if (data.title) $('#doc-title').value = data.title;
      if (data.slides && data.slides.length > 0) {
        slides = data.slides;
        currentSlideIndex = Math.min(data.currentSlideIndex || 0, slides.length - 1);
        nextObjectId = data.nextObjectId || 1;
      }
    } catch (e) { /* ignore */ }
  }

  // ============================================================
  //  EXPORT / IMPORT
  // ============================================================
  function exportHTML() {
    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml($('#doc-title').value)}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Montserrat:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;600;700;900&family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#1a1a2e;display:flex;flex-direction:column;align-items:center;padding:40px 20px;font-family:Inter,sans-serif;}
.slide{width:960px;height:540px;position:relative;overflow:hidden;margin-bottom:40px;box-shadow:0 8px 30px rgba(0,0,0,0.3);border-radius:4px;flex-shrink:0;}
.slide-obj{position:absolute;overflow:hidden;word-wrap:break-word;white-space:pre-wrap;}
img{width:100%;height:100%;object-fit:cover;}
.shape-svg{width:100%;height:100%;}
</style></head><body>\n`;

    slides.forEach((slide) => {
      html += `<div class="slide" style="background:${slide.backgroundImage ? `url(${slide.backgroundImage}) center/cover` : slide.background}">\n`;
      slide.objects.forEach(obj => {
        let style = `left:${obj.x}px;top:${obj.y}px;width:${obj.w}px;height:${obj.h}px;opacity:${(obj.opacity??100)/100};`;
        if (obj.rotation) style += `transform:rotate(${obj.rotation}deg);`;
        if (obj.borderStyle && obj.borderStyle !== 'none' && obj.borderWidth) style += `border:${obj.borderWidth}px ${obj.borderStyle} ${obj.borderColor};`;
        if (obj.borderRadius) style += `border-radius:${obj.borderRadius}px;`;

        if (obj.type === 'text') {
          style += `font-family:${obj.fontFamily};font-size:${obj.fontSize}px;font-weight:${obj.fontWeight};font-style:${obj.fontStyle||'normal'};text-decoration:${obj.textDecoration||'none'};text-align:${obj.textAlign};color:${obj.color};line-height:${obj.lineHeight||1.4};padding:8px 12px;`;
          if (obj.backgroundColor && obj.backgroundColor !== 'transparent') style += `background:${obj.backgroundColor};`;
          html += `  <div class="slide-obj" style="${style}">${obj.text || ''}</div>\n`;
        } else if (obj.type === 'image') {
          html += `  <div class="slide-obj" style="${style}"><img src="${escapeHtml(obj.src)}"></div>\n`;
        } else if (obj.type === 'shape') {
          style += `background:${obj.backgroundColor};`;
          if (obj.shapeType === 'circle' || obj.shapeType === 'ellipse') style += 'border-radius:50%;';
          if (obj.shapeType === 'rounded-rect') style += 'border-radius:12px;';
          html += `  <div class="slide-obj" style="${style}"></div>\n`;
        } else if (obj.type === 'icon') {
          style += `display:flex;align-items:center;justify-content:center;font-size:${obj.fontSize}px;color:${obj.color};`;
          html += `  <div class="slide-obj" style="${style}"><i class="${obj.iconClass}"></i></div>\n`;
        }
      });
      html += `</div>\n`;
    });

    html += `</body></html>`;
    downloadFile(html, ($('#doc-title').value || 'presentation') + '.html', 'text/html');
  }

  function exportJSON() {
    saveCurrentEditing();
    const data = { title: $('#doc-title').value, slides, nextObjectId };
    downloadFile(JSON.stringify(data, null, 2), ($('#doc-title').value || 'presentation') + '.json', 'application/json');
  }

  function importJSON() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.addEventListener('change', (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.slides) {
            pushUndo();
            slides = data.slides;
            nextObjectId = data.nextObjectId || 1;
            currentSlideIndex = 0;
            selectedObjectId = null;
            if (data.title) $('#doc-title').value = data.title;
            renderAll();
            scheduleAutoSave();
          }
        } catch (err) {
          showInfoDialog('Import Error', 'Failed to parse JSON file.');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================
  //  HELPER DIALOGS
  // ============================================================
  function showInfoDialog(title, body) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" style="max-width:480px;">
        <h3>${title}</h3>
        <div style="font-size:13px;line-height:1.6;margin-bottom:8px;">${body}</div>
        <div class="dialog-actions"><button class="dialog-btn primary" id="info-ok">OK</button></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#info-ok').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') overlay.remove(); });
    overlay.querySelector('#info-ok').focus();
  }

  function showShortcutsDialog() {
    const shortcuts = [
      ['⌘S', 'Save'], ['⌘Z', 'Undo'], ['⌘⇧Z / ⌘Y', 'Redo'],
      ['⌘C', 'Copy'], ['⌘X', 'Cut'], ['⌘V', 'Paste'], ['⌘D', 'Duplicate'],
      ['⌘B', 'Bold'], ['⌘I', 'Italic'], ['⌘U', 'Underline'],
      ['Delete', 'Delete Object'], ['Arrow Keys', 'Move Object (1px)'], ['⇧+Arrow', 'Move Object (10px)'],
      ['F5', 'Start Presentation'], ['Esc', 'Exit Presentation'],
      ['→ / Space', 'Next Slide (presenting)'], ['← / Backspace', 'Previous Slide (presenting)'],
      ['PageDown', 'Next Slide'], ['PageUp', 'Previous Slide'],
    ];
    showInfoDialog('Keyboard Shortcuts', shortcuts.map(([k, v]) =>
      `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border-light);">
        <span style="font-weight:600;color:var(--accent);font-size:12px;min-width:110px;">${k}</span>
        <span style="font-size:12px;">${v}</span>
      </div>`
    ).join(''));
  }

  // ============================================================
  //  INIT
  // ============================================================
  function init() {
    buildShapePicker();
    buildIconPicker();

    // Try loading saved presentation
    const saved = localStorage.getItem('slidecraft-data');
    if (saved) {
      tryRestore(saved);
    }

    // Default: one title slide
    if (slides.length === 0) {
      slides.push(createTitleSlide());
    }

    renderAll();
    zoomToFit();
  }

  window.addEventListener('beforeunload', savePresentation);
  init();

})();
