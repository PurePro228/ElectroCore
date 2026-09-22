/* ElectroCore — интерфейс: палитра, инспектор, ввод (мышь и касания), цикл расчёта. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;
  var GRID = EC.GRID;
  var $ = function (id) { return document.getElementById(id); };

  var circuit, renderer, scope, board, scopeCanvas;
  var undoStack = [], redoStack = [];
  var MAX_UNDO = 80;

  var state = {
    mode: 'select',
    running: false,
    hasRun: false,
    speed: 1,
    armed: null,          // тип элемента, ожидающий установки
    action: null,         // текущее действие мышью/пальцем
    pointers: {},
    pinch: null,
    maxSteps: 900,
    dtMode: 'auto',
    lastRate: 1,
    skin: 'real',
    sound: true
  };

  /* Оформление подписей и плашек для каждого вида стола. */
  var THEMES = {
    real: {
      labelFg: '#15291f', labelSub: '#0f6b4e',
      labelPill: 'rgba(255,255,255,.86)',
      badgeBg: 'rgba(255,255,255,.9)', badgeFg: '#17503c'
    },
    schema: {
      labelFg: '#dfe7ef', labelSub: '#7fd4c1',
      labelPill: null,
      badgeBg: 'rgba(10,16,23,.72)', badgeFg: 'rgba(143,232,205,.82)'
    }
  };

  var LS_SKIN = 'electrocore.skin';

  /** Переключает вид рабочего стола: реалистичные детали или условные знаки. */
  function applySkin(sk, silent) {
    if (sk !== 'real' && sk !== 'schema') sk = 'real';
    state.skin = sk;
    EC.skin = sk;
    var th = THEMES[sk];
    for (var k in th) EC.theme[k] = th[k];
    document.body.classList.toggle('skin-real', sk === 'real');
    document.body.classList.toggle('skin-schema', sk === 'schema');
    refreshPreviews();
    var seg = $('skinSeg');
    if (seg) {
      Array.prototype.forEach.call(seg.children, function (b) {
        b.classList.toggle('on', b.getAttribute('data-skin') === sk);
      });
    }
    try { localStorage.setItem(LS_SKIN, sk); } catch (e) { /* приватный режим */ }
    if (!silent) toast(sk === 'real' ? 'Вид: реалистичные детали' : 'Вид: условная схема');
  }

  /** Перерисовывает миниатюры палитры под текущий вид. */
  function refreshPreviews() {
    Array.prototype.forEach.call(document.querySelectorAll('.pal-item'), function (n) {
      var cv = n.querySelector('canvas');
      if (cv) drawPreview(cv, n.getAttribute('data-type'));
    });
  }

  /* ================================================================== */
  /*  Запуск                                                            */
  /* ================================================================== */

  function init() {
    board = $('board');
    scopeCanvas = $('scopeCanvas');
    circuit = new EC.Circuit();
    renderer = new EC.Renderer(board, circuit);
    scope = new EC.Scope(scopeCanvas, circuit);

    var savedSkin = null;
    try { savedSkin = localStorage.getItem(LS_SKIN); } catch (e) { /* приватный режим */ }
    applySkin(savedSkin || 'real', true);

    buildPalette();
    buildExamples();
    bindToolbar();
    bindMenu();
    bindBoard();
    bindKeyboard();
    bindScope();
    bindMobile();

    global.addEventListener('resize', onResize);
    if (global.ResizeObserver) {
      var ro = new ResizeObserver(onResize);
      ro.observe(board.parentNode);
      ro.observe(scopeCanvas.parentNode);
    }
    onResize();

    refreshPreviews();
    var restored = loadLocal(true);
    if (restored) { state.running = true; updateRunUI(); }
    else loadExample('led');
    renderer.fit();
    requestAnimationFrame(frame);

    global.addEventListener('beforeunload', function () { saveLocal(true); });

    // доступ к внутренним объектам — для отладки и автоматических проверок
    EC.app = {
      get circuit() { return circuit; },
      renderer: renderer, scope: scope, state: state,
      setMode: setMode, toggleRun: toggleRun, loadExample: loadExample
    };
  }

  function onResize() {
    if (renderer.needsResize()) renderer.resize();
    if (scope.needsResize()) scope.resize();
  }

  /* ================================================================== */
  /*  Палитра                                                           */
  /* ================================================================== */

  function buildPalette() {
    var body = $('paletteBody');
    body.innerHTML = '';
    EC.categories.forEach(function (cat, ci) {
      var wrap = U.el('div', { class: 'cat' });
      var head = U.el('button', { class: 'cat-head' });
      head.innerHTML = '<span>' + cat.name + '</span><span class="arrow">▼</span>';
      var items = U.el('div', { class: 'cat-items' });
      head.addEventListener('click', function () { wrap.classList.toggle('closed'); });
      cat.items.forEach(function (key) {
        items.appendChild(paletteItem(key));
      });
      wrap.appendChild(head);
      wrap.appendChild(items);
      body.appendChild(wrap);
    });
  }

  function paletteItem(key) {
    var def = EC.defs[key];
    var btn = U.el('button', { class: 'pal-item', 'data-type': key, title: def.tip || def.name });
    var cv = U.el('canvas');
    cv.width = 88; cv.height = 52;
    drawPreview(cv, key);
    btn.appendChild(cv);
    btn.appendChild(U.el('span', { class: 'nm', text: def.name }));
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      arm(key);
      startPaletteDrag(e, key);
    });
    return btn;
  }

  /** Миниатюра элемента в палитре. */
  function drawPreview(canvas, key) {
    var g = canvas.getContext('2d');
    var c = new EC.Component(key, 0, 0);
    var b = c.bounds();
    var scale = Math.min(canvas.width / (b.w * GRID + 6), canvas.height / (b.h * GRID + 6), 0.85);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.save();
    g.translate(canvas.width / 2, canvas.height / 2);
    g.scale(scale, scale);
    g.translate(-(b.x + b.w / 2) * GRID, -(b.y + b.h / 2) * GRID);
    var art = (EC.skin === 'real' && EC.real && EC.real[key]) ? EC.real[key] : EC.defs[key].draw;
    try { art(g, c, { preview: true, view: { zoom: 1 } }); } catch (e) { /* пропускаем */ }
    g.restore();
  }

  function arm(type) {
    state.armed = type;
    Array.prototype.forEach.call(document.querySelectorAll('.pal-item'), function (n) {
      n.classList.toggle('armed', n.getAttribute('data-type') === type);
    });
    if (isPhone()) {
      hideSheets();
      toast('Коснитесь стола, чтобы поставить «' + EC.defs[type].name + '»');
    }
  }

  function isPhone() { return global.innerWidth <= 720; }
  function disarm() {
    state.armed = null;
    renderer.ghost = null;
    Array.prototype.forEach.call(document.querySelectorAll('.pal-item'), function (n) {
      n.classList.remove('armed');
    });
  }

  /** Перетаскивание элемента из палитры на стол. */
  function startPaletteDrag(e, type) {
    var moved = false;
    function move(ev) {
      var r = board.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) {
        renderer.ghost = null;
        return;
      }
      moved = true;
      var w = renderer.toWorld(ev.clientX - r.left, ev.clientY - r.top);
      renderer.ghost = ghostAt(type, w);
    }
    function up(ev) {
      global.removeEventListener('pointermove', move);
      global.removeEventListener('pointerup', up);
      global.removeEventListener('pointercancel', up);
      var r = board.getBoundingClientRect();
      var inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      renderer.ghost = null;
      if (moved && inside) {
        var w = renderer.toWorld(ev.clientX - r.left, ev.clientY - r.top);
        placeComponent(type, w);
        disarm();
      }
    }
    global.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
    global.addEventListener('pointercancel', up);
  }

  function ghostAt(type, w) {
    var c = new EC.Component(type, Math.round(w.x), Math.round(w.y));
    c.rot = state.lastRot || 0;
    return c;
  }

  function placeComponent(type, w) {
    pushUndo();
    var x = Math.round(w.x), y = Math.round(w.y);
    // не ставим элемент точно поверх другого
    var guard = 0;
    while (renderer.componentAt(x, y) && guard++ < 8) y += 3;
    var c = circuit.add(type, x, y);
    c.rot = state.lastRot || 0;
    renderer.selection = [c];
    updateInspector();
    updateDt();
    toast(EC.defs[type].name + ' добавлен');
    hideSheets();
  }

  /* ================================================================== */
  /*  Панель инструментов                                               */
  /* ================================================================== */

  function bindToolbar() {
    $('btnRun').addEventListener('click', toggleRun);
    $('btnStep').addEventListener('click', function () {
      state.running = false; updateRunUI();
      circuit.step(circuit.dt);
      scope.sample(circuit.time);
      state.hasRun = true;
    });
    $('btnReset').addEventListener('click', function () {
      circuit.reset(); scope.clear(); state.hasRun = false;
      toast('Состояние сброшено');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.btn.mode'), function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });
    $('btnUndo').addEventListener('click', undo);
    $('btnRedo').addEventListener('click', redo);
    $('btnRotate').addEventListener('click', rotateSelection);
    $('btnDelete').addEventListener('click', deleteSelection);
    $('btnSkin').addEventListener('click', function () {
      applySkin(state.skin === 'real' ? 'schema' : 'real');
    });
    $('btnFit').addEventListener('click', function () { renderer.fit(); });
    $('btnZoomIn').addEventListener('click', function () { zoomBy(1.25); });
    $('btnZoomOut').addEventListener('click', function () { zoomBy(0.8); });
  }

  function setMode(m) {
    state.mode = m;
    disarm();
    Array.prototype.forEach.call(document.querySelectorAll('.btn.mode'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === m);
    });
    var stage = board.parentNode;
    stage.className = 'stage mode-' + m;
    var mbw = $('mbWire');
    if (mbw) mbw.classList.toggle('active', m === 'wire');
  }

  function toggleRun() {
    state.running = !state.running;
    updateRunUI();
  }

  function updateRunUI() {
    var b = $('btnRun');
    b.classList.toggle('running', state.running);
    $('runIco').textContent = state.running ? '⏸' : '▶';
    $('runLbl').textContent = state.running ? 'Пауза' : 'Пуск';
    var m = $('mbRunIco');
    if (m) {
      m.textContent = state.running ? '⏸' : '▶';
      m.parentNode.lastChild.textContent = state.running ? 'Пауза' : 'Пуск';
    }
  }

  function zoomBy(f) {
    var z = U.clamp(renderer.view.zoom * f, 0.2, 4);
    var cx = renderer.width / 2, cy = renderer.height / 2;
    var before = renderer.toWorld(cx, cy);
    renderer.view.zoom = z;
    var after = renderer.toWorld(cx, cy);
    renderer.view.x += (after.x - before.x) * GRID * z;
    renderer.view.y += (after.y - before.y) * GRID * z;
  }

  /* ================================================================== */
  /*  Меню и файлы                                                      */
  /* ================================================================== */

  function bindMenu() {
    var pop = $('menuPop');
    $('btnMenu').addEventListener('click', function (e) {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
    });
    document.addEventListener('click', function (e) {
      if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
    });
    pop.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      pop.hidden = true;
      if (act === 'new') newCircuit();
      else if (act === 'save') { saveLocal(); toast('Схема сохранена в браузере'); }
      else if (act === 'load') { if (loadLocal()) toast('Схема загружена'); else toast('Сохранённых схем нет'); }
      else if (act === 'export') exportFile();
      else if (act === 'import') $('fileInput').click();
      else if (act === 'ai') openAiModal();
      else if (act === 'help') $('helpModal').hidden = false;
    });
    $('skinSeg').addEventListener('click', function (e) {
      var sk = e.target.getAttribute && e.target.getAttribute('data-skin');
      if (sk) applySkin(sk);
    });
    buildIsaTable();
    bindAi();
    $('helpClose').addEventListener('click', function () { $('helpModal').hidden = true; });
    $('helpModal').addEventListener('click', function (e) {
      if (e.target === $('helpModal')) $('helpModal').hidden = true;
    });

    bindOption('optValues', 'showValues');
    bindOption('optCurrent', 'showCurrent');
    bindOption('optVoltage', 'showVoltage');
    bindOption('optGrid', 'grid');
    $('optSound').addEventListener('change', function (e) {
      state.sound = e.target.checked;
      if (!state.sound) silenceAll(); else wakeAudio();
    });

    $('optSpeed').addEventListener('input', function (e) {
      state.speed = Math.pow(10, parseFloat(e.target.value));
      $('speedVal').textContent = formatSpeed(state.speed);
    });
    $('fileInput').addEventListener('change', importFile);
  }

  /* ================================================================== */
  /*  Схема через ИИ                                                     */
  /* ================================================================== */

  function openAiModal() {
    $('aiModal').hidden = false;
    var text = EC.aiPrompt.build();
    var bytes = new Blob([text]).size;          // в кириллице символ занимает два байта
    var n = Object.keys(EC.defs).length;
    $('aiSize').textContent = Math.round(bytes / 1024) + ' КБ · ' + n + ' ' + plural(n, ['деталь', 'детали', 'деталей']);
  }

  /** Склонение существительного при числе: 1 деталь, 2 детали, 5 деталей. */
  function plural(n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  function bindAi() {
    $('aiClose').addEventListener('click', function () { $('aiModal').hidden = true; });
    $('aiModal').addEventListener('click', function (e) {
      if (e.target === $('aiModal')) $('aiModal').hidden = true;
    });
    $('aiDownload').addEventListener('click', function () {
      var blob = new Blob([EC.aiPrompt.build()], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'electrocore-ai-prompt.txt';   // имя без кириллицы — переживает любую систему
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('Описание сохранено');
    });
    $('aiCurrent').addEventListener('click', function () {
      $('aiInput').value = JSON.stringify(EC.aiPrompt.export(circuit, 'Текущая схема'), null, 2);
      showAiResult(null, [], ['Схема со стола записана в поле. Скопируйте её вместе с описанием и попросите ИИ внести правки.']);
    });
    $('aiBuild').addEventListener('click', buildFromAi);
  }

  function buildFromAi() {
    var res = EC.aiPrompt.parse($('aiInput').value);
    if (!res.ok) { showAiResult(false, res.errors, res.warnings); return; }
    pushUndo();
    setCircuit(res.circuit);
    renderer.fit();
    state.running = true;
    updateRunUI();
    showAiResult(true, [], res.warnings, res);
    if (res.note) showAlert(res.note, 'info', 12000);
  }

  /** Показывает итог разбора: что собралось, что не так. */
  function showAiResult(ok, errors, warnings, res) {
    var host = $('aiResult');
    var html = '';
    if (ok === true && res) {
      var nc = res.circuit.components.length, nw = res.circuit.wires.length;
      html += '<div class="ok">Собрано: «' + escapeHtml(res.title) + '» — ' +
        nc + ' ' + plural(nc, ['деталь', 'детали', 'деталей']) + ', ' +
        nw + ' ' + plural(nw, ['провод', 'провода', 'проводов']) + '.</div>';
    } else if (ok === false) {
      html += '<div class="bad">Схему собрать не удалось:</div>';
    }
    if (errors && errors.length) {
      html += '<ul>' + errors.map(function (e) {
        return '<li>' + escapeHtml(e) + '</li>';
      }).join('') + '</ul>';
    }
    if (warnings && warnings.length) {
      html += '<ul>' + warnings.map(function (w) {
        return '<li class="warn">' + escapeHtml(w) + '</li>';
      }).join('') + '</ul>';
    }
    host.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /** Справочная таблица команд процессора — строится из его же описания. */
  function buildIsaTable() {
    var host = $('isaTable');
    if (!host || !EC.cpu) return;
    var html = '';
    EC.cpu.ISA.forEach(function (d) {
      var operand = d.arg === 'n' ? ' число' : (d.arg === 'a' ? ' адрес' : '');
      html += '<tr><td>' + d.m + operand + '</td><td>' + d.t + '</td></tr>';
    });
    host.innerHTML = html;
  }

  function formatSpeed(s) {
    return s >= 1 ? (Math.round(s * 100) / 100) + '×' : '1/' + Math.round(1 / s) + '×';
  }

  function bindOption(id, key) {
    var el = $(id);
    el.addEventListener('change', function () { renderer.options[key] = el.checked; });
  }

  function newCircuit() {
    pushUndo();
    circuit = new EC.Circuit();
    renderer.circuit = circuit;
    scope.circuit = circuit;
    scope.channels = [];
    renderer.selection = [];
    state.hasRun = false;
    updateInspector();
    renderScopeChips();
    renderer.fit();
    toast('Новая схема');
  }

  function buildExamples() {
    var list = $('exampleList');
    EC.examples.forEach(function (ex) {
      var card = U.el('button', { class: 'ex-card' });
      card.appendChild(U.el('span', { class: 'ex-name', text: ex.name }));
      card.appendChild(U.el('span', { class: 'ex-hint', text: ex.hint }));
      card.addEventListener('click', function () {
        $('exampleModal').hidden = true;
        loadExample(ex.id);
      });
      list.appendChild(card);
    });
    $('btnExamples').addEventListener('click', function () {
      $('exampleModal').hidden = false;
    });
    $('exampleClose').addEventListener('click', function () { $('exampleModal').hidden = true; });
    $('exampleModal').addEventListener('click', function (e) {
      if (e.target === $('exampleModal')) $('exampleModal').hidden = true;
    });
  }

  function loadExample(id) {
    var ex = null;
    for (var i = 0; i < EC.examples.length; i++) if (EC.examples[i].id === id) ex = EC.examples[i];
    if (!ex) return;
    pushUndo();
    setCircuit(ex.make());
    // сразу выводим щупы на осциллограф
    circuit.components.forEach(function (c) {
      if (c.def().scopeDefault) scope.add(c.id, 'v');
    });
    renderScopeChips();
    if (scope.channels.length) { $('scopePanel').classList.remove('collapsed'); onResize(); }
    renderer.fit();
    state.running = true;
    updateRunUI();
    showAlert(ex.hint, 'info', 9000);
  }

  function setCircuit(ct) {
    circuit = ct;
    renderer.circuit = ct;
    scope.circuit = ct;
    scope.channels = scope.channels.filter(function (ch) { return ct.byId(ch.compId); });
    scope.clear();
    renderer.selection = [];
    state.hasRun = false;
    updateInspector();
    updateDt();
    renderScopeChips();
  }

  function exportFile() {
    var data = JSON.stringify(circuit.toJSON(), null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'схема-electrocore.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function importFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        pushUndo();
        setCircuit(EC.Circuit.fromJSON(JSON.parse(rd.result)));
        renderer.fit();
        toast('Схема загружена из файла');
      } catch (err) { toast('Не удалось прочитать файл'); }
    };
    rd.readAsText(f);
    e.target.value = '';
  }

  var LS_KEY = 'electrocore.circuit';
  function saveLocal(silent) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(circuit.toJSON())); }
    catch (e) { if (!silent) toast('Не удалось сохранить'); }
  }
  function loadLocal(silent) {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data.components || !data.components.length) return false;
      if (!silent) pushUndo();
      setCircuit(EC.Circuit.fromJSON(data));
      return true;
    } catch (e) { return false; }
  }

  /* ================================================================== */
  /*  История изменений                                                 */
  /* ================================================================== */

  function pushUndo() {
    undoStack.push(JSON.stringify(circuit.toJSON()));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(circuit.toJSON()));
    setCircuit(EC.Circuit.fromJSON(JSON.parse(undoStack.pop())));
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(circuit.toJSON()));
    setCircuit(EC.Circuit.fromJSON(JSON.parse(redoStack.pop())));
  }

  /* ================================================================== */
  /*  Ввод: мышь и касания                                              */
  /* ================================================================== */

  function localPos(e) {
    var r = board.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function bindBoard() {
    board.addEventListener('pointerdown', wakeAudio);
    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointercancel', onPointerUp);
    board.addEventListener('pointerleave', function (e) {
      if (!state.action) { renderer.hoverPin = null; }
    });
    board.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = localPos(e);
      var before = renderer.toWorld(p.x, p.y);
      var z = U.clamp(renderer.view.zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.2, 4);
      renderer.view.zoom = z;
      var after = renderer.toWorld(p.x, p.y);
      renderer.view.x += (after.x - before.x) * GRID * z;
      renderer.view.y += (after.y - before.y) * GRID * z;
    }, { passive: false });
    board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    board.addEventListener('dblclick', function (e) {
      var p = localPos(e);
      var w = renderer.toWorld(p.x, p.y);
      var c = renderer.componentAt(w.x, w.y);
      if (c && c.def().toggle) { c.def().toggle(c); }
    });
  }

  function onPointerDown(e) {
    board.setPointerCapture(e.pointerId);
    var p = localPos(e);
    state.pointers[e.pointerId] = p;
    var ids = Object.keys(state.pointers);

    if (ids.length === 2) {                       // два пальца — масштаб и панорама
      cancelAction();
      var a = state.pointers[ids[0]], b = state.pointers[ids[1]];
      state.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        zoom: renderer.view.zoom, vx: renderer.view.x, vy: renderer.view.y
      };
      return;
    }
    if (ids.length > 2) return;

    var w = renderer.toWorld(p.x, p.y);

    // средняя кнопка или пробел — панорама
    if (e.button === 1 || state.spaceDown) {
      state.action = { type: 'pan', sx: p.x, sy: p.y, vx: renderer.view.x, vy: renderer.view.y };
      board.parentNode.classList.add('panning');
      return;
    }

    if (state.armed) {
      placeComponent(state.armed, w);
      if (!e.shiftKey) disarm();
      return;
    }

    var touch = e.pointerType === 'touch';
    var pin = renderer.pinAt(w.x, w.y, touch ? 1.25 : 0.75);
    var comp = renderer.componentAt(w.x, w.y);
    var wire = pin ? null : renderer.wireAt(w.x, w.y);

    if (state.mode === 'erase') {
      pushUndo();
      if (comp) { circuit.remove(comp); renderer.selection = []; updateInspector(); }
      else if (wire) circuit.removeWire(wire);
      return;
    }

    if (pin && (state.mode === 'wire' || state.mode === 'select')) {
      state.action = {
        type: 'wire', from: pin, moved: false, touch: touch,
        horizFirst: Math.abs(pin.comp.def().pins[pin.pin].x) >= Math.abs(pin.comp.def().pins[pin.pin].y)
      };
      renderer.pendingWire = { from: pin, to: w, horizFirst: state.action.horizFirst };
      return;
    }

    if (comp) {
      if (renderer.selection.indexOf(comp) < 0) {
        renderer.selection = e.shiftKey ? renderer.selection.concat([comp]) : [comp];
      }
      updateInspector();
      markInspectorAvailable();
      var def = comp.def();
      if (def.momentary) { comp.pressed = true; }
      state.action = {
        type: 'move', start: w, moved: false, comp: comp,
        origin: renderer.selection.map(function (c) { return { c: c, x: c.x, y: c.y }; })
      };
      return;
    }

    if (wire) {
      renderer.selection = [wire];
      updateInspector();
      markInspectorAvailable();
      var handle = renderer.wireMidAt(w.x, w.y, touch ? 0.9 : 0.55);
      if (handle === wire) {
        pushUndo();
        state.action = { type: 'wiremove', wire: wire, moved: false };
      } else {
        state.action = { type: 'wiresel' };
      }
      return;
    }

    // пустое место: на сенсорном экране — панорама, мышью — рамка выделения
    if (e.pointerType === 'touch') {
      state.action = { type: 'pan', sx: p.x, sy: p.y, vx: renderer.view.x, vy: renderer.view.y };
    } else {
      if (!e.shiftKey) { renderer.selection = []; updateInspector(); }
      state.action = { type: 'marquee', start: w };
    }
  }

  function onPointerMove(e) {
    var p = localPos(e);
    if (state.pointers[e.pointerId]) state.pointers[e.pointerId] = p;

    if (state.pinch) {
      var ids = Object.keys(state.pointers);
      if (ids.length < 2) return;
      var a = state.pointers[ids[0]], b = state.pointers[ids[1]];
      var dist = Math.hypot(a.x - b.x, a.y - b.y);
      var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      var k = U.clamp(dist / (state.pinch.dist || 1), 0.15, 8);
      var z = U.clamp(state.pinch.zoom * k, 0.2, 4);
      renderer.view.zoom = z;
      renderer.view.x = cx - (state.pinch.cx - state.pinch.vx) * (z / state.pinch.zoom);
      renderer.view.y = cy - (state.pinch.cy - state.pinch.vy) * (z / state.pinch.zoom);
      return;
    }

    var w = renderer.toWorld(p.x, p.y);
    var act = state.action;

    if (!act) {
      renderer.hoverPin = renderer.pinAt(w.x, w.y, 0.7);
      if (state.armed) renderer.ghost = ghostAt(state.armed, w);
      return;
    }

    if (act.type === 'pan') {
      renderer.view.x = act.vx + (p.x - act.sx);
      renderer.view.y = act.vy + (p.y - act.sy);
      return;
    }
    if (act.type === 'wire') {
      act.moved = true;
      var target = renderer.pinAt(w.x, w.y, act.touch ? 1.4 : 0.8);
      renderer.hoverPin = target;
      renderer.pendingWire.to = target ? target.pos : w;
      return;
    }
    if (act.type === 'move') {
      var dx = Math.round(w.x - act.start.x), dy = Math.round(w.y - act.start.y);
      if (dx || dy) act.moved = true;
      act.origin.forEach(function (o) { o.c.x = o.x + dx; o.c.y = o.y + dy; });
      circuit.dirty = true;
      return;
    }
    if (act.type === 'wiremove') {
      var nm = Math.round(act.wire.axis === 'v' ? w.y : w.x);
      if (nm !== act.wire.mid) { act.wire.mid = nm; act.moved = true; }
      return;
    }
    if (act.type === 'marquee') {
      renderer.marquee = {
        x: Math.min(act.start.x, w.x), y: Math.min(act.start.y, w.y),
        w: Math.abs(w.x - act.start.x), h: Math.abs(w.y - act.start.y)
      };
      return;
    }
  }

  function onPointerUp(e) {
    delete state.pointers[e.pointerId];
    if (Object.keys(state.pointers).length < 2) state.pinch = null;
    var act = state.action;
    var p = localPos(e);
    var w = renderer.toWorld(p.x, p.y);

    if (act) {
      if (act.type === 'wire') {
        var target = renderer.pinAt(w.x, w.y, act.touch ? 1.5 : 0.9);
        if (target && !(target.comp === act.from.comp && target.pin === act.from.pin)) {
          pushUndo();
          circuit.connect(act.from.comp.id, act.from.pin, target.comp.id, target.pin);
          updateDt();
        } else if (!act.moved) {
          // короткое касание вывода — выделяем элемент
          renderer.selection = [act.from.comp];
          updateInspector();
        }
        renderer.pendingWire = null;
      } else if (act.type === 'move') {
        if (act.moved) { circuit.dirty = true; }
        else {
          var def = act.comp.def();
          if (def.toggle) { def.toggle(act.comp); }
        }
        if (act.comp.def().momentary) act.comp.pressed = false;
      } else if (act.type === 'marquee' && renderer.marquee) {
        var m = renderer.marquee;
        renderer.selection = circuit.components.filter(function (c) {
          var b = c.bounds();
          return b.x + b.w > m.x && b.x < m.x + m.w && b.y + b.h > m.y && b.y < m.y + m.h;
        });
        updateInspector();
      }
    }
    // отпускаем «нажатые» кнопки на случай потери события
    circuit.components.forEach(function (c) { if (c.def().momentary) c.pressed = false; });
    renderer.marquee = null;
    board.parentNode.classList.remove('panning');
    state.action = null;
  }

  function cancelAction() {
    state.action = null;
    renderer.pendingWire = null;
    renderer.marquee = null;
  }

  /* ================================================================== */
  /*  Клавиатура                                                        */
  /* ================================================================== */

  function bindKeyboard() {
    global.addEventListener('keydown', function (e) {
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (e.code === 'Space') { state.spaceDown = true; }
      var k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        else if (k === 'y') { e.preventDefault(); redo(); }
        else if (k === 'd') { e.preventDefault(); duplicateSelection(); }
        else if (k === 's') { e.preventDefault(); saveLocal(); toast('Сохранено'); }
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); toggleRun(); return; }
      if (k === 'v') setMode('select');
      else if (k === 'w') setMode('wire');
      else if (k === 'e') setMode('erase');
      else if (k === 'r') rotateSelection();
      else if (k === 'd') applySkin(state.skin === 'real' ? 'schema' : 'real');
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
      else if (e.key === 'Escape') { disarm(); renderer.selection = []; updateInspector(); }
    });
    global.addEventListener('keyup', function (e) {
      if (e.code === 'Space') state.spaceDown = false;
    });
  }

  function rotateSelection() {
    var sel = renderer.selection.filter(function (s) { return s.def; });
    if (!sel.length) { state.lastRot = ((state.lastRot || 0) + 1) % 4; return; }
    pushUndo();
    sel.forEach(function (c) { c.rot = ((c.rot || 0) + 1) % 4; });
    state.lastRot = sel[0].rot;
    circuit.dirty = true;
  }

  function deleteSelection() {
    if (!renderer.selection.length) return;
    pushUndo();
    renderer.selection.forEach(function (s) {
      if (s.def) circuit.remove(s); else circuit.removeWire(s);
    });
    renderer.selection = [];
    scope.channels = scope.channels.filter(function (ch) { return circuit.byId(ch.compId); });
    updateInspector();
    renderScopeChips();
  }

  function duplicateSelection() {
    var sel = renderer.selection.filter(function (s) { return s.def; });
    if (!sel.length) return;
    pushUndo();
    var copies = sel.map(function (c) {
      var n = circuit.add(c.type, c.x + 4, c.y + 4);
      n.rot = c.rot;
      for (var k in c.props) n.props[k] = c.props[k];
      return n;
    });
    renderer.selection = copies;
    updateInspector();
  }

  /* ================================================================== */
  /*  Инспектор                                                         */
  /* ================================================================== */

  function updateInspector() {
    var body = $('inspectorBody');
    var title = $('inspTitle');
    var sel = renderer.selection;
    body.innerHTML = '';

    if (!sel.length) {
      title.textContent = 'Свойства';
      body.appendChild(U.el('p', {
        class: 'placeholder',
        text: 'Выберите элемент, чтобы изменить параметры и увидеть измерения.'
      }));
      return;
    }
    if (sel.length > 1) {
      title.textContent = 'Выделено: ' + sel.length;
      var sec = U.el('div', { class: 'insp-section' });
      var acts = U.el('div', { class: 'insp-actions' });
      acts.appendChild(actionBtn('Повернуть', rotateSelection));
      acts.appendChild(actionBtn('Дублировать', duplicateSelection));
      acts.appendChild(actionBtn('Удалить', deleteSelection, 'danger'));
      sec.appendChild(acts);
      body.appendChild(sec);
      return;
    }

    var item = sel[0];
    if (!item.def) {                              // выделен провод
      title.textContent = 'Провод';
      var ws = U.el('div', { class: 'insp-section' });
      ws.appendChild(readouts([
        { k: 'Ток', v: U.fmtSI(item.current || 0, 4) + 'А', cls: 'amber' }
      ]));

      var cf = U.el('div', { class: 'field' });
      cf.style.marginTop = '10px';
      cf.appendChild(U.el('label', { text: 'Цвет изоляции' }));
      var sw = U.el('div', { class: 'swatches' });
      EC.WIRE_COLORS.forEach(function (col, idx) {
        var b = U.el('button', {
          class: 'swatch' + (idx === item.color ? ' on' : ''),
          title: col.name
        });
        b.style.background = col.core;
        b.addEventListener('click', function () {
          item.color = idx;
          updateInspector();
        });
        sw.appendChild(b);
      });
      cf.appendChild(sw);
      ws.appendChild(cf);

      ws.appendChild(U.el('div', {
        class: 'insp-tip',
        text: 'Потяните за середину провода, чтобы переложить его на другую линию коврика.'
      }));

      var wa = U.el('div', { class: 'insp-actions' });
      wa.appendChild(actionBtn('Переложить', function () {
        pushUndo();
        item.mid = undefined;
        item.mid = circuit.chooseMid(item);
      }));
      wa.appendChild(actionBtn('Развернуть', function () {
        pushUndo();
        item.axis = item.axis === 'v' ? 'h' : 'v';
        item.mid = circuit.chooseMid(item);
      }));
      wa.appendChild(actionBtn('Удалить', function () {
        pushUndo(); circuit.removeWire(item); renderer.selection = []; updateInspector();
      }, 'danger'));
      ws.appendChild(wa);
      body.appendChild(ws);
      return;
    }

    var c = item, def = c.def();
    title.textContent = 'Свойства';

    /* шапка */
    var head = U.el('div', { class: 'insp-section' });
    var ttl = U.el('div', { class: 'insp-title' });
    ttl.appendChild(U.el('span', { class: 'nm', text: c.name || def.name }));
    ttl.appendChild(U.el('span', { class: 'chip', text: def.name }));
    head.appendChild(ttl);
    if (def.tip) head.appendChild(U.el('div', { class: 'insp-tip', text: def.tip }));

    var nameField = U.el('div', { class: 'field' });
    nameField.appendChild(U.el('label', { text: 'Обозначение' }));
    var nameInput = U.el('input', { type: 'text', value: c.name || '' });
    nameInput.addEventListener('change', function () { c.name = nameInput.value; });
    nameField.appendChild(nameInput);
    head.appendChild(nameField);
    body.appendChild(head);

    /* параметры */
    if (def.props.length) {
      var ps = U.el('div', { class: 'insp-section' });
      def.props.forEach(function (p) { ps.appendChild(propField(c, p)); });
      body.appendChild(ps);
    }

    /* измерения */
    var ms = U.el('div', { class: 'insp-section' });
    ms.appendChild(U.el('div', { class: 'insp-tip', text: 'Измерения' }));
    var rd = U.el('div', { class: 'readouts' });
    rd.id = 'liveReadouts';
    ms.appendChild(rd);
    if (def.key === 'npn' || def.key === 'pnp' || def.key === 'nmos' ||
      def.key === 'pmos' || def.key === 'cpu8' || def.key === 'cpu_bus' ||
      def.key === 'memory') {
      ms.appendChild(U.el('div', { class: 'insp-tip', id: 'liveExtra' }));
    }
    body.appendChild(ms);
    updateReadouts();

    /* действия */
    var as = U.el('div', { class: 'insp-section' });
    var acts2 = U.el('div', { class: 'insp-actions' });
    if (def.key === 'cpu8' || def.key === 'cpu_bus') {
      acts2.appendChild(actionBtn('Перезапустить', function () {
        if (def.init) def.init(c);
        toast('Процессор перезапущен');
      }));
    }
    acts2.appendChild(actionBtn('Повернуть', rotateSelection));
    acts2.appendChild(actionBtn('Дублировать', duplicateSelection));
    acts2.appendChild(actionBtn('На график', function () {
      var kind = def.measure === 'i' ? 'i' : (def.measure === 'p' ? 'p' : 'v');
      scope.add(c.id, kind);
      renderScopeChips();
      $('scopePanel').classList.remove('collapsed');
      onResize();
      toast('Добавлено на осциллограф');
    }));
    if (def.key !== 'probe') {
      acts2.appendChild(actionBtn('Ток на график', function () {
        scope.add(c.id, 'i'); renderScopeChips();
        $('scopePanel').classList.remove('collapsed'); onResize();
      }));
    }
    acts2.appendChild(actionBtn('Удалить', deleteSelection, 'danger'));
    as.appendChild(acts2);
    body.appendChild(as);
  }

  function actionBtn(text, fn, cls) {
    var b = U.el('button', { class: 'btn' + (cls ? ' ' + cls : ''), text: text });
    b.addEventListener('click', fn);
    return b;
  }

  function readouts(list) {
    var wrap = U.el('div', { class: 'readouts' });
    list.forEach(function (r) {
      var d = U.el('div', { class: 'readout' + (r.cls ? ' ' + r.cls : '') });
      d.appendChild(U.el('div', { class: 'rk', text: r.k }));
      d.appendChild(U.el('div', { class: 'rv', text: r.v }));
      wrap.appendChild(d);
    });
    return wrap;
  }

  function propField(c, p) {
    var f = U.el('div', { class: 'field' + (p.type === 'bool' ? ' check' : '') });
    var id = 'p_' + p.key;

    if (p.type === 'bool') {
      var cb = U.el('input', { type: 'checkbox', id: id });
      cb.checked = !!c.props[p.key];
      cb.addEventListener('change', function () {
        pushUndo(); c.props[p.key] = cb.checked;
      });
      f.appendChild(cb);
      f.appendChild(U.el('label', { for: id, text: p.label }));
      return f;
    }

    f.appendChild(U.el('label', { for: id, text: p.label + (p.unit ? ', ' + p.unit : '') }));

    if (p.type === 'code') {
      var ta = U.el('textarea', { class: 'code-edit', id: id, spellcheck: 'false' });
      ta.value = c.props[p.key] || '';
      var err = U.el('div', { class: 'code-err' });
      function assembleNow() {
        var res = EC.cpu.assemble(ta.value);
        if (res.ok) {
          err.className = 'code-err ok';
          err.textContent = 'Собрано: ' + res.size + ' байт';
        } else {
          err.className = 'code-err bad';
          err.textContent = 'Строка ' + res.errors[0].line + ': ' + res.errors[0].msg;
        }
      }
      ta.addEventListener('input', assembleNow);
      ta.addEventListener('change', function () {
        pushUndo();
        c.props[p.key] = ta.value;
        if (c.def().init) c.def().init(c);      // перезапуск с новой программой
        assembleNow();
      });
      assembleNow();
      f.appendChild(ta);
      f.appendChild(err);
      return f;
    }

    if (p.type === 'select') {
      var sel = U.el('select', { id: id });
      p.options.forEach(function (o) {
        sel.appendChild(U.el('option', { value: o.v, text: o.t }));
      });
      sel.value = c.props[p.key];
      sel.addEventListener('change', function () {
        pushUndo();
        c.props[p.key] = sel.value;
        if (c.type === 'led') {                  // цвет задаёт и напряжение открытия
          for (var i = 0; i < p.options.length; i++) {
            if (p.options[i].v === sel.value && p.options[i].vf) c.props.Vf = p.options[i].vf;
          }
          updateInspector();
        }
        updateDt();
      });
      f.appendChild(sel);
      return f;
    }

    if (p.type === 'range') {
      var row = U.el('div', { class: 'row' });
      var rg = U.el('input', {
        type: 'range', id: id,
        min: p.min, max: p.max, step: p.step || 0.01
      });
      rg.value = c.props[p.key];
      var fmt = p.display || function (v) { return Math.round(v * 100) + '%'; };
      var val = U.el('span', { class: 'val', text: fmt(c.props[p.key]) });
      rg.addEventListener('input', function () {
        c.props[p.key] = parseFloat(rg.value);
        val.textContent = fmt(c.props[p.key]);
      });
      row.appendChild(rg);
      row.appendChild(val);
      f.appendChild(row);
      return f;
    }

    var inp = U.el('input', { type: 'text', id: id, value: U.fmtSI(c.props[p.key], 4) });
    inp.addEventListener('change', function () {
      var v = U.parseValue(inp.value, c.props[p.key]);
      if (p.min !== undefined) v = Math.max(v, p.min);
      if (p.max !== undefined) v = Math.min(v, p.max);
      pushUndo();
      c.props[p.key] = v;
      inp.value = U.fmtSI(v, 4);
      if (p.key === 'v0' && c.def().init) c.def().init(c);
      updateDt();
    });
    f.appendChild(inp);
    return f;
  }

  /** Обновляет живые показания в инспекторе. */
  function updateReadouts() {
    var host = $('liveReadouts');
    if (!host) return;
    var sel = renderer.selection;
    if (sel.length !== 1 || !sel[0].def) return;
    var c = sel[0], def = c.def();
    var rows;
    if (def.key === 'npn' || def.key === 'pnp') {
      rows = [
        { k: 'Iб', v: U.fmtSI(c.ib || 0, 3) + 'А' },
        { k: 'Iк', v: U.fmtSI(c.ic || 0, 3) + 'А', cls: 'amber' },
        { k: 'Uкэ', v: U.fmtSI(c.vce || 0, 3) + 'В', cls: 'blue' }
      ];
    } else if (def.key === 'cpu8') {
      var mach = c.state && c.state.m;
      rows = mach ? [
        { k: 'A', v: EC.cpu.hex(mach.a) },
        { k: 'B', v: EC.cpu.hex(mach.b), cls: 'amber' },
        { k: 'PC', v: EC.cpu.hex(mach.pc), cls: 'blue' }
      ] : [{ k: '—', v: '—' }];
    } else if (def.key === 'cpu_bus') {
      var mb = c.state && c.state.m;
      rows = mb ? [
        { k: 'A', v: EC.cpu.hex(mb.a) },
        { k: 'адрес', v: EC.cpu.hex(mb.addr), cls: 'amber' },
        { k: 'PC', v: EC.cpu.hex(mb.pc), cls: 'blue' }
      ] : [{ k: '—', v: '—' }];
    } else if (def.key === 'memory') {
      rows = [
        { k: 'адрес', v: EC.cpu.hex(c.addr || 0) },
        { k: 'байт', v: EC.cpu.hex(c.byte || 0), cls: 'amber' },
        { k: 'U', v: U.fmtSI(c.v || 0, 3) + 'В', cls: 'blue' }
      ];
    } else if (def.key === 'opamp') {
      rows = [
        { k: 'Uвх', v: U.fmtSI(c.vin || 0, 3) + 'В' },
        { k: 'Uвых', v: U.fmtSI(c.vout || 0, 3) + 'В', cls: 'amber' },
        { k: 'Iвых', v: U.fmtSI(c.i || 0, 3) + 'А', cls: 'blue' }
      ];
    } else {
      rows = [
        { k: 'U', v: U.fmtSI(c.v || 0, 3) + 'В' },
        { k: 'I', v: U.fmtSI(c.i || 0, 3) + 'А', cls: 'amber' },
        { k: 'P', v: U.fmtSI(Math.abs(c.p || 0), 3) + 'Вт', cls: 'blue' }
      ];
    }
    var cells = host.children;
    if (cells.length !== rows.length) {
      host.innerHTML = '';
      rows.forEach(function (r) {
        var d = U.el('div', { class: 'readout' + (r.cls ? ' ' + r.cls : '') });
        d.appendChild(U.el('div', { class: 'rk', text: r.k }));
        d.appendChild(U.el('div', { class: 'rv', text: r.v }));
        host.appendChild(d);
      });
    } else {
      for (var i = 0; i < rows.length; i++) cells[i].children[1].textContent = rows[i].v;
    }
    var extra = $('liveExtra');
    if (!extra) return;
    if (def.key === 'cpu8') {
      var mm = c.state && c.state.m;
      if (!mm) { extra.textContent = ''; return; }
      var flags = (mm.z ? 'Z' : '·') + (mm.c ? 'C' : '·');
      var where = c.inReset ? 'сброс' : (mm.halted ? 'остановлен' : EC.cpu.disassemble(mm.mem, mm.pc).text);
      extra.textContent = 'Флаги ' + flags + ' · такт ' + mm.cycles + ' · ' + where;
    } else if (def.key === 'cpu_bus') {
      var mx = c.state && c.state.m;
      if (!mx) { extra.textContent = ''; return; }
      var fl = (mx.z ? 'Z' : '·') + (mx.c ? 'C' : '·');
      var what = c.inReset ? 'сброс'
        : (mx.halted ? 'остановлен'
          : (mx.fetch ? 'выборка кода' : (mx.rd ? 'запись в память' : 'чтение памяти')));
      extra.textContent = 'Флаги ' + fl + ' · такт ' + mx.cycles + ' · ' + what;
    } else if (def.key === 'memory') {
      extra.textContent = c.powered
        ? 'Обмен: ' + (c.mode || '—') + ' · ячеек ' + EC.MEM_BYTES +
          ' · ' + (c.selected ? 'микросхема выбрана' : 'не выбрана')
        : 'Питания нет';
    } else {
      extra.textContent = 'Режим: ' + (c.mode || '—');
    }
  }

  /* ================================================================== */
  /*  Осциллограф                                                       */
  /* ================================================================== */

  function bindScope() {
    $('btnScopeToggle').addEventListener('click', function () {
      $('scopePanel').classList.toggle('collapsed');
      setTimeout(onResize, 230);
    });
    $('btnScopeClear').addEventListener('click', function () { scope.clear(); });
    $('scopeTime').addEventListener('change', function (e) {
      scope.window = parseFloat(e.target.value);
      scope.clear();
    });
  }

  function renderScopeChips() {
    var host = $('scopeChips');
    host.innerHTML = '';
    scope.channels.forEach(function (ch) {
      var chip = U.el('span', { class: 'chip-ch' + (ch.visible ? '' : ' off') });
      var dot = U.el('span', { class: 'dot' });
      dot.style.background = ch.color;
      chip.appendChild(dot);
      chip.appendChild(U.el('span', { text: scope.title(ch) }));
      var x = U.el('span', { class: 'x', text: '✕' });
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        scope.remove(ch);
        renderScopeChips();
      });
      chip.appendChild(x);
      chip.addEventListener('click', function () {
        ch.visible = !ch.visible;
        renderScopeChips();
      });
      host.appendChild(chip);
    });
    if (!scope.channels.length) {
      host.appendChild(U.el('span', {
        class: 'mini',
        text: 'Выберите элемент и нажмите «На график»'
      }));
    }
  }

  function updateScopeStats() {
    var host = $('scopeStats');
    if (!host || $('scopePanel').classList.contains('collapsed')) return;
    var t0 = circuit.time - scope.window;
    var html = '';
    scope.channels.forEach(function (ch) {
      var st = scope.stats(ch, t0);
      var u = scope.unit(ch);
      html += '<div class="st-block"><div class="st-name" style="color:' + ch.color + '">' +
        scope.title(ch) + '</div>';
      if (st) {
        html += '<div class="st-row"><b>текущее</b><span>' + U.fmtSI(st.last, 3) + u + '</span></div>';
        html += '<div class="st-row"><b>размах</b><span>' + U.fmtSI(st.pp, 3) + u + '</span></div>';
        html += '<div class="st-row"><b>среднее</b><span>' + U.fmtSI(st.avg, 3) + u + '</span></div>';
        html += '<div class="st-row"><b>действ.</b><span>' + U.fmtSI(st.rms, 3) + u + '</span></div>';
        if (st.freq > 0.01) html += '<div class="st-row"><b>частота</b><span>' + U.fmtSI(st.freq, 3) + 'Гц</span></div>';
      } else {
        html += '<div class="st-row"><b>нет данных</b></div>';
      }
      html += '</div>';
    });
    host.innerHTML = html;
  }

  /* ================================================================== */
  /*  Мобильная панель                                                  */
  /* ================================================================== */

  function bindMobile() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-sheet]'), function (b) {
      b.addEventListener('click', function () { toggleSheet(b.getAttribute('data-sheet')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', hideSheets);
    });
    $('backdrop').addEventListener('click', hideSheets);
    $('mbRun').addEventListener('click', toggleRun);
    $('mbWire').addEventListener('click', function () {
      setMode(state.mode === 'wire' ? 'select' : 'wire');
    });
    $('mbScope').addEventListener('click', function () {
      $('scopePanel').classList.toggle('collapsed');
      setTimeout(onResize, 240);
    });
  }

  /** Подсвечивает кнопку «Свойства» на телефоне, когда есть что показать. */
  function markInspectorAvailable() {
    var b = document.querySelector('.mb[data-sheet="inspector"]');
    if (b) b.classList.add('active');
  }

  function toggleSheet(name) {
    var panel = $(name);
    var open = panel.classList.contains('open');
    hideSheets();
    if (!open) {
      panel.classList.add('open');
      $('backdrop').classList.add('show');
    }
  }
  function hideSheets() {
    var ib = document.querySelector('.mb[data-sheet="inspector"]');
    if (ib) ib.classList.remove('active');
    $('palette').classList.remove('open');
    $('inspector').classList.remove('open');
    $('backdrop').classList.remove('show');
  }

  /* ================================================================== */
  /*  Сообщения                                                         */
  /* ================================================================== */

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  var alertTimer;
  function showAlert(msg, kind, ms) {
    var host = $('alerts');
    host.innerHTML = '';
    host.appendChild(U.el('div', { class: 'alert ' + (kind || ''), text: msg }));
    clearTimeout(alertTimer);
    if (ms) alertTimer = setTimeout(function () { host.innerHTML = ''; }, ms);
  }

  /* ================================================================== */
  /*  Звук зуммеров                                                     */
  /* ================================================================== */

  var audio = { ctx: null, voices: {} };

  /** Звук можно запускать только после действия пользователя. */
  function wakeAudio() {
    if (!state.sound || audio.ctx) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    try {
      audio.ctx = new AC();
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
    } catch (e) { audio.ctx = null; }
  }

  function silenceAll() {
    for (var id in audio.voices) stopVoice(id);
  }

  function stopVoice(id) {
    var v = audio.voices[id];
    if (!v) return;
    try { v.gain.gain.value = 0; v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); }
    catch (e) { /* уже остановлен */ }
    delete audio.voices[id];
  }

  /** Громкость каждого зуммера следует за его током. */
  function updateSound() {
    if (!state.sound || !audio.ctx) { if (!state.sound) silenceAll(); return; }
    var live = {};
    for (var i = 0; i < circuit.components.length; i++) {
      var c = circuit.components[i];
      if (c.type !== 'buzzer') continue;
      var loud = state.running ? U.clamp(c.loud || 0, 0, 1) : 0;
      if (loud < 0.06) continue;
      live[c.id] = true;
      var v = audio.voices[c.id];
      if (!v) {
        try {
          var osc = audio.ctx.createOscillator();
          var gain = audio.ctx.createGain();
          osc.type = 'square';
          gain.gain.value = 0;
          osc.connect(gain);
          gain.connect(audio.ctx.destination);
          osc.start();
          v = audio.voices[c.id] = { osc: osc, gain: gain };
        } catch (e) { continue; }
      }
      v.osc.frequency.value = U.clamp(c.props.freq, 50, 8000);
      // несколько зуммеров не должны складываться в грохот
      v.gain.gain.value = 0.04 * loud;
    }
    for (var id in audio.voices) if (!live[id]) stopVoice(id);
  }

  /* ================================================================== */
  /*  Шаг расчёта                                                       */
  /* ================================================================== */

  /** Подбирает шаг интегрирования по самым быстрым процессам в схеме. */
  function estimateDt() {
    if (state.dtMode !== 'auto') return parseFloat(state.dtMode);
    var dt = 1e-3, i;
    var Ls = [], Cs = [];
    for (i = 0; i < circuit.components.length; i++) {
      var c = circuit.components[i];
      if (c.type === 'vsource' && c.props.wave !== 'dc' && c.props.freq > 0) {
        dt = Math.min(dt, 1 / (c.props.freq * 400));
      }
      if (c.type === 'cpu_bus' && c.props.clkSrc === 'internal') {
        // за один шаг расчёта процессор делает не больше одного обмена
        dt = Math.min(dt, 1 / (Math.max(c.props.freq, 1) * 4));
      }
      if (c.type === 'inductor') Ls.push(Math.max(c.props.L, 1e-12));
      if (c.type === 'capacitor' || c.type === 'capacitor_pol') Cs.push(Math.max(c.props.C, 1e-15));
    }
    if (Ls.length && Cs.length) {
      var best = Infinity;
      for (i = 0; i < Ls.length; i++) {
        for (var j = 0; j < Cs.length; j++) best = Math.min(best, Math.sqrt(Ls[i] * Cs[j]));
      }
      dt = Math.min(dt, 2 * Math.PI * best / 200);
    }
    return U.clamp(dt, 2e-8, 1e-3);
  }

  function updateDt() {
    circuit.dt = estimateDt();
  }

  /* ================================================================== */
  /*  Главный цикл                                                      */
  /* ================================================================== */

  var lastNow = 0;
  function frame(now) {
    var dtReal = lastNow ? U.clamp((now - lastNow) / 1000, 0.001, 0.05) : 0.016;
    lastNow = now;

    if (state.running) {
      var t0 = performance.now();
      var want = dtReal * state.speed;
      var dt = circuit.dt || 1e-4;
      var steps = Math.min(Math.ceil(want / dt), state.maxSteps);
      var done = 0;
      for (var i = 0; i < steps; i++) {
        if (!circuit.step(dt)) break;
        scope.sample(circuit.time);
        done++;
        if ((i & 63) === 63 && performance.now() - t0 > 11) break;
      }
      state.hasRun = state.hasRun || done > 0;
      state.lastRate = (done * dt) / dtReal;

      // подстраиваем нагрузку под кадр
      var spent = performance.now() - t0;
      if (spent > 10) state.maxSteps = Math.max(40, Math.round(state.maxSteps * 0.82));
      else if (spent < 5 && done >= steps) state.maxSteps = Math.min(8000, Math.round(state.maxSteps * 1.12) + 4);
    }

    if (state.hasRun) circuit.refreshDisplay();
    renderer.running = state.hasRun;
    renderer.simRunning = state.running;
    renderer.draw(dtReal);
    scope.draw();

    frameCount++;
    if (frameCount % 6 === 0) {
      updateSound();
      updateHud();
      updateReadouts();
      updateScopeStats();
    }
    requestAnimationFrame(frame);
  }
  var frameCount = 0;

  function updateHud() {
    $('hudTime').textContent = U.fmtSI(circuit.time, 4) + 'с';
    $('hudDt').textContent = U.fmtSI(circuit.dt, 3) + 'с';
    $('hudNodes').textContent = circuit.size || 0;
    $('hudIter').textContent = (circuit.iterations || 0) +
      (state.running ? ' · ' + formatSpeed(state.lastRate) : '');
    $('emptyHint').classList.toggle('hidden', circuit.components.length > 0);

    var host = $('alerts');
    if (circuit.error) showAlert(circuit.error);
    else if (circuit.warnings && circuit.warnings.length) showAlert(circuit.warnings[0]);
    else if (host.firstChild && !host.firstChild.classList.contains('info')) host.innerHTML = '';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
