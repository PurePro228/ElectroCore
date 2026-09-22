/* ElectroCore — численное ядро: модифицированный метод узловых потенциалов (МУП/MNA).
 *
 * Система уравнений:  A * x = b
 *   x = [ потенциалы узлов 1..n , токи ветвей источников напряжения ]
 *   Узел с индексом -1 — земля (опорный, не входит в систему).
 *
 * Нелинейные элементы (диоды, транзисторы, ОУ) линеаризуются методом
 * Ньютона–Рафсона: на каждой итерации в матрицу штампуется якобиан,
 * в правую часть — эквивалентный источник тока.
 */
(function (global) {
  'use strict';
  var EC = (global.EC = global.EC || {});

  /* ------------------------------------------------------------------ */
  /*  Линейная алгебра: LU-разложение с частичным выбором главного элемента */
  /* ------------------------------------------------------------------ */

  /**
   * Решает A*x = b на месте. A — массив Float64Array (строки), b — Float64Array.
   * Возвращает true при успехе, false если матрица вырождена.
   */
  function luSolve(A, b, n) {
    var i, j, k, row, pivRow;
    var perm = new Int32Array(n);
    for (i = 0; i < n; i++) perm[i] = i;

    for (k = 0; k < n; k++) {
      // выбор главного элемента
      var maxAbs = 0, maxRow = -1;
      for (i = k; i < n; i++) {
        var a = Math.abs(A[i][k]);
        if (a > maxAbs) { maxAbs = a; maxRow = i; }
      }
      if (maxRow < 0 || maxAbs < 1e-20) return false; // вырожденная матрица
      if (maxRow !== k) {
        row = A[k]; A[k] = A[maxRow]; A[maxRow] = row;
        var t = b[k]; b[k] = b[maxRow]; b[maxRow] = t;
      }
      pivRow = A[k];
      var piv = pivRow[k];
      for (i = k + 1; i < n; i++) {
        row = A[i];
        var f = row[k] / piv;
        if (f === 0) continue;
        row[k] = 0;
        for (j = k + 1; j < n; j++) row[j] -= f * pivRow[j];
        b[i] -= f * b[k];
      }
    }
    // обратный ход
    for (i = n - 1; i >= 0; i--) {
      var sum = b[i];
      row = A[i];
      for (j = i + 1; j < n; j++) sum -= row[j] * b[j];
      b[i] = sum / row[i];
      if (!isFinite(b[i])) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Сборщик системы МУП                                                */
  /* ------------------------------------------------------------------ */

  function MnaBuilder(size) {
    this.n = size;
    this.A = new Array(size);
    for (var i = 0; i < size; i++) this.A[i] = new Float64Array(size);
    this.b = new Float64Array(size);
    this.x = new Float64Array(size);
  }

  MnaBuilder.prototype.clear = function () {
    for (var i = 0; i < this.n; i++) {
      this.A[i].fill(0);
      this.b[i] = 0;
    }
  };

  /** Проводимость g между узлами a и b (любой может быть землёй = -1). */
  MnaBuilder.prototype.conductance = function (a, b, g) {
    if (!isFinite(g)) return;
    if (a >= 0) this.A[a][a] += g;
    if (b >= 0) this.A[b][b] += g;
    if (a >= 0 && b >= 0) { this.A[a][b] -= g; this.A[b][a] -= g; }
  };

  /** Источник тока: ток i течёт внутри элемента от узла a к узлу b. */
  MnaBuilder.prototype.current = function (a, b, i) {
    if (!isFinite(i)) return;
    if (a >= 0) this.b[a] -= i;
    if (b >= 0) this.b[b] += i;
  };

  /**
   * Идеальный источник напряжения: V(a) - V(b) = v.
   * br — индекс дополнительной переменной (тока ветви) в векторе неизвестных.
   * Ток ветви положителен, когда течёт внутри элемента от a к b.
   */
  MnaBuilder.prototype.voltageSource = function (a, b, br, v) {
    if (a >= 0) { this.A[a][br] += 1; this.A[br][a] += 1; }
    if (b >= 0) { this.A[b][br] -= 1; this.A[br][b] -= 1; }
    this.b[br] += v;
  };

  /** Прямая запись в строку ветви (для управляемых источников). */
  MnaBuilder.prototype.addA = function (r, c, v) {
    if (r >= 0 && c >= 0 && isFinite(v)) this.A[r][c] += v;
  };
  MnaBuilder.prototype.addB = function (r, v) {
    if (r >= 0 && isFinite(v)) this.b[r] += v;
  };

  /**
   * Обобщённый штамп нелинейного многополюсника.
   *   nodes — индексы узлов выводов,
   *   I[k]  — ток, втекающий в вывод k при текущих напряжениях,
   *   J[k][m] — d I[k] / d V[m] (якобиан),
   *   V[m]  — напряжения узлов, при которых посчитаны I и J.
   */
  MnaBuilder.prototype.nonlinear = function (nodes, I, J, V) {
    var k, m, cnt = nodes.length;
    for (k = 0; k < cnt; k++) {
      var nk = nodes[k];
      if (nk < 0) continue;
      var ieq = I[k];
      for (m = 0; m < cnt; m++) {
        var g = J[k][m];
        if (!g) continue;
        ieq -= g * V[m];
        if (nodes[m] >= 0) this.A[nk][nodes[m]] += g;
      }
      this.b[nk] -= ieq;
    }
  };

  MnaBuilder.prototype.solve = function () {
    var ok = luSolve(this.A, this.b, this.n);
    if (!ok) return false;
    for (var i = 0; i < this.n; i++) {
      this.x[i] = this.b[i];
      if (!isFinite(this.x[i])) return false;
    }
    return true;
  };

  /* ------------------------------------------------------------------ */
  /*  Физические константы и помощники для p-n переходов                 */
  /* ------------------------------------------------------------------ */

  var Q = 1.602176634e-19;    // заряд электрона, Кл
  var KB = 1.380649e-23;      // постоянная Больцмана, Дж/К
  var T_DEFAULT = 300.15;     // 27 °C

  /** Тепловой потенциал kT/q при заданной температуре (К). */
  function thermalVoltage(tempK) {
    return KB * (tempK || T_DEFAULT) / Q;
  }

  /**
   * Ограничение шага Ньютона на p-n переходе (алгоритм pnjlim из SPICE).
   * Предотвращает переполнение экспоненты и расходимость итераций.
   */
  function pnjlim(vnew, vold, vt, vcrit) {
    if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
      if (vold > 0) {
        var arg = 1 + (vnew - vold) / vt;
        if (arg > 0) vnew = vold + vt * Math.log(arg);
        else vnew = vcrit;
      } else {
        vnew = vt * Math.log(vnew / vt);
      }
    }
    return vnew;
  }

  /** Критическое напряжение перехода для pnjlim. */
  function critVoltage(is, vt) {
    return vt * Math.log(vt / (Math.SQRT2 * Math.max(is, 1e-20)));
  }

  /** Безопасная экспонента — не даёт переполниться при больших аргументах. */
  function safeExp(x) {
    if (x > 80) return Math.exp(80) * (1 + (x - 80)); // линейное продолжение
    return Math.exp(x);
  }

  EC.solver = {
    luSolve: luSolve,
    MnaBuilder: MnaBuilder,
    thermalVoltage: thermalVoltage,
    pnjlim: pnjlim,
    critVoltage: critVoltage,
    safeExp: safeExp,
    Q: Q, KB: KB, T_DEFAULT: T_DEFAULT
  };
})(window);
