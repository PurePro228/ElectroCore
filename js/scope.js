/* ElectroCore — осциллограф: кольцевые буферы каналов и отрисовка. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;

  var COLORS = ['#6fe0c2', '#ffd479', '#8fb6ff', '#ff8fa3', '#c9a0ff', '#7fe3ff'];
  var CAP = 4096;

  function Scope(canvas, circuit) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.circuit = circuit;
    this.channels = [];
    this.window = 0.05;          // ширина экрана по времени, с
    this.autoScale = true;
    this.vdiv = 5;
    this.paused = false;
    this.lastSample = -1;
    this.colorIdx = 0;
  }

  Scope.prototype.add = function (compId, kind) {
    for (var i = 0; i < this.channels.length; i++) {
      if (this.channels[i].compId === compId && this.channels[i].kind === kind) return this.channels[i];
    }
    if (this.channels.length >= 6) return null;
    var ch = {
      compId: compId, kind: kind || 'v',
      color: COLORS[this.colorIdx++ % COLORS.length],
      t: new Float64Array(CAP), y: new Float64Array(CAP),
      head: 0, count: 0, visible: true
    };
    this.channels.push(ch);
    return ch;
  };

  Scope.prototype.remove = function (ch) {
    var i = this.channels.indexOf(ch);
    if (i >= 0) this.channels.splice(i, 1);
  };

  Scope.prototype.clear = function () {
    for (var i = 0; i < this.channels.length; i++) {
      this.channels[i].head = 0; this.channels[i].count = 0;
    }
    this.lastSample = -1;
  };

  Scope.prototype.value = function (ch) {
    var c = this.circuit.byId(ch.compId);
    if (!c) return 0;
    if (ch.kind === 'i') return c.i || 0;
    if (ch.kind === 'p') return c.p || 0;
    if (c.type === 'probe') return c.v || 0;
    return c.v || 0;
  };

  Scope.prototype.unit = function (ch) {
    return ch.kind === 'i' ? 'А' : (ch.kind === 'p' ? 'Вт' : 'В');
  };

  Scope.prototype.title = function (ch) {
    var c = this.circuit.byId(ch.compId);
    var nm = c ? (c.name || c.def().name) : '—';
    return nm + ' · ' + (ch.kind === 'i' ? 'I' : ch.kind === 'p' ? 'P' : 'U');
  };

  /** Записывает точку, если прошёл интервал дискретизации. */
  Scope.prototype.sample = function (time) {
    if (this.paused || !this.channels.length) return;
    var interval = this.window / 1400;
    if (this.lastSample >= 0 && time - this.lastSample < interval) return;
    if (time < this.lastSample) this.clear();
    this.lastSample = time;
    for (var i = 0; i < this.channels.length; i++) {
      var ch = this.channels[i];
      ch.t[ch.head] = time;
      ch.y[ch.head] = this.value(ch);
      ch.head = (ch.head + 1) % CAP;
      if (ch.count < CAP) ch.count++;
    }
  };

  /** Точки канала, попавшие в окно [t0, t1]. */
  Scope.prototype.slice = function (ch, t0) {
    var out = [];
    var start = (ch.head - ch.count + CAP) % CAP;
    for (var k = 0; k < ch.count; k++) {
      var idx = (start + k) % CAP;
      if (ch.t[idx] >= t0) out.push({ t: ch.t[idx], y: ch.y[idx] });
    }
    return out;
  };

  Scope.prototype.stats = function (ch, t0) {
    var pts = this.slice(ch, t0);
    if (!pts.length) return null;
    var min = Infinity, max = -Infinity, sum = 0, sq = 0, i;
    for (i = 0; i < pts.length; i++) {
      var y = pts[i].y;
      if (y < min) min = y;
      if (y > max) max = y;
      sum += y; sq += y * y;
    }
    var avg = sum / pts.length;
    var rms = Math.sqrt(sq / pts.length);
    // частота по переходам среднего уровня снизу вверх
    var cross = [], prev = pts[0].y;
    for (i = 1; i < pts.length; i++) {
      if (prev <= avg && pts[i].y > avg) cross.push(pts[i].t);
      prev = pts[i].y;
    }
    var freq = cross.length > 1 ? (cross.length - 1) / (cross[cross.length - 1] - cross[0]) : 0;
    return { min: min, max: max, avg: avg, rms: rms, pp: max - min, freq: freq, last: pts[pts.length - 1].y };
  };

  Scope.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    var rect = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.width = rect.width; this.height = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  };

  Scope.prototype.draw = function (now) {
    var g = this.g;
    if (!this.width) this.resize();
    g.save();
    g.scale(this.dpr, this.dpr);
    var W = this.width, H = this.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#080f14';
    g.fillRect(0, 0, W, H);

    var padL = 4, padR = 4, padT = 4, padB = 4;
    var x0 = padL, y0 = padT, w = W - padL - padR, h = H - padT - padB;

    // сетка 10 × 8 делений
    g.strokeStyle = 'rgba(110,190,165,.14)';
    g.lineWidth = 1;
    var i;
    for (i = 0; i <= 10; i++) {
      var gx = x0 + w * i / 10;
      g.beginPath(); g.moveTo(gx, y0); g.lineTo(gx, y0 + h); g.stroke();
    }
    for (i = 0; i <= 8; i++) {
      var gy = y0 + h * i / 8;
      g.beginPath(); g.moveTo(x0, gy); g.lineTo(x0 + w, gy); g.stroke();
    }
    g.strokeStyle = 'rgba(130,220,190,.3)';
    g.beginPath();
    g.moveTo(x0, y0 + h / 2); g.lineTo(x0 + w, y0 + h / 2);
    g.moveTo(x0 + w / 2, y0); g.lineTo(x0 + w / 2, y0 + h);
    g.stroke();

    var tEnd = this.circuit.time;
    var t0 = tEnd - this.window;

    // вертикальный масштаб
    var scale = this.vdiv * 4;
    if (this.autoScale) {
      var m = 0;
      for (i = 0; i < this.channels.length; i++) {
        if (!this.channels[i].visible) continue;
        var st = this.stats(this.channels[i], t0);
        if (st) m = Math.max(m, Math.abs(st.min), Math.abs(st.max));
      }
      scale = m > 1e-12 ? m * 1.25 : 1;
    }

    for (i = 0; i < this.channels.length; i++) {
      var ch = this.channels[i];
      if (!ch.visible) continue;
      var pts = this.slice(ch, t0);
      if (pts.length < 2) continue;
      g.strokeStyle = ch.color;
      g.lineWidth = 1.7;
      g.lineJoin = 'round';
      g.shadowColor = ch.color;
      g.shadowBlur = 5;
      g.beginPath();
      for (var k = 0; k < pts.length; k++) {
        var px = x0 + w * U.clamp((pts[k].t - t0) / this.window, 0, 1);
        var py = y0 + h / 2 - U.clamp(pts[k].y / scale, -1.2, 1.2) * (h / 2);
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
      g.shadowBlur = 0;
    }

    // подписи масштаба
    g.font = '600 9px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(160,210,195,.75)';
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(U.fmtSI(scale / 4, 3) + '/дел', x0 + 5, y0 + 4);
    g.textAlign = 'right';
    g.fillText(U.fmtSI(this.window / 10, 3) + 'с/дел', x0 + w - 5, y0 + 4);
    g.restore();
  };

  Scope.COLORS = COLORS;
  EC.Scope = Scope;
})(window);
