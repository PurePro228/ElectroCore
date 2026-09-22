/* ElectroCore — реалистичный вид деталей.
 *
 * Элементы рисуются такими, какими их видят на столе: резистор с цветными
 * полосами и утолщениями у выводов, электролит с полосой «минус», светодиод
 * с прозрачной линзой, транзистор в корпусе TO-92 и так далее.
 * Если для типа нет реалистичной картинки, используется условное обозначение.
 */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util;
  var GRID = EC.GRID;
  var gfx = EC.gfx;
  var roundRect = gfx.roundRect, label = gfx.label, grad = gfx.grad, radial = gfx.radial;

  var real = {};
  EC.real = real;

  /* ================================================================== */
  /*  Общие приёмы рисования                                            */
  /* ================================================================== */

  /** Мягкая тень под деталью. */
  function shadowUnder(g, w, h) {
    g.fillStyle = 'rgba(12,32,24,.13)';
    g.beginPath(); g.ellipse(2, h * 0.5 + 3, w * 0.52, h * 0.34, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(12,32,24,.16)';
    g.beginPath(); g.ellipse(1.5, h * 0.5 + 1.5, w * 0.46, h * 0.24, 0, 0, 7); g.fill();
  }

  /**
   * Лужёный вывод. Рисуется в собственной системе координат, поэтому
   * градиент можно закешировать независимо от положения детали.
   */
  function lead(g, x1, y1, x2, y2, w) {
    w = w || 2.8;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.4) return;
    g.save();
    g.translate(x1, y1);
    g.rotate(Math.atan2(dy, dx));
    g.fillStyle = 'rgba(12,32,24,.22)';
    roundRect(g, 0, -w / 2 + 1.5, len, w, w / 2); g.fill();
    g.fillStyle = grad(g, 'lead' + w, 0, -w / 2, 0, w / 2, [
      [0, '#818b93'], [0.3, '#eaf1f6'], [0.58, '#b4bfc8'], [1, '#69727a']
    ]);
    roundRect(g, 0, -w / 2, len, w, w / 2); g.fill();
    g.restore();
  }

  /** Два вывода вдоль оси X от корпуса шириной 2·inner. */
  function leads(g, inner, w) {
    lead(g, -2 * GRID, 0, -inner, 0, w);
    lead(g, inner, 0, 2 * GRID, 0, w);
  }

  /** Надпись на корпусе детали. */
  function silk(g, c, text, x, y, size, color) {
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.font = '600 ' + (size || 6.5) + 'px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color || 'rgba(250,252,255,.85)';
    g.fillText(text, x || 0, y || 0);
    g.restore();
  }

  /** Продольный блик на цилиндрическом корпусе. */
  function gloss(g, w, h, alpha) {
    g.fillStyle = 'rgba(255,255,255,' + (alpha || 0.26) + ')';
    roundRect(g, -w / 2 + 2, -h / 2 + 1.5, w - 4, h * 0.2, h * 0.1);
    g.fill();
  }

  EC.realGfx = { shadowUnder: shadowUnder, lead: lead, leads: leads, silk: silk, gloss: gloss };

  /* ================================================================== */
  /*  Пассивные элементы                                                */
  /* ================================================================== */

  real.resistor = function (g, c) {
    var w = GRID * 2.5, h = GRID * 0.94;
    leads(g, w / 2 - 2);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'resBody', 0, -h / 2, 0, h / 2, [
      [0, '#f2e0bd'], [0.26, '#e2c999'], [0.6, '#c7a973'], [1, '#9e8250']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, h * 0.46); g.fill();
    // утолщения у выводов
    g.fillStyle = grad(g, 'resCap', 0, -h / 2, 0, h / 2, [
      [0, '#f6e7c6'], [0.4, '#dec293'], [1, '#a68a56']
    ]);
    for (var s = -1; s <= 1; s += 2) {
      g.beginPath(); g.ellipse(s * w * 0.40, 0, h * 0.28, h * 0.55, 0, 0, 7); g.fill();
    }
    // цветовая маркировка
    g.save();
    roundRect(g, -w / 2, -h / 2, w, h, h * 0.46); g.clip();
    var bands = gfx.resistorBands(c.props.R);
    var xs = [-w * 0.25, -w * 0.12, w * 0.01, w * 0.24];
    for (var i = 0; i < 4; i++) {
      g.fillStyle = bands[i];
      g.fillRect(xs[i], -h / 2, i === 3 ? 2.6 : 3.4, h);
    }
    g.restore();
    gloss(g, w, h);
    g.strokeStyle = 'rgba(70,48,20,.3)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, h * 0.46); g.stroke();
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.R, 'Ω')]);
  };

  real.capacitor = function (g, c) {
    // керамический конденсатор: капля с двумя выводами
    var r = GRID * 0.78;
    lead(g, -2 * GRID, 0, -r * 0.5, 0, 2.6);
    lead(g, r * 0.5, 0, 2 * GRID, 0, 2.6);
    shadowUnder(g, r * 2, r * 1.5);
    g.fillStyle = grad(g, 'ceramBody', 0, -r, 0, r, [
      [0, '#9fc9e4'], [0.35, '#7db0d4'], [0.75, '#5d92b8'], [1, '#456f8e']
    ]);
    g.beginPath();
    g.moveTo(-r, r * 0.25);
    g.quadraticCurveTo(-r * 1.05, -r * 1.0, 0, -r * 1.0);
    g.quadraticCurveTo(r * 1.05, -r * 1.0, r, r * 0.25);
    g.quadraticCurveTo(r * 0.55, r * 0.72, 0, r * 0.72);
    g.quadraticCurveTo(-r * 0.55, r * 0.72, -r, r * 0.25);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(30,60,85,.4)'; g.lineWidth = 0.9; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.3)';
    g.beginPath(); g.ellipse(-r * 0.3, -r * 0.42, r * 0.34, r * 0.2, -0.5, 0, 7); g.fill();
    silk(g, c, capCode(c.props.C), 0, -r * 0.1, 6.5, 'rgba(20,45,65,.75)');
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.C, 'Ф')]);
  };

  /** Маркировка конденсатора тремя цифрами: 104 = 100 нФ. */
  function capCode(C) {
    var pf = C * 1e12;
    if (!(pf > 0)) return '—';
    if (pf < 100) return String(Math.round(pf));
    var e = Math.floor(Math.log(pf) / Math.LN10) - 1;
    var m = Math.round(pf / Math.pow(10, e));
    if (m >= 100) { m = Math.round(m / 10); e++; }
    return String(m) + String(Math.min(e, 9));
  }

  real.capacitor_pol = function (g, c) {
    // алюминиевый электролит: банка с полосой «минус» со стороны катода
    var w = GRID * 2.3, h = GRID * 1.6;
    leads(g, w / 2 - 1);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'elBody', 0, -h / 2, 0, h / 2, [
      [0, '#3a4a6d'], [0.22, '#26314c'], [0.6, '#1a2338'], [1, '#0f1626']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 4); g.fill();
    // торцы банки
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.beginPath(); g.ellipse(-w / 2 + 3, 0, 3, h / 2 - 1, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.ellipse(w / 2 - 3, 0, 3, h / 2 - 1, 0, 0, 7); g.fill();
    // полоса катода
    var sw = w * 0.2;
    g.fillStyle = grad(g, 'elStripe', 0, -h / 2, 0, h / 2, [
      [0, '#dbe6f2'], [0.5, '#b9c7d8'], [1, '#8b9bb0']
    ]);
    g.fillRect(w / 2 - sw - 3, -h / 2 + 1, sw, h - 2);
    g.fillStyle = 'rgba(30,45,70,.8)';
    for (var i = 0; i < 3; i++) g.fillRect(w / 2 - sw - 0.5, -h * 0.26 + i * h * 0.26, 4, 1.6);
    gloss(g, w, h, 0.14);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, 4); g.stroke();
    silk(g, c, U.fmtUnit(c.props.C, 'Ф'), -w * 0.1, -3, 6.5);
    silk(g, c, Math.round(c.props.vmax) + 'В', -w * 0.1, 5, 6);
    if (c.warn) {
      g.fillStyle = 'rgba(255,90,60,.3)';
      roundRect(g, -w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 5); g.fill();
    }
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.C, 'Ф')], GRID * 1.65);
  };

  real.inductor = function (g, c) {
    // катушка: медная обмотка на ферритовом сердечнике
    var w = GRID * 2.4, h = GRID * 1.0;
    leads(g, w / 2);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'ferrite', 0, -h / 2, 0, h / 2, [
      [0, '#6b7079'], [0.5, '#474c55'], [1, '#2c3037']
    ]);
    roundRect(g, -w / 2, -h * 0.32, w, h * 0.64, 2); g.fill();
    var turns = 7, tw = w / turns;
    for (var i = 0; i < turns; i++) {
      var x = -w / 2 + tw * (i + 0.5);
      g.fillStyle = grad(g, 'copper', 0, -h / 2, 0, h / 2, [
        [0, '#f7cf94'], [0.3, '#e0a552'], [0.65, '#b97c30'], [1, '#7d5019']
      ]);
      roundRect(g, x - tw * 0.36, -h / 2, tw * 0.72, h, tw * 0.3); g.fill();
      g.fillStyle = 'rgba(255,255,255,.22)';
      roundRect(g, x - tw * 0.26, -h / 2 + 1.4, tw * 0.5, h * 0.18, 1.5); g.fill();
    }
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.L, 'Гн')]);
  };

  real.pot = function (g, c) {
    // переменный резистор с поворотной ручкой
    var R = GRID * 1.15;
    lead(g, -2 * GRID, 0, -R * 0.75, 0);
    lead(g, R * 0.75, 0, 2 * GRID, 0);
    lead(g, 0, -2 * GRID, 0, -R * 0.75);
    shadowUnder(g, R * 2.2, R * 2);
    g.fillStyle = grad(g, 'potBase', 0, -R, 0, R, [
      [0, '#cfd8e0'], [0.45, '#9fadba'], [1, '#6e7d8a']
    ]);
    g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(40,55,70,.5)'; g.lineWidth = 1; g.stroke();
    // шкала
    g.strokeStyle = 'rgba(40,55,70,.35)'; g.lineWidth = 1;
    for (var i = 0; i <= 8; i++) {
      var a = Math.PI * 0.75 + (Math.PI * 1.5) * i / 8;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88);
      g.lineTo(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72);
      g.stroke();
    }
    // ручка с насечкой
    var kr = R * 0.62;
    g.fillStyle = grad(g, 'potKnob', 0, -kr, 0, kr, [
      [0, '#4a525c'], [0.4, '#2e343c'], [1, '#171b21']
    ]);
    g.beginPath(); g.arc(0, 0, kr, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
    for (i = 0; i < 12; i++) {
      var ka = i / 12 * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(ka) * kr * 0.75, Math.sin(ka) * kr * 0.75);
      g.lineTo(Math.cos(ka) * kr, Math.sin(ka) * kr);
      g.stroke();
    }
    var p = U.clamp(c.props.pos, 0, 1);
    var ang = Math.PI * 0.75 + Math.PI * 1.5 * p;
    g.strokeStyle = '#f4f8fb'; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(Math.cos(ang) * kr * 0.2, Math.sin(ang) * kr * 0.2);
    g.lineTo(Math.cos(ang) * kr * 0.85, Math.sin(ang) * kr * 0.85);
    g.stroke();
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.R, 'Ω'), Math.round(p * 100) + '%'], GRID * 1.75);
  };

  real.lamp = function (g, c) {
    // лампочка на цоколе E10
    var r = GRID * 0.95, glow = c.glow || 0;
    lead(g, -2 * GRID, 0, -GRID * 1.25, 0);
    lead(g, GRID * 1.25, 0, 2 * GRID, 0);
    shadowUnder(g, r * 2.6, r * 1.6);
    if (glow > 0.02) {
      var k = Math.min(glow, 1);
      var hal = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 3.4);
      hal.addColorStop(0, 'rgba(255,238,190,' + (0.6 * k) + ')');
      hal.addColorStop(0.35, 'rgba(255,205,110,' + (0.28 * k) + ')');
      hal.addColorStop(1, 'rgba(255,190,80,0)');
      g.fillStyle = hal;
      g.beginPath(); g.arc(0, 0, r * 3.4, 0, 7); g.fill();
    }
    // латунные цоколи с обеих сторон
    for (var s = -1; s <= 1; s += 2) {
      g.save();
      g.translate(s * r * 1.02, 0);
      g.fillStyle = grad(g, 'brass', 0, -r * 0.62, 0, r * 0.62, [
        [0, '#f0d79a'], [0.35, '#d7b465'], [0.7, '#a8863c'], [1, '#6f5722']
      ]);
      roundRect(g, -r * 0.34, -r * 0.6, r * 0.68, r * 1.2, 2); g.fill();
      g.strokeStyle = 'rgba(90,70,25,.45)'; g.lineWidth = 0.7;
      for (var i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-r * 0.34, -r * 0.35 + i * r * 0.35);
        g.lineTo(r * 0.34, -r * 0.35 + i * r * 0.35);
        g.stroke();
      }
      g.restore();
    }
    // стеклянная колба
    g.fillStyle = glow > 0.02
      ? 'rgba(255,' + Math.round(232 - 20 * Math.min(glow, 1)) + ',' + Math.round(170 - 60 * Math.min(glow, 1)) + ',' + (0.35 + 0.45 * Math.min(glow, 1)) + ')'
      : 'rgba(222,236,244,.45)';
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.strokeStyle = 'rgba(190,212,228,.85)'; g.lineWidth = 1.3;
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
    // нить накала
    g.strokeStyle = glow > 0.02
      ? 'rgb(255,' + Math.round(210 + 45 * Math.min(glow, 1)) + ',' + Math.round(130 + 110 * Math.min(glow, 1)) + ')'
      : '#8b949c';
    g.lineWidth = glow > 0.3 ? 1.9 : 1.2;
    g.shadowColor = 'rgba(255,205,125,.95)';
    g.shadowBlur = glow > 0.02 ? 9 * Math.min(glow, 1) : 0;
    g.beginPath();
    g.moveTo(-r * 0.6, r * 0.1);
    for (var k2 = 0; k2 <= 8; k2++) g.lineTo(-r * 0.6 + k2 * r * 0.15, (k2 % 2 ? -1 : 1) * r * 0.4);
    g.lineTo(r * 0.6, r * 0.1);
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,.4)';
    g.beginPath(); g.ellipse(-r * 0.34, -r * 0.4, r * 0.26, r * 0.15, -0.6, 0, 7); g.fill();
    label(g, c, [(c.name || '') + '  ' + c.props.Vn + 'В/' + c.props.Pn + 'Вт']);
  };

  real.fuse = function (g, c) {
    // стеклянный предохранитель с металлическими колпачками
    var w = GRID * 2.4, h = GRID * 0.9;
    var blown = c.state && c.state.blown;
    leads(g, w / 2);
    shadowUnder(g, w, h);
    g.fillStyle = 'rgba(225,240,248,.32)';
    roundRect(g, -w / 2, -h / 2, w, h, 2); g.fill();
    for (var s = -1; s <= 1; s += 2) {
      g.fillStyle = grad(g, 'fuseCap', 0, -h / 2, 0, h / 2, [
        [0, '#eef3f7'], [0.4, '#c3ccd4'], [1, '#848e97']
      ]);
      roundRect(g, s < 0 ? -w / 2 : w / 2 - w * 0.2, -h / 2, w * 0.2, h, 2); g.fill();
    }
    g.strokeStyle = blown ? '#60686f' : '#cbd4dc';
    g.lineWidth = 1.5; g.lineCap = 'round';
    g.beginPath();
    if (blown) {
      g.moveTo(-w * 0.3, 0); g.lineTo(-w * 0.08, -1.5);
      g.moveTo(w * 0.08, 1.5); g.lineTo(w * 0.3, 0);
    } else { g.moveTo(-w * 0.3, 0); g.lineTo(w * 0.3, 0); }
    g.stroke();
    if (blown) {
      g.fillStyle = 'rgba(40,40,45,.35)';
      roundRect(g, -w * 0.3, -h / 2 + 1, w * 0.6, h - 2, 2); g.fill();
    }
    g.strokeStyle = 'rgba(140,165,180,.55)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, 2); g.stroke();
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.In, 'А')]);
  };
})(window);

/* ElectroCore — реалистичный вид: источники и коммутация. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util, GRID = EC.GRID;
  var gfx = EC.gfx, roundRect = gfx.roundRect, label = gfx.label, grad = gfx.grad;
  var rg = EC.realGfx, lead = rg.lead, leads = rg.leads, shadowUnder = rg.shadowUnder, silk = rg.silk, gloss = rg.gloss;
  var real = EC.real;

  real.battery = function (g, c) {
    // батарейка «Крона» 9 В с двумя контактами
    var w = GRID * 2.2, h = GRID * 1.9;
    lead(g, -2 * GRID, 0, -w / 2, 0);
    lead(g, w / 2, 0, 2 * GRID, 0);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'battBody', 0, -h / 2, 0, h / 2, [
      [0, '#3c4655'], [0.2, '#252d39'], [0.65, '#171d26'], [1, '#0d1117']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
    // золотистая наклейка
    g.fillStyle = grad(g, 'battLabel', 0, -h * 0.28, 0, h * 0.28, [
      [0, '#e8c477'], [0.45, '#cfa34f'], [1, '#9c7830']
    ]);
    roundRect(g, -w / 2 + 2, -h * 0.3, w - 4, h * 0.58, 2); g.fill();
    silk(g, c, U.fmtUnit(c.props.V, 'В'), 0, 0, 8, 'rgba(35,25,5,.85)');
    // контакты сверху
    g.fillStyle = grad(g, 'battTerm', 0, -h / 2 - 4, 0, -h / 2 + 2, [
      [0, '#f0f5f9'], [0.5, '#c2ccd5'], [1, '#8b959e']
    ]);
    g.beginPath(); g.arc(-w * 0.2, -h / 2 - 1.5, 3.2, 0, 7); g.fill();
    roundRect(g, w * 0.08, -h / 2 - 4.5, 6, 5, 1.5); g.fill();
    gloss(g, w, h, 0.1);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.font = '700 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ff8f6a'; g.fillText('+', -GRID * 1.45, -GRID * 0.5);
    g.fillStyle = '#7fb0ff'; g.fillText('−', GRID * 1.45, -GRID * 0.5);
    g.restore();
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.V, 'В')], GRID * 1.85);
  };

  real.vsource = function (g, c) {
    // настольный генератор сигналов с экранчиком
    var w = GRID * 2.9, h = GRID * 2.1;
    lead(g, -2 * GRID, 0, -w / 2, 0);
    lead(g, w / 2, 0, 2 * GRID, 0);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'instrBody', 0, -h / 2, 0, h / 2, [
      [0, '#69737f'], [0.16, '#4b5563'], [0.7, '#333b47'], [1, '#232a33']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 4); g.fill();
    // экран с формой сигнала
    var sw = w - 9, sh = h * 0.52;
    g.fillStyle = grad(g, 'instrScreen', 0, -sh / 2, 0, sh / 2, [[0, '#0c2b24'], [1, '#07201a']]);
    roundRect(g, -sw / 2, -h / 2 + 4, sw, sh, 2.5); g.fill();
    g.save();
    g.translate(0, -h / 2 + 4 + sh / 2);
    g.strokeStyle = '#6fe0c2'; g.lineWidth = 1.5; g.lineJoin = 'round';
    g.shadowColor = '#54ffbe'; g.shadowBlur = 4;
    g.beginPath();
    var wv = c.props.wave;
    for (var i = 0; i <= 40; i++) {
      var ph = (i / 40) * 2, fp = ph % 1;
      var x = -sw / 2 + 3 + (i / 40) * (sw - 6), y;
      if (wv === 'square' || wv === 'pulse') y = (fp < 0.5 ? -1 : 1) * sh * 0.26;
      else if (wv === 'triangle') y = -(fp < 0.5 ? 4 * fp - 1 : 3 - 4 * fp) * sh * 0.26;
      else if (wv === 'saw') y = -(2 * fp - 1) * sh * 0.26;
      else if (wv === 'dc') y = -sh * 0.12;
      else y = -Math.sin(fp * 2 * Math.PI) * sh * 0.26;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.shadowBlur = 0;
    g.restore();
    // ручка и клеммы
    g.fillStyle = '#1b2029';
    g.beginPath(); g.arc(-w * 0.28, h * 0.22, GRID * 0.32, 0, 7); g.fill();
    g.strokeStyle = '#aab6c2'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-w * 0.28, h * 0.22); g.lineTo(-w * 0.28 + 4, h * 0.22 - 4); g.stroke();
    silk(g, c, c.props.wave === 'dc' ? U.fmtUnit(c.props.amp, 'В')
      : U.fmtUnit(c.props.freq, 'Гц'), w * 0.14, h * 0.24, 7, 'rgba(225,235,245,.8)');
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, 4); g.stroke();
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.amp, 'В')], GRID * 2);
  };

  real.isource = function (g, c) {
    var w = GRID * 2.4, h = GRID * 1.8;
    lead(g, -2 * GRID, 0, -w / 2, 0);
    lead(g, w / 2, 0, 2 * GRID, 0);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'instrBody', 0, -h / 2, 0, h / 2, [
      [0, '#69737f'], [0.16, '#4b5563'], [0.7, '#333b47'], [1, '#232a33']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 4); g.fill();
    g.fillStyle = grad(g, 'instrScreen', 0, -h * 0.3, 0, h * 0.3, [[0, '#0c2b24'], [1, '#07201a']]);
    roundRect(g, -w / 2 + 4, -h * 0.32, w - 8, h * 0.6, 2.5); g.fill();
    silk(g, c, U.fmtUnit(c.props.I, 'А'), 0, 0, 8, '#7dffd0');
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, 4); g.stroke();
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.I, 'А')], GRID * 1.75);
  };

  real.ground = function (g, c) {
    // клемма заземления с чёрным зажимом
    lead(g, 0, -GRID, 0, -GRID * 0.1);
    shadowUnder(g, GRID * 2, GRID * 0.7);
    // винтовая клемма
    g.fillStyle = grad(g, 'gndPost', 0, -GRID * 0.24, 0, GRID * 0.22, [
      [0, '#f2f6f9'], [0.45, '#c2ccd5'], [1, '#7b858f']
    ]);
    g.beginPath(); g.arc(0, -GRID * 0.02, GRID * 0.3, 0, 7); g.fill();
    g.fillStyle = '#2a323c';
    g.beginPath(); g.arc(0, -GRID * 0.02, GRID * 0.14, 0, 7); g.fill();
    // знак заземления
    g.strokeStyle = '#eef3f7'; g.lineCap = 'round';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, GRID * 0.24); g.lineTo(0, GRID * 0.42); g.stroke();
    var widths = [GRID * 0.8, GRID * 0.5, GRID * 0.22];
    for (var i = 0; i < 3; i++) {
      g.lineWidth = 3.2 - i * 0.7;
      g.strokeStyle = 'rgba(12,32,24,.25)';
      g.beginPath();
      g.moveTo(-widths[i], GRID * 0.48 + i * 5 + 1.4);
      g.lineTo(widths[i], GRID * 0.48 + i * 5 + 1.4);
      g.stroke();
      g.strokeStyle = '#eef3f7';
      g.beginPath();
      g.moveTo(-widths[i], GRID * 0.48 + i * 5);
      g.lineTo(widths[i], GRID * 0.48 + i * 5);
      g.stroke();
    }
  };

  real.switch = function (g, c) {
    // тумблер: металлический рычаг на чёрном основании
    var w = GRID * 2.0, h = GRID * 1.3, on = !!c.props.closed;
    lead(g, -2 * GRID, 0, -w / 2, 0);
    lead(g, w / 2, 0, 2 * GRID, 0);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'swBase', 0, -h / 2, 0, h / 2, [
      [0, '#4a525c'], [0.3, '#2b313a'], [1, '#161a20']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
    // резьбовая втулка
    g.fillStyle = grad(g, 'swBush', 0, -h * 0.4, 0, h * 0.4, [
      [0, '#e2e9ef'], [0.45, '#aab5bf'], [1, '#727d87']
    ]);
    g.beginPath(); g.arc(0, 0, GRID * 0.44, 0, 7); g.fill();
    // рычаг
    var dx = on ? GRID * 0.85 : -GRID * 0.85;
    g.save();
    g.strokeStyle = grad(g, 'swLever', 0, -3, 0, 3, [
      [0, '#f4f8fb'], [0.45, '#c3ccd5'], [1, '#7e8892']
    ]);
    g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(dx, -GRID * 0.62); g.stroke();
    g.fillStyle = '#eef3f8';
    g.beginPath(); g.arc(dx, -GRID * 0.62, 3.6, 0, 7); g.fill();
    g.restore();
    // индикатор положения
    g.fillStyle = on ? 'rgba(110,235,190,.95)' : 'rgba(120,132,145,.6)';
    g.beginPath(); g.arc(w / 2 - 5, h / 2 - 4, 2.4, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
    label(g, c, [(c.name || '') + (on ? '  вкл' : '  выкл')], GRID * 1.35);
  };

  real.button = function (g, c) {
    // тактовая кнопка с круглым колпачком
    var w = GRID * 1.5, h = GRID * 1.5, down = !!c.pressed;
    lead(g, -2 * GRID, 0, -w / 2, 0);
    lead(g, w / 2, 0, 2 * GRID, 0);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'btnBase', 0, -h / 2, 0, h / 2, [
      [0, '#3d444d'], [0.35, '#23282f'], [1, '#12151a']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 2.5); g.fill();
    var r = GRID * (down ? 0.44 : 0.5);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.arc(0.5, 1.5, r, 0, 7); g.fill();
    g.fillStyle = grad(g, down ? 'btnCapD' : 'btnCapU', 0, -r, 0, r, down
      ? [[0, '#b8483a'], [0.5, '#8d3226'], [1, '#5f1f16']]
      : [[0, '#ff7a63'], [0.42, '#e0503b'], [1, '#98301f']]);
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    if (!down) {
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.ellipse(-r * 0.28, -r * 0.34, r * 0.4, r * 0.24, -0.5, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, 2.5); g.stroke();
    label(g, c, [c.name || 'Кнопка'], GRID * 1.45);
  };

  real.spdt = function (g, c) {
    var w = GRID * 2.0, h = GRID * 2.4, b = !!c.props.b;
    lead(g, -2 * GRID, 0, -w / 2, 0);
    lead(g, w / 2, -GRID, 2 * GRID, -GRID);
    lead(g, w / 2, GRID, 2 * GRID, GRID);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'swBase', 0, -h / 2, 0, h / 2, [
      [0, '#4a525c'], [0.3, '#2b313a'], [1, '#161a20']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
    g.fillStyle = grad(g, 'swBush', 0, -GRID * 0.4, 0, GRID * 0.4, [
      [0, '#e2e9ef'], [0.45, '#aab5bf'], [1, '#727d87']
    ]);
    g.beginPath(); g.arc(-w * 0.15, 0, GRID * 0.4, 0, 7); g.fill();
    g.strokeStyle = grad(g, 'swLever', 0, -3, 0, 3, [
      [0, '#f4f8fb'], [0.45, '#c3ccd5'], [1, '#7e8892']
    ]);
    g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-w * 0.15, 0);
    g.lineTo(w * 0.32, b ? GRID * 0.85 : -GRID * 0.85);
    g.stroke();
    for (var i = -1; i <= 1; i += 2) {
      var active = (i > 0) === b;
      g.fillStyle = active ? 'rgba(110,235,190,.95)' : 'rgba(120,132,145,.5)';
      g.beginPath(); g.arc(w / 2 - 4, i * GRID, 2.4, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
    label(g, c, [(c.name || '') + ' → ' + (b ? '2' : '1')], GRID * 2.2);
  };

  real.relay = function (g, c) {
    // реле в синем корпусе
    var w = GRID * 2.6, h = GRID * 2.8, on = c.state && c.state.on;
    lead(g, -3 * GRID, -GRID, -w / 2, -GRID);
    lead(g, -3 * GRID, GRID, -w / 2, GRID);
    lead(g, w / 2, -GRID, 3 * GRID, -GRID);
    lead(g, w / 2, GRID, 3 * GRID, GRID);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, 'relayBody', 0, -h / 2, 0, h / 2, [
      [0, '#3f76c4'], [0.2, '#2d5ea6'], [0.7, '#1f4780'], [1, '#143156']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
    gloss(g, w, h, 0.18);
    silk(g, c, 'RELAY', 0, -h * 0.28, 7, 'rgba(240,248,255,.8)');
    silk(g, c, U.fmtUnit(c.props.Rcoil, 'Ω'), 0, -h * 0.28 + 10, 6.5, 'rgba(210,228,245,.65)');
    // окошко с якорем
    g.fillStyle = 'rgba(10,20,35,.5)';
    roundRect(g, -w * 0.32, h * 0.04, w * 0.64, h * 0.26, 2); g.fill();
    g.strokeStyle = on ? '#7dffd0' : '#8b97a4';
    g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-w * 0.24, h * 0.24);
    g.lineTo(w * 0.24, on ? h * 0.1 : h * 0.24);
    g.stroke();
    g.fillStyle = on ? 'rgba(125,255,208,.9)' : 'rgba(130,145,160,.55)';
    g.beginPath(); g.arc(w * 0.24, h * 0.09, 2.2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.9;
    roundRect(g, -w / 2, -h / 2, w, h, 3); g.stroke();
    label(g, c, [c.name || 'Реле'], GRID * 2.5);
  };
})(window);

/* ElectroCore — реалистичный вид: полупроводники и приборы. */
(function (global) {
  'use strict';
  var EC = global.EC, U = EC.util, GRID = EC.GRID;
  var gfx = EC.gfx, roundRect = gfx.roundRect, label = gfx.label, grad = gfx.grad, lcd = gfx.lcd;
  var rg = EC.realGfx, lead = rg.lead, leads = rg.leads, shadowUnder = rg.shadowUnder, silk = rg.silk, gloss = rg.gloss;
  var real = EC.real;

  /* --------------------------- диоды --------------------------------- */

  /** Корпус DO-41: цилиндр с полосой у катода. */
  function diodeCase(g, c, bodyKey, stops, bandColor, text) {
    var w = GRID * 1.9, h = GRID * 0.8;
    leads(g, w / 2, 2.6);
    shadowUnder(g, w, h);
    g.fillStyle = grad(g, bodyKey, 0, -h / 2, 0, h / 2, stops);
    roundRect(g, -w / 2, -h / 2, w, h, h * 0.3); g.fill();
    g.fillStyle = bandColor;
    g.fillRect(w / 2 - w * 0.22, -h / 2, w * 0.13, h);
    gloss(g, w, h, 0.2);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.8;
    roundRect(g, -w / 2, -h / 2, w, h, h * 0.3); g.stroke();
    if (text) silk(g, c, text, -w * 0.12, 0, 5.5, 'rgba(235,242,250,.7)');
  }

  real.diode = function (g, c) {
    diodeCase(g, c, 'diodeBody', [
      [0, '#4a4f57'], [0.22, '#2b2f36'], [0.68, '#1b1e23'], [1, '#0e1013']
    ], '#e8eef5', '1N4148');
    label(g, c, [c.name || 'Диод'], GRID * 1.1);
  };

  real.zener = function (g, c) {
    diodeCase(g, c, 'zenerBody', [
      [0, '#d9c08a'], [0.25, '#b99b5f'], [0.7, '#8e7440'], [1, '#5d4b26']
    ], '#1a1c20', null);
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(c.props.Vz, 'В')], GRID * 1.1);
  };

  real.led = function (g, c) {
    // светодиод 5 мм: прозрачная линза с фланцем
    var col = null, opts = null, i;
    var def = EC.defs.led;
    for (i = 0; i < def.props.length; i++) if (def.props[i].key === 'color') opts = def.props[i].options;
    for (i = 0; i < opts.length; i++) if (opts[i].v === c.props.color) col = opts[i];
    if (!col) col = opts[0];
    var rgb = col.rgb.join(',');
    var glow = c.glow || 0, k = Math.min(glow, 1);
    var r = GRID * 0.85;

    lead(g, -2 * GRID, 0, -r * 0.8, 0, 2.6);
    lead(g, r * 0.8, 0, 2 * GRID, 0, 2.6);
    shadowUnder(g, r * 2.4, r * 1.4);

    if (glow > 0.02) {
      var hal = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 3.2);
      hal.addColorStop(0, 'rgba(' + rgb + ',' + (0.6 * k) + ')');
      hal.addColorStop(0.4, 'rgba(' + rgb + ',' + (0.22 * k) + ')');
      hal.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = hal;
      g.beginPath(); g.arc(0, 0, r * 3.2, 0, 7); g.fill();
    }
    // фланец у основания
    g.fillStyle = 'rgba(' + col.rgb.map(function (v) { return Math.round(v * 0.45); }).join(',') + ',.85)';
    roundRect(g, -r * 0.92, r * 0.42, r * 1.84, r * 0.4, 2); g.fill();
    // линза
    var dark = col.rgb.map(function (v) { return Math.round(v * 0.4); }).join(',');
    var body = g.createRadialGradient(-r * 0.3, -r * 0.38, r * 0.1, 0, 0, r);
    body.addColorStop(0, 'rgba(' + rgb + ',' + (0.55 + 0.45 * k) + ')');
    body.addColorStop(0.6, 'rgba(' + rgb + ',' + (0.35 + 0.5 * k) + ')');
    body.addColorStop(1, 'rgba(' + dark + ',' + (0.75 + 0.2 * k) + ')');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, Math.PI, 0);
    g.lineTo(r, r * 0.55);
    g.lineTo(-r, r * 0.55);
    g.closePath();
    g.fill();
    // внутри линзы видны чашечка катода и стойка анода
    g.fillStyle = 'rgba(' + dark + ',.78)';
    g.beginPath();
    g.moveTo(-r * 0.40, r * 0.5);
    g.lineTo(-r * 0.16, r * 0.5);
    g.lineTo(-r * 0.10, -r * 0.02);
    g.lineTo(-r * 0.46, -r * 0.02);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(' + dark + ',.6)';
    g.fillRect(r * 0.2, -r * 0.05, r * 0.11, r * 0.55);
    if (glow > 0.05) {                       // светящийся кристалл в чашечке
      g.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.5 * k) + ')';
      g.beginPath(); g.ellipse(-r * 0.28, -r * 0.05, r * 0.13, r * 0.09, 0, 0, 7); g.fill();
    }
    // блик на линзе
    g.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.25 * k) + ')';
    g.beginPath(); g.ellipse(-r * 0.32, -r * 0.42, r * 0.22, r * 0.13, -0.6, 0, 7); g.fill();
    g.strokeStyle = 'rgba(' + dark + ',.6)'; g.lineWidth = 0.9;
    g.beginPath(); g.arc(0, 0, r, Math.PI, 0); g.stroke();
    label(g, c, [(c.name || '') + '  ' + U.fmtUnit(Math.max(c.i || 0, 0), 'А')], GRID * 1.25);
  };

  /* ------------------------- транзисторы ----------------------------- */

  /** Корпус TO-92: чёрный полуцилиндр с плоской лицевой стороной. */
  function to92(g, c, text, active) {
    var r = GRID * 1.05;
    lead(g, -2 * GRID, 0, -r * 0.55, r * 0.3, 2.6);
    lead(g, 2 * GRID, -2 * GRID, r * 0.1, -r * 0.2, 2.6);
    lead(g, 2 * GRID, 2 * GRID, r * 0.55, r * 0.3, 2.6);
    shadowUnder(g, r * 2, r * 1.9);
    g.fillStyle = grad(g, 'to92', 0, -r, 0, r, [
      [0, '#4c525b'], [0.18, '#2e333b'], [0.7, '#1c2027'], [1, '#0f1216']
    ]);
    g.beginPath();
    g.arc(0, 0, r, Math.PI, 0);
    g.lineTo(r, r * 0.62);
    g.lineTo(-r, r * 0.62);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.1)';
    roundRect(g, -r * 0.82, -r * 0.72, r * 1.64, r * 0.28, 2); g.fill();
    if (active) {
      g.strokeStyle = 'rgba(125,255,208,.55)'; g.lineWidth = 1.4;
      g.beginPath();
      g.arc(0, 0, r, Math.PI, 0);
      g.lineTo(r, r * 0.62); g.lineTo(-r, r * 0.62); g.closePath();
      g.stroke();
    } else {
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 0.8;
      g.beginPath(); g.arc(0, 0, r, Math.PI, 0); g.stroke();
    }
    silk(g, c, text, 0, r * 0.1, 5.5, 'rgba(230,238,246,.72)');
  }

  real.npn = function (g, c) {
    to92(g, c, 'BC547', c.mode === 'активный' || c.mode === 'насыщение');
    label(g, c, [c.name || 'NPN'], GRID * 1.65);
  };
  real.pnp = function (g, c) {
    to92(g, c, 'BC557', c.mode === 'активный' || c.mode === 'насыщение');
    label(g, c, [c.name || 'PNP'], GRID * 1.65);
  };

  /** Корпус TO-220 с металлическим фланцем. */
  function to220(g, c, text, open) {
    var w = GRID * 1.7, h = GRID * 2.1;
    lead(g, -2 * GRID, 0, -w * 0.1, h * 0.35, 2.6);
    lead(g, 2 * GRID, -2 * GRID, 0, -h * 0.1, 2.6);
    lead(g, 2 * GRID, 2 * GRID, w * 0.3, h * 0.35, 2.6);
    shadowUnder(g, w, h);
    // металлический фланец с отверстием
    g.fillStyle = grad(g, 'to220tab', 0, -h / 2, 0, -h * 0.1, [
      [0, '#e6ecf1'], [0.5, '#b4bec7'], [1, '#7d868f']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h * 0.42, 2); g.fill();
    g.fillStyle = 'rgba(40,50,60,.75)';
    g.beginPath(); g.arc(0, -h * 0.36, w * 0.14, 0, 7); g.fill();
    // пластиковый корпус
    g.fillStyle = grad(g, 'to220body', 0, -h * 0.1, 0, h / 2, [
      [0, '#3a4049'], [0.25, '#23282f'], [1, '#12151a']
    ]);
    roundRect(g, -w / 2, -h * 0.12, w, h * 0.62, 2); g.fill();
    if (open) {
      g.strokeStyle = 'rgba(125,255,208,.5)'; g.lineWidth = 1.3;
      roundRect(g, -w / 2, -h * 0.12, w, h * 0.62, 2); g.stroke();
    }
    silk(g, c, text, 0, h * 0.16, 5.5, 'rgba(228,236,244,.7)');
  }

  real.nmos = function (g, c) {
    to220(g, c, 'IRF540', c.mode && c.mode !== 'закрыт');
    label(g, c, [c.name || 'N-MOS'], GRID * 1.95);
  };
  real.pmos = function (g, c) {
    to220(g, c, 'IRF9540', c.mode && c.mode !== 'закрыт');
    label(g, c, [c.name || 'P-MOS'], GRID * 1.95);
  };

  real.opamp = function (g, c) {
    // микросхема DIP-8
    var w = GRID * 2.6, h = GRID * 2.0;
    lead(g, -3 * GRID, -GRID, -w / 2, -h * 0.22, 2.4);
    lead(g, -3 * GRID, GRID, -w / 2, h * 0.22, 2.4);
    lead(g, 3 * GRID, 0, w / 2, -h * 0.22, 2.4);
    shadowUnder(g, w, h);
    // неиспользуемые ножки корпуса
    g.fillStyle = '#9aa5b0';
    for (var i = 0; i < 2; i++) {
      g.fillRect(-w / 2 - 4, h * 0.02 + i * h * 0.3, 4, 2.4);
      g.fillRect(w / 2, -h * 0.4 + i * h * 0.6, 4, 2.4);
    }
    g.fillStyle = grad(g, 'dipBody', 0, -h / 2, 0, h / 2, [
      [0, '#40464f'], [0.18, '#272c33'], [0.72, '#191d23'], [1, '#0d1013']
    ]);
    roundRect(g, -w / 2, -h / 2, w, h, 2); g.fill();
    // выемка и точка первого вывода
    g.fillStyle = 'rgba(8,10,13,.9)';
    g.beginPath(); g.arc(-w / 2, 0, h * 0.14, -Math.PI / 2, Math.PI / 2); g.fill();
    g.fillStyle = 'rgba(190,200,212,.65)';
    g.beginPath(); g.arc(-w * 0.34, -h * 0.28, 1.8, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.07)';
    roundRect(g, -w / 2 + 1.5, -h / 2 + 1.5, w - 3, h * 0.2, 1.5); g.fill();
    silk(g, c, 'LM358', 0, h * 0.05, 6.5, 'rgba(232,240,248,.75)');
    if (c.sat) {
      g.strokeStyle = 'rgba(255,170,90,.7)'; g.lineWidth = 1.3;
      roundRect(g, -w / 2, -h / 2, w, h, 2); g.stroke();
    }
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.font = '700 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ff9b7a'; g.fillText('+', -GRID * 1.95, -GRID * 1.1);
    g.fillStyle = '#8fb6ff'; g.fillText('−', -GRID * 1.95, GRID * 0.75);
    g.restore();
    label(g, c, [c.name || 'ОУ'], GRID * 1.85);
  };

  /* ---------------------------- приборы ------------------------------ */

  /** Щитовой прибор: корпус, экран и две клеммы. */
  function panelMeter(g, c, letter, accent, value, unit, w, h) {
    var grd = grad(g, 'meterBody', 0, -h / 2, 0, h / 2, [
      [0, '#f2f4f6'], [0.14, '#d8dde2'], [0.72, '#aeb6bf'], [1, '#848d97']
    ]);
    shadowUnder(g, w, h);
    g.fillStyle = grd;
    roundRect(g, -w / 2, -h / 2, w, h, 4); g.fill();
    g.strokeStyle = 'rgba(70,85,100,.55)'; g.lineWidth = 1;
    roundRect(g, -w / 2, -h / 2, w, h, 4); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)';
    roundRect(g, -w / 2 + 2, -h / 2 + 2, w - 4, h * 0.16, 2); g.fill();
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.font = '700 9px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(55,70,85,.8)';
    g.fillText(letter, -w / 2 + 5, -h / 2 + 8);
    g.translate(0, 3);
    lcd(g, w - 9, GRID * 1.0, value, unit, accent);
    g.restore();
  }

  /** Винтовая клемма прибора. */
  function terminal(g, x, y, color) {
    g.fillStyle = grad(g, 'termRing', 0, -4, 0, 4, [
      [0, '#f6f9fb'], [0.5, '#c0c9d2'], [1, '#7d8792']
    ]);
    g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.fill();
    g.fillStyle = color || '#2a323c';
    g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill();
  }

  real.voltmeter = function (g, c) {
    var w = GRID * 2.9, h = GRID * 2.2;
    lead(g, -2 * GRID, 0, -w / 2 - 1, 0, 2.8);
    lead(g, w / 2 + 1, 0, 2 * GRID, 0, 2.8);
    panelMeter(g, c, 'V', '#7dffd0', U.fmtSI(c.reading || 0, 4), 'В', w, h);
    terminal(g, -w / 2 - 1, 0, '#c0392b');
    terminal(g, w / 2 + 1, 0, '#1c1f24');
    label(g, c, [c.name || ''], GRID * 1.9);
  };

  real.ammeter = function (g, c) {
    var w = GRID * 2.9, h = GRID * 2.2;
    lead(g, -2 * GRID, 0, -w / 2 - 1, 0, 2.8);
    lead(g, w / 2 + 1, 0, 2 * GRID, 0, 2.8);
    panelMeter(g, c, 'A', '#ffd479', U.fmtSI(c.reading || 0, 4), 'А', w, h);
    terminal(g, -w / 2 - 1, 0, '#c0392b');
    terminal(g, w / 2 + 1, 0, '#1c1f24');
    label(g, c, [c.name || ''], GRID * 1.9);
  };

  real.wattmeter = function (g, c) {
    var w = GRID * 3.6, h = GRID * 2.8;
    lead(g, -3 * GRID, -GRID, -w / 2 - 1, -GRID * 0.7, 2.8);
    lead(g, 3 * GRID, -GRID, w / 2 + 1, -GRID * 0.7, 2.8);
    lead(g, -3 * GRID, 2 * GRID, -w / 2 - 1, GRID * 0.7, 2.8);
    lead(g, 3 * GRID, 2 * GRID, w / 2 + 1, GRID * 0.7, 2.8);
    panelMeter(g, c, 'W', '#9fd0ff', U.fmtSI(c.avg || 0, 4), 'Вт', w, h);
    terminal(g, -w / 2 - 1, -GRID * 0.7, '#c0392b');
    terminal(g, w / 2 + 1, -GRID * 0.7, '#1c1f24');
    terminal(g, -w / 2 - 1, GRID * 0.7, '#2471a3');
    terminal(g, w / 2 + 1, GRID * 0.7, '#1c1f24');
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.font = '600 6px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(55,70,85,.75)';
    g.fillText('I', -w / 2 + 7, -GRID * 0.7 - 7);
    g.fillText('U', -w / 2 + 7, GRID * 0.7 + 7);
    g.restore();
    label(g, c, [c.name || ''], GRID * 2.4);
  };

  real.probe = function (g, c) {
    // щуп с крючком-зацепом
    var col = c.color || '#3aa17d';
    lead(g, 0, 2 * GRID, 0, GRID * 0.85, 2.4);
    g.strokeStyle = col; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.arc(0, GRID * 0.95, 4, Math.PI * 0.15, Math.PI * 1.5); g.stroke();
    shadowUnder(g, GRID * 3, GRID * 1.4);
    g.fillStyle = grad(g, 'probeBody', 0, -GRID * 1.1, 0, GRID * 0.5, [
      [0, '#f4f7fa'], [0.16, '#dfe5ea'], [0.75, '#b2bac3'], [1, '#89929b']
    ]);
    roundRect(g, -GRID * 1.5, -GRID * 1.1, GRID * 3, GRID * 1.6, 4); g.fill();
    g.strokeStyle = 'rgba(70,85,100,.5)'; g.lineWidth = 1;
    roundRect(g, -GRID * 1.5, -GRID * 1.1, GRID * 3, GRID * 1.6, 4); g.stroke();
    g.fillStyle = col;
    roundRect(g, -GRID * 1.5, GRID * 0.24, GRID * 3, GRID * 0.26, 2); g.fill();
    g.save();
    g.rotate(-(c.rot || 0) * Math.PI / 2);
    g.translate(0, -GRID * 0.36);
    lcd(g, GRID * 2.6, GRID * 0.92, U.fmtSI(c.v || 0, 3) + 'В', null, '#7dffd0');
    g.restore();
  };

  real.junction = function (g) {
    // капля припоя
    g.fillStyle = 'rgba(12,32,24,.25)';
    g.beginPath(); g.arc(1, 1.5, 4.2, 0, 7); g.fill();
    g.fillStyle = grad(g, 'solder', 0, -4, 0, 4, [
      [0, '#f2f6fa'], [0.4, '#c3ccd5'], [1, '#7f8a95']
    ]);
    g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath(); g.arc(-1.2, -1.2, 1.3, 0, 7); g.fill();
  };
})(window);
