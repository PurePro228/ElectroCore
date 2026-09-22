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
   * LU-разложение матрицы на месте с частичным выбором главного элемента.
   * Множители L хранятся ниже диагонали, perm — перестановка строк.
   * Возвращает false, если матрица вырождена.
   */
  function luFactor(LU, n, perm) {
    var i, j, k;
    for (i = 0; i < n; i++) perm[i] = i;
    for (k = 0; k < n; k++) {
      var maxAbs = 0, maxRow = -1;
      for (i = k; i < n; i++) {
        var a = Math.abs(LU[i][k]);
        if (a > maxAbs) { maxAbs = a; maxRow = i; }
      }
      if (maxRow < 0 || maxAbs < 1e-20) return false;
      if (maxRow !== k) {
        var row = LU[k]; LU[k] = LU[maxRow]; LU[maxRow] = row;
        var t = perm[k]; perm[k] = perm[maxRow]; perm[maxRow] = t;
      }
      var piv = LU[k], pv = piv[k];
      for (i = k + 1; i < n; i++) {
        var ri = LU[i];
        var f = ri[k] / pv;
        ri[k] = f;
        if (f === 0) continue;
        for (j = k + 1; j < n; j++) ri[j] -= f * piv[j];
      }
    }
    return true;
  }

  /** Прямая и обратная подстановка по готовому LU-разложению. */
  function luApply(LU, perm, b, x, n) {
    var i, j, sum;
    for (i = 0; i < n; i++) x[i] = b[perm[i]];
    for (i = 1; i < n; i++) {
      sum = x[i];
      var ri = LU[i];
      for (j = 0; j < i; j++) sum -= ri[j] * x[j];
      x[i] = sum;
    }
    for (i = n - 1; i >= 0; i--) {
      sum = x[i];
      var rr = LU[i];
      for (j = i + 1; j < n; j++) sum -= rr[j] * x[j];
      x[i] = sum / rr[i];
      if (!isFinite(x[i])) return false;
    }
    return true;
  }

  /** Решает A*x = b; A и b портятся. Результат остаётся в b. */
  function luSolve(A, b, n) {
    var perm = new Int32Array(n);
    if (!luFactor(A, n, perm)) return false;
    var x = new Float64Array(n);
    if (!luApply(A, perm, b, x, n)) return false;
    for (var i = 0; i < n; i++) b[i] = x[i];
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Сборщик системы МУП                                                */
  /* ------------------------------------------------------------------ */

  function MnaBuilder(size) {
    this.n = size;
    this.A = new Array(size);
    for (var i = 0; i < size; i++) this.A[i] = new Float64Array(size);
    this.LU = new Array(size);
    this.cachedA = new Array(size);
    for (i = 0; i < size; i++) {
      this.LU[i] = new Float64Array(size);
      this.cachedA[i] = new Float64Array(size);
    }
    this.perm = new Int32Array(size);
    this.factored = false;
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

  /**
   * Решает систему. Если матрица не изменилась с прошлого раза
   * (линейная схема, установившийся шаг), разложение переиспользуется —
   * вместо O(n³) остаётся только подстановка O(n²).
   */
  MnaBuilder.prototype.solve = function () {
    var n = this.n, i, j;
    var reuse = this.factored;
    if (reuse) {
      for (i = 0; i < n && reuse; i++) {
        var a = this.A[i], ca = this.cachedA[i];
        for (j = 0; j < n; j++) if (a[j] !== ca[j]) { reuse = false; break; }
      }
    }
    if (!reuse) {
      for (i = 0; i < n; i++) {
        this.LU[i].set(this.A[i]);
        this.cachedA[i].set(this.A[i]);
      }
      if (!luFactor(this.LU, n, this.perm)) { this.factored = false; return false; }
      this.factored = true;
    }
    if (!luApply(this.LU, this.perm, this.b, this.x, n)) { this.factored = false; return false; }
    for (i = 0; i < n; i++) if (!isFinite(this.x[i])) { this.factored = false; return false; }
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
    luFactor: luFactor,
    luApply: luApply,
    MnaBuilder: MnaBuilder,
    thermalVoltage: thermalVoltage,
    pnjlim: pnjlim,
    critVoltage: critVoltage,
    safeExp: safeExp,
    Q: Q, KB: KB, T_DEFAULT: T_DEFAULT
  };
})(window);
