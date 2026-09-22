/* ElectroCore — вспомогательные функции: формат величин, математика, DOM. */
(function (global) {
  'use strict';
  var EC = (global.EC = global.EC || {});

  /* ---------------- форматирование величин ---------------- */

  var PREFIXES = [
    { e: 12, s: 'Т' }, { e: 9, s: 'Г' }, { e: 6, s: 'М' }, { e: 3, s: 'к' },
    { e: 0, s: '' }, { e: -3, s: 'м' }, { e: -6, s: 'мк' }, { e: -9, s: 'н' },
    { e: -12, s: 'п' }, { e: -15, s: 'ф' }
  ];

  /** Число -> строка с приставкой СИ, например 4700 -> "4.7к". */
  function fmtSI(value, digits) {
    if (value === null || value === undefined || !isFinite(value)) return '—';
    if (digits === undefined) digits = 3;
    var sign = value < 0 ? '-' : '';
    var v = Math.abs(value);
    if (v === 0) return '0';
    if (v < 1e-15) return '0';                 // ниже фемто показывать нечего
    var p = PREFIXES[PREFIXES.length - 1], pi = PREFIXES.length - 1;
    for (var i = 0; i < PREFIXES.length; i++) {
      if (v >= Math.pow(10, PREFIXES[i].e)) { p = PREFIXES[i]; pi = i; break; }
    }
    var table = EC.SI_PREFIX && EC.SI_PREFIX[EC.lang];
    var suffix = table ? table[pi] : p.s;
    var scaled = v / Math.pow(10, p.e);
    var out;
    if (scaled >= 100) out = scaled.toFixed(Math.max(0, digits - 3));
    else if (scaled >= 10) out = scaled.toFixed(Math.max(0, digits - 2));
    else out = scaled.toFixed(Math.max(0, digits - 1));
    if (out.indexOf('.') >= 0) out = out.replace(/\.?0+$/, '');
    return sign + out + suffix;
  }

  /** Значение с единицей измерения: fmtUnit(0.0047,'Ф') -> "4.7мФ". */
  function fmtUnit(value, unit, digits) {
    return fmtSI(value, digits) + (EC.t ? EC.t(unit || '') : (unit || ''));
  }

  var PARSE_MAP = {
    'т': 1e12, 't': 1e12, 'T': 1e12,
    'г': 1e9, 'G': 1e9, 'g': 1e9,
    'М': 1e6, 'M': 1e6, 'meg': 1e6, 'мег': 1e6,
    'к': 1e3, 'k': 1e3, 'K': 1e3, 'К': 1e3,
    'м': 1e-3, 'm': 1e-3,
    'мк': 1e-6, 'u': 1e-6, 'µ': 1e-6, 'μ': 1e-6, 'U': 1e-6,
    'н': 1e-9, 'n': 1e-9, 'N': 1e-9,
    'п': 1e-12, 'p': 1e-12, 'P': 1e-12,
    'ф': 1e-15, 'f': 1e-15
  };

  /** Строка -> число. Понимает "4.7k", "10мк", "1M", "2.2н". */
  function parseValue(str, fallback) {
    if (typeof str === 'number') return str;
    if (!str) return fallback;
    var s = String(str).trim().replace(',', '.').replace(/\s+/g, '');
    var m = /^([+-]?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)(.*)$/.exec(s);
    if (!m) return fallback;
    var num = parseFloat(m[1]);
    if (!isFinite(num)) return fallback;
    var rest = m[2] || '';
    // отбрасываем обозначение единицы в конце (Ом, Ф, Гн, В, А, Гц…)
    var suffix = rest.replace(/(Ом|ом|Ohm|ohm|Ф|ф$|Гн|гн|Гц|гц|Hz|hz|В|A|А|Вт|W|s|с)$/, '');
    if (suffix.length > 1 && PARSE_MAP[suffix] === undefined) suffix = suffix.charAt(0);
    var mult = PARSE_MAP[suffix];
    if (mult === undefined) mult = 1;
    return num * mult;
  }

  /* ---------------- математика ---------------- */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  /** Расстояние от точки до отрезка. */
  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.sqrt(dist2(px, py, ax, ay));
    var t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
    return Math.sqrt(dist2(px, py, ax + t * dx, ay + t * dy));
  }

  /* ---------------- прочее ---------------- */

  var idCounter = 1;
  function uid(prefix) { return (prefix || 'id') + (idCounter++) + '_' + Math.floor(Math.random() * 1e6).toString(36); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i]) node.appendChild(children[i]);
      }
    }
    return node;
  }

  function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

  /** Цвет для напряжения: синий (отрицательное) → серый (0) → красный (положительное). */
  function voltageColor(v, scale) {
    var t = clamp(v / (scale || 12), -1, 1);
    if (t >= 0) {
      return 'rgb(' + Math.round(120 + 135 * t) + ',' + Math.round(130 - 60 * t) + ',' + Math.round(140 - 90 * t) + ')';
    }
    return 'rgb(' + Math.round(120 + 15 * t) + ',' + Math.round(130 + 30 * t) + ',' + Math.round(140 + 115 * (-t)) + ')';
  }

  EC.util = {
    fmtSI: fmtSI, fmtUnit: fmtUnit, parseValue: parseValue,
    clamp: clamp, lerp: lerp, dist2: dist2, distToSegment: distToSegment,
    uid: uid, el: el, deepCopy: deepCopy, voltageColor: voltageColor
  };
})(window);
