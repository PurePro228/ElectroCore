/* ElectroCore — отрисовка рабочего стола на canvas. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;
  var GRID = EC.GRID;

  function Renderer(canvas, circuit) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.circuit = circuit;
    this.view = { x: 0, y: 0, zoom: 1 };
    this.dpr = 1;
    this.selection = [];
    this.hoverPin = null;
    this.hoverComp = null;
    this.pendingWire = null;
    this.ghost = null;
    this.options = { showValues: true, showCurrent: true, showVoltage: true, grid: true };
    this.running = false;      // расчёт уже выполнялся — можно показывать величины
    this.simRunning = false;   // расчёт идёт прямо сейчас — оживляем ток
  }

  Renderer.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    var rect = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  };

  /* ------------------------ преобразования --------------------------- */

  Renderer.prototype.toScreen = function (gx, gy) {
    return {
      x: (gx * GRID) * this.view.zoom + this.view.x,
      y: (gy * GRID) * this.view.zoom + this.view.y
    };
  };
  Renderer.prototype.toWorld = function (sx, sy) {
    return {
      x: (sx - this.view.x) / this.view.zoom / GRID,
      y: (sy - this.view.y) / this.view.zoom / GRID
    };
  };
  Renderer.prototype.centerOn = function (gx, gy) {
    this.view.x = this.width / 2 - gx * GRID * this.view.zoom;
    this.view.y = this.height / 2 - gy * GRID * this.view.zoom;
  };

  /** Вписывает схему в окно. */
  Renderer.prototype.fit = function () {
    var cs = this.circuit.components;
    if (!cs.length) { this.view.zoom = 1; this.centerOn(0, 0); return; }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < cs.length; i++) {
      var b = cs[i].bounds();
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    }
    var pad = 2.5;
    var w = (maxX - minX + pad * 2) * GRID, h = (maxY - minY + pad * 2) * GRID;
    this.view.zoom = U.clamp(Math.min(this.width / w, this.height / h), 0.25, 2.2);
    this.centerOn((minX + maxX) / 2, (minY + maxY) / 2);
  };

  /* --------------------------- отрисовка ----------------------------- */

  Renderer.prototype.draw = function (dtReal) {
    var g = this.g, v = this.view;
    g.save();
    g.scale(this.dpr, this.dpr);
    g.clearRect(0, 0, this.width, this.height);
    this.drawBackground(g);
    // видимая область в клетках сетки — всё за её пределами не рисуем
    var tl = this.toWorld(0, 0), br = this.toWorld(this.width, this.height);
    this.viewRect = { x0: tl.x - 3, y0: tl.y - 3, x1: br.x + 3, y1: br.y + 3 };
    g.save();
    g.translate(v.x, v.y);
    g.scale(v.zoom, v.zoom);
    if (this.options.grid) this.drawGrid(g);
    this.drawWires(g, dtReal);
    this.drawComponents(g);
    this.drawOverlay(g);
    g.restore();
    g.restore();
  };

  Renderer.prototype.drawBackground = function (g) {
    var grad = g.createRadialGradient(this.width * 0.5, this.height * 0.35, 40,
      this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.85);
    grad.addColorStop(0, '#1b2430');
    grad.addColorStop(1, '#0d131b');
    g.fillStyle = grad;
    g.fillRect(0, 0, this.width, this.height);
  };

  Renderer.prototype.drawGrid = function (g) {
    var v = this.view;
    var step = GRID;
    var x0 = Math.floor(-v.x / v.zoom / step) * step;
    var y0 = Math.floor(-v.y / v.zoom / step) * step;
    var x1 = x0 + this.width / v.zoom + step * 2;
    var y1 = y0 + this.height / v.zoom + step * 2;
    var n = ((x1 - x0) / step) * ((y1 - y0) / step);
    if (n > 26000) return;                       // при сильном отдалении сетку прячем
    g.fillStyle = 'rgba(140,170,200,' + (v.zoom < 0.6 ? 0.06 : 0.13) + ')';
    var r = v.zoom < 0.8 ? 0.8 : 1;
    for (var x = x0; x < x1; x += step) {
      for (var y = y0; y < y1; y += step) {
        var major = (Math.round(x / step) % 5 === 0) && (Math.round(y / step) % 5 === 0);
        if (major) {
          g.fillRect(x - r, y - r, r * 2 + 0.6, r * 2 + 0.6);
        } else if (v.zoom > 0.55) {
          g.fillRect(x - r * 0.5, y - r * 0.5, r, r);
        }
      }
    }
  };

  /* ------------------------------ провода ---------------------------- */

  /** Пересекается ли прямоугольник с видимой областью. */
  Renderer.prototype.visible = function (x0, y0, x1, y1) {
    var r = this.viewRect;
    if (!r) return true;
    return x1 >= r.x0 && x0 <= r.x1 && y1 >= r.y0 && y0 <= r.y1;
  };

  Renderer.prototype.drawWires = function (g, dtReal) {
    var ct = this.circuit, i, j;
    for (i = 0; i < ct.wires.length; i++) {
      var w = ct.wires[i];
      var path = ct.wirePath(w);
      if (!path) continue;
      w._path = path;
      var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (j = 0; j < path.length; j++) {
        bx0 = Math.min(bx0, path[j].x); bx1 = Math.max(bx1, path[j].x);
        by0 = Math.min(by0, path[j].y); by1 = Math.max(by1, path[j].y);
      }
      if (!this.visible(bx0, by0, bx1, by1)) continue;
      var pts = [];
      for (j = 0; j < path.length; j++) pts.push({ x: path[j].x * GRID, y: path[j].y * GRID });

      var volt = this.wireVoltage(w);
      var sel = this.selection.indexOf(w) >= 0;

      // тень провода
      g.strokeStyle = 'rgba(0,0,0,.45)';
      g.lineWidth = 5.2;
      g.lineJoin = 'round'; g.lineCap = 'round';
      this.strokePoly(g, pts, 0.9);

      g.strokeStyle = sel ? '#9fe8ff'
        : (this.options.showVoltage && this.running ? U.voltageColor(volt, this.voltScale()) : '#98a7b5');
      g.lineWidth = sel ? 4 : 3;
      this.strokePoly(g, pts, 0);

      // блик
      g.strokeStyle = 'rgba(255,255,255,.22)';
      g.lineWidth = 1;
      this.strokePoly(g, pts, -0.9);

      if (this.options.showCurrent && this.running) this.drawCurrentFlow(g, w, pts, this.simRunning ? dtReal : 0);
    }
  };

  Renderer.prototype.strokePoly = function (g, pts, off) {
    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var x = pts[i].x, y = pts[i].y + (off || 0);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  };

  Renderer.prototype.voltScale = function () {
    if (this._vscale === undefined) this._vscale = 12;
    return this._vscale;
  };

  Renderer.prototype.wireVoltage = function (w) {
    var c = this.circuit.byId(w.a.c);
    if (!c || !c.n) return 0;
    var n = c.n[w.a.p];
    return n === undefined || n < 0 ? 0 : (this.circuit.x ? this.circuit.x[n] : 0);
  };

  /** Бегущие точки, изображающие направление и величину тока. */
  Renderer.prototype.drawCurrentFlow = function (g, w, pts, dtReal) {
    var cur = w.current || 0;
    var mag = Math.abs(cur);
    if (mag < 2e-7) return;
    var speed = U.clamp(28 + 46 * Math.log10(1 + mag / 5e-4), 12, 190);
    w.phase = (w.phase || 0) + (cur > 0 ? 1 : -1) * speed * (dtReal || 0.016);

    var segs = [], total = 0, i;
    for (i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      var len = Math.sqrt(dx * dx + dy * dy);
      segs.push({ a: pts[i - 1], dx: dx / (len || 1), dy: dy / (len || 1), len: len, start: total });
      total += len;
    }
    if (total < 2) return;
    var spacing = 26;
    var off = ((w.phase % spacing) + spacing) % spacing;
    var alpha = U.clamp(0.18 + 0.45 * Math.log10(1 + mag / 1e-4) / 3, 0.18, 0.7);
    var rad = U.clamp(1.2 + 0.6 * Math.log10(1 + mag / 1e-3), 1.2, 2.4);
    g.fillStyle = 'rgba(126,240,208,' + alpha + ')';
    g.shadowColor = 'rgba(110,230,195,.7)';
    g.shadowBlur = 4;
    for (var d = off; d < total; d += spacing) {
      for (i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (d >= s.start && d <= s.start + s.len) {
          var t = d - s.start;
          g.beginPath();
          g.arc(s.a.x + s.dx * t, s.a.y + s.dy * t, rad, 0, 7);
          g.fill();
          break;
        }
      }
    }
    g.shadowBlur = 0;
  };

  /* --------------------------- компоненты ---------------------------- */

  Renderer.prototype.drawComponents = function (g) {
    var ct = this.circuit;
    for (var i = 0; i < ct.components.length; i++) {
      this.drawComponent(g, ct.components[i], this.selection.indexOf(ct.components[i]) >= 0);
    }
    if (this.ghost) {
      g.save();
      g.globalAlpha = 0.55;
      this.drawComponent(g, this.ghost, false);
      g.restore();
    }
  };

  Renderer.prototype.drawComponent = function (g, c, selected) {
    var def = c.def();
    var b0 = c.bounds();
    if (!this.visible(b0.x, b0.y, b0.x + b0.w, b0.y + b0.h)) return;
    g.save();
    g.translate(c.x * GRID, c.y * GRID);
    g.rotate((c.rot || 0) * Math.PI / 2);

    if (selected) {
      g.save();
      g.rotate(-(c.rot || 0) * Math.PI / 2);
      var b = c.bounds();
      g.strokeStyle = 'rgba(120,215,255,.9)';
      g.lineWidth = 1.4;
      g.setLineDash([5, 4]);
      EC.gfx.roundRect(g, (b.x - c.x) * GRID, (b.y - c.y) * GRID, b.w * GRID, b.h * GRID, 5);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(120,215,255,.07)';
      g.fill();
      g.restore();
    }

    try { def.draw(g, c, this); } catch (e) { /* не ломаем кадр из-за одного элемента */ }
    g.restore();

    // выводы
    for (var i = 0; i < def.pins.length; i++) {
      var p = c.pinPos(i);
      var connected = this.pinConnected(c, i);
      var hot = this.hoverPin && this.hoverPin.comp === c && this.hoverPin.pin === i;
      if (!connected || hot) {
        g.beginPath();
        g.arc(p.x * GRID, p.y * GRID, hot ? 5 : 3, 0, 7);
        g.fillStyle = hot ? 'rgba(126,240,208,.95)' : 'rgba(190,210,230,.55)';
        g.fill();
        if (hot) {
          g.strokeStyle = 'rgba(126,240,208,.6)';
          g.lineWidth = 2;
          g.beginPath(); g.arc(p.x * GRID, p.y * GRID, 9, 0, 7); g.stroke();
        }
      }
    }

    if (c.warn) {
      var bb = c.bounds();
      g.fillStyle = 'rgba(255,120,80,.9)';
      g.font = '700 13px sans-serif';
      g.textAlign = 'center';
      g.fillText('!', (bb.x + bb.w) * GRID, (bb.y + 3) * GRID);
    }

    if (this.options.showValues && this.running && !def.tiny) this.drawBadge(g, c);
  };

  Renderer.prototype.pinConnected = function (c, i) {
    var ws = this.circuit.wires;
    for (var k = 0; k < ws.length; k++) {
      if ((ws[k].a.c === c.id && ws[k].a.p === i) || (ws[k].b.c === c.id && ws[k].b.p === i)) return true;
    }
    return false;
  };

  /** Плашка с измеренными U / I / P рядом с элементом. */
  Renderer.prototype.drawBadge = function (g, c) {
    var def = c.def();
    if (def.measure || def.isGround || this.view.zoom < 0.55) return;
    var parts = [];
    if (Math.abs(c.v || 0) >= 1e-3) parts.push(U.fmtSI(c.v, 3) + 'В');
    if (Math.abs(c.i || 0) >= 1e-6) parts.push(U.fmtSI(Math.abs(c.i), 3) + 'А');
    var p = Math.abs(c.p || 0);
    if (p >= 1e-4) parts.push(U.fmtSI(p, 3) + 'Вт');
    if (!parts.length) return;
    var text = parts.join('  ');
    var b = c.bounds();
    var x = c.x * GRID, y = b.y * GRID - 5;
    g.font = '500 8px ui-monospace, Menlo, monospace';
    var w = g.measureText(text).width + 7;
    g.fillStyle = 'rgba(10,16,23,.72)';
    EC.gfx.roundRect(g, x - w / 2, y - 9.5, w, 11.5, 3);
    g.fill();
    g.fillStyle = 'rgba(143,232,205,.82)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y - 3.4);
  };

  /* ------------------------ временные элементы ----------------------- */

  Renderer.prototype.drawOverlay = function (g) {
    var pw = this.pendingWire;
    if (pw) {
      var from = pw.from.comp.pinPos(pw.from.pin);
      var a = { x: from.x * GRID, y: from.y * GRID };
      var b = { x: pw.to.x * GRID, y: pw.to.y * GRID };
      var mid = pw.horizFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
      g.strokeStyle = 'rgba(126,240,208,.85)';
      g.lineWidth = 2.5;
      g.setLineDash([6, 4]);
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(a.x, a.y); g.lineTo(mid.x, mid.y); g.lineTo(b.x, b.y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(126,240,208,.9)';
      g.beginPath(); g.arc(b.x, b.y, 4, 0, 7); g.fill();
    }
    if (this.marquee) {
      var m = this.marquee;
      g.fillStyle = 'rgba(120,215,255,.1)';
      g.strokeStyle = 'rgba(120,215,255,.7)';
      g.lineWidth = 1;
      g.setLineDash([4, 3]);
      g.fillRect(m.x * GRID, m.y * GRID, m.w * GRID, m.h * GRID);
      g.strokeRect(m.x * GRID, m.y * GRID, m.w * GRID, m.h * GRID);
      g.setLineDash([]);
    }
  };

  /* ---------------------------- попадания ---------------------------- */

  /** Ближайший вывод к точке (координаты сетки). */
  Renderer.prototype.pinAt = function (wx, wy, radius) {
    var best = null, bestD = (radius || 0.8);
    var cs = this.circuit.components;
    for (var i = 0; i < cs.length; i++) {
      for (var j = 0; j < cs[i].pinCount(); j++) {
        var p = cs[i].pinPos(j);
        var d = Math.sqrt(U.dist2(wx, wy, p.x, p.y));
        if (d < bestD) { bestD = d; best = { comp: cs[i], pin: j, pos: p }; }
      }
    }
    return best;
  };

  Renderer.prototype.componentAt = function (wx, wy) {
    var cs = this.circuit.components;
    for (var i = cs.length - 1; i >= 0; i--) {
      var b = cs[i].bounds();
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return cs[i];
    }
    return null;
  };

  Renderer.prototype.wireAt = function (wx, wy, tol) {
    tol = tol || 0.45;
    var ws = this.circuit.wires;
    for (var i = ws.length - 1; i >= 0; i--) {
      var path = ws[i]._path || this.circuit.wirePath(ws[i]);
      if (!path) continue;
      for (var j = 1; j < path.length; j++) {
        if (U.distToSegment(wx, wy, path[j - 1].x, path[j - 1].y, path[j].x, path[j].y) < tol) return ws[i];
      }
    }
    return null;
  };

  EC.Renderer = Renderer;
})(window);
