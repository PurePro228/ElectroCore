/* Проверка физической достоверности движка ElectroCore.
 * Запуск:  node test/engine.test.js
 */
'use strict';
const path = require('path');
global.window = {};
['util', 'solver', 'components', 'circuit'].forEach(function (m) {
  require(path.join(__dirname, '..', 'js', m + '.js'));
});
const EC = global.window.EC;

let passed = 0, failed = 0;
function check(name, actual, expected, tol) {
  const ok = Math.abs(actual - expected) <= (tol === undefined ? Math.abs(expected) * 0.02 + 1e-9 : tol);
  if (ok) { passed++; console.log('  ✓ ' + name + '  = ' + actual.toPrecision(5)); }
  else { failed++; console.log('  ✗ ' + name + '  получено ' + actual.toPrecision(6) + ', ожидалось ' + Number(expected).toPrecision(6)); }
}
function test(name, fn) { console.log('\n' + name); fn(); }

/** Прогоняет схему до момента t с шагом dt. */
function run(ct, t, dt) {
  dt = dt || 1e-5;
  const n = Math.ceil(t / dt);
  for (let i = 0; i < n; i++) if (!ct.step(dt)) throw new Error(ct.error || 'сбой расчёта');
  return ct;
}

/* ------------------------------------------------------------------ */

test('Закон Ома: 9 В на резисторе 1 кОм', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 9; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 1000;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('ток через резистор', Math.abs(r.i), 9e-3);
  check('напряжение на резисторе', Math.abs(r.v), 9);
  check('мощность', Math.abs(r.p), 0.081);
  check('ток батареи', Math.abs(bat.i), 9e-3);
});

test('Последовательное и параллельное соединение', function () {
  // 12 В, R1=1k последовательно с параллельными R2=2k и R3=2k (=1k) -> I = 6 мА
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const r1 = ct.add('resistor', 6, 0); r1.props.R = 1000;
  const r2 = ct.add('resistor', 12, 0); r2.props.R = 2000;
  const r3 = ct.add('resistor', 12, 4); r3.props.R = 2000;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r1.id, 0);
  ct.connect(r1.id, 1, r2.id, 0);
  ct.connect(r1.id, 1, r3.id, 0);
  ct.connect(r2.id, 1, gnd.id, 0);
  ct.connect(r3.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('общий ток', Math.abs(r1.i), 6e-3);
  check('падение на R1', Math.abs(r1.v), 6);
  check('ток через R2', Math.abs(r2.i), 3e-3);
  check('первый закон Кирхгофа', Math.abs(r1.i) - Math.abs(r2.i) - Math.abs(r3.i), 0, 1e-9);
});

test('Зарядка конденсатора (RC-цепь)', function () {
  // R=10k, C=10мкФ -> tau = 0.1 c
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 10; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 10000;
  const cap = ct.add('capacitor', 12, 0); cap.props.C = 10e-6;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, cap.id, 0);
  ct.connect(cap.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 0.1, 1e-5);
  check('U(τ) = 63,2 % от 10 В', cap.v, 6.321, 0.03);
  run(ct, 0.4, 1e-5);
  check('U(5τ) ≈ 99,3 %', cap.v, 9.933, 0.03);
  check('энергия ½CU²', cap.energy, 0.5 * 10e-6 * cap.v * cap.v, 1e-9);
});

test('Колебательный контур LC', function () {
  // L=1мГн, C=1мкФ -> f = 1/(2π√LC) ≈ 5033 Гц
  const ct = new EC.Circuit();
  const L = ct.add('inductor', 0, 0); L.props.L = 1e-3; L.props.Rs = 1e-6;
  const cap = ct.add('capacitor', 6, 0); cap.props.C = 1e-6; cap.props.v0 = 5;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(L.id, 0, cap.id, 0);
  ct.connect(L.id, 1, gnd.id, 0);
  ct.connect(cap.id, 1, gnd.id, 0);
  ct.reset();                          // применяем начальное напряжение на C
  // ищем период по переходам через ноль
  const dt = 1e-7;
  let prev = cap.v, first = null, last = null, crossings = 0;
  for (let i = 0; i < 400000; i++) {
    ct.step(dt);
    if (prev > 0 && cap.v <= 0) {
      if (first === null) first = ct.time; else { last = ct.time; crossings++; }
    }
    prev = cap.v;
  }
  const period = (last - first) / crossings;
  check('резонансная частота', 1 / period, 1 / (2 * Math.PI * Math.sqrt(1e-3 * 1e-6)), 60);
  check('амплитуда сохраняется', Math.abs(cap.v) <= 5.05 ? 1 : 0, 1, 0);
});

test('Диод: прямое падение и выпрямление', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 5; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 1000;
  const d = ct.add('diode', 12, 0);
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, d.id, 0);
  ct.connect(d.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  const vd = d.v;
  check('прямое падение 0,6…0,9 В', vd > 0.6 && vd < 0.95 ? 1 : 0, 1, 0);
  check('ток = (5 − Uд)/R', d.i, (5 - vd) / 1000, 2e-5);
  // обратное включение
  bat.props.V = -5;
  ct.reset(); run(ct, 1e-3);
  check('обратный ток пренебрежимо мал', Math.abs(d.i) < 1e-8 ? 1 : 0, 1, 0);
});

test('Светодиод с токоограничивающим резистором', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 5; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 150;
  const led = ct.add('led', 12, 0);
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, led.id, 0);
  ct.connect(led.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('падение на светодиоде ≈ 1,9 В', led.v, 1.9, 0.25);
  check('ток ≈ (5 − 1,9)/150', led.i, (5 - led.v) / 150, 1e-4);
  check('свечение есть', led.glow > 0.5 ? 1 : 0, 1, 0);
});

test('Стабилитрон 5,1 В', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 470;
  const z = ct.add('zener', 12, 0); z.props.Vz = 5.1;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, z.id, 1);       // катод к плюсу
  ct.connect(z.id, 0, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('напряжение стабилизации', -z.v, 5.1, 0.35);
});

test('Транзистор NPN: усиление по току', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 10; bat.props.Rint = 1e-6;
  const rb = ct.add('resistor', 6, 4); rb.props.R = 470000;   // Ib ≈ 20 мкА
  const rc = ct.add('resistor', 6, 0); rc.props.R = 1000;
  const q = ct.add('npn', 12, 0); q.props.Bf = 100;
  const gnd = ct.add('ground', 0, 8);
  ct.connect(bat.id, 0, rb.id, 0);
  ct.connect(bat.id, 0, rc.id, 0);
  ct.connect(rb.id, 1, q.id, 0);
  ct.connect(rc.id, 1, q.id, 1);
  ct.connect(q.id, 2, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('ток базы ≈ (10 − 0,7)/470k', q.ib, 19.8e-6, 2e-6);
  check('β = Iк/Iб ≈ 100', q.ic / q.ib, 100, 12);
  check('Iэ = −(Iк + Iб)', q.ie + q.ic + q.ib, 0, 1e-12);
  check('режим активный', q.mode === 'активный' ? 1 : 0, 1, 0);
});

test('Транзистор в насыщении (ключ)', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 5; bat.props.Rint = 1e-6;
  const rb = ct.add('resistor', 6, 4); rb.props.R = 4700;
  const rc = ct.add('resistor', 6, 0); rc.props.R = 220;
  const q = ct.add('npn', 12, 0); q.props.Bf = 150;
  const gnd = ct.add('ground', 0, 8);
  ct.connect(bat.id, 0, rb.id, 0);
  ct.connect(bat.id, 0, rc.id, 0);
  ct.connect(rb.id, 1, q.id, 0);
  ct.connect(rc.id, 1, q.id, 1);
  ct.connect(q.id, 2, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('Uкэ нас. < 0,3 В', q.vce < 0.3 && q.vce > 0 ? 1 : 0, 1, 0);
  check('режим насыщения', q.mode === 'насыщение' ? 1 : 0, 1, 0);
});

test('Неинвертирующий усилитель на ОУ', function () {
  // Кu = 1 + Rf/Rg = 1 + 10k/10k = 2
  const ct = new EC.Circuit();
  const src = ct.add('vsource', 0, 0);
  src.props.wave = 'dc'; src.props.amp = 1; src.props.Rint = 1e-6;
  const op = ct.add('opamp', 10, 0);
  const rf = ct.add('resistor', 10, 8); rf.props.R = 10000;
  const rg = ct.add('resistor', 2, 8); rg.props.R = 10000;
  const gnd = ct.add('ground', 0, 12);
  ct.connect(src.id, 0, op.id, 0);
  ct.connect(src.id, 1, gnd.id, 0);
  ct.connect(op.id, 2, rf.id, 1);
  ct.connect(rf.id, 0, op.id, 1);
  ct.connect(op.id, 1, rg.id, 1);
  ct.connect(rg.id, 0, gnd.id, 0);
  run(ct, 1e-3);
  check('Uвых = 2·Uвх', op.vout, 2.0, 0.02);
  src.props.amp = 3;
  run(ct, 1e-3);
  check('Uвых = 6 В', op.vout, 6.0, 0.05);
  src.props.amp = 10;      // потребовалось бы 20 В — сработает ограничение
  run(ct, 1e-3);
  check('ограничение питанием +12 В', op.vout, 12, 0.3);
});

test('Переменный ток: действующее значение и мощность', function () {
  // 10 В амплитуды, 50 Гц на 100 Ом -> Iд = 7,071/100 = 70,7 мА, P = 0,5 Вт
  const ct = new EC.Circuit();
  const src = ct.add('vsource', 0, 0);
  src.props.wave = 'sine'; src.props.amp = 10; src.props.freq = 50; src.props.Rint = 1e-6;
  const r = ct.add('resistor', 6, 0); r.props.R = 100;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(src.id, 0, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(src.id, 1, gnd.id, 0);
  const dt = 1e-6;
  let sum = 0, sumP = 0, n = 0;
  for (let i = 0; i < 40000; i++) { ct.step(dt); sum += r.v * r.v; sumP += r.p; n++; }
  check('действующее напряжение', Math.sqrt(sum / n), 10 / Math.SQRT2, 0.05);
  check('средняя мощность U²д/R', sumP / n, 0.5, 0.005);
});

test('Ёмкостное сопротивление', function () {
  // Xc = 1/(2πfC); C=1мкФ, f=1000 Гц -> 159,2 Ом
  const ct = new EC.Circuit();
  const src = ct.add('vsource', 0, 0);
  src.props.wave = 'sine'; src.props.amp = 5; src.props.freq = 1000; src.props.Rint = 1e-6;
  const cap = ct.add('capacitor', 6, 0); cap.props.C = 1e-6;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(src.id, 0, cap.id, 0);
  ct.connect(cap.id, 1, gnd.id, 0);
  ct.connect(src.id, 1, gnd.id, 0);
  const dt = 1e-7;
  for (let i = 0; i < 100000; i++) ct.step(dt);    // переходный процесс
  let peak = 0;
  for (let i = 0; i < 50000; i++) { ct.step(dt); peak = Math.max(peak, Math.abs(cap.i)); }
  check('Xc = Uм/Iм', 5 / peak, 1 / (2 * Math.PI * 1000 * 1e-6), 3);
});

test('Приборы: вольтметр, амперметр, ваттметр', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 1e-6;
  const w = ct.add('wattmeter', 6, 0);
  const a = ct.add('ammeter', 12, 0);
  const r = ct.add('resistor', 18, 0); r.props.R = 100;
  const v = ct.add('voltmeter', 18, 6);
  const gnd = ct.add('ground', 0, 8);
  ct.connect(bat.id, 0, w.id, 0);
  ct.connect(w.id, 1, a.id, 0);
  ct.connect(a.id, 1, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(v.id, 0, r.id, 0);
  ct.connect(v.id, 1, gnd.id, 0);
  ct.connect(w.id, 2, r.id, 0);
  ct.connect(w.id, 3, gnd.id, 0);
  run(ct, 0.3, 1e-4);
  check('вольтметр показывает 12 В', v.reading, 12, 0.02);
  check('амперметр показывает 120 мА', a.reading, 0.12, 0.001);
  check('ваттметр показывает 1,44 Вт', w.avg, 1.44, 0.02);
});

test('Потенциометр как делитель', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 10; bat.props.Rint = 1e-6;
  const p = ct.add('pot', 6, 0); p.props.R = 10000; p.props.pos = 0.25;
  const gnd = ct.add('ground', 0, 6);
  const v = ct.add('voltmeter', 12, 6);
  ct.connect(bat.id, 0, p.id, 0);
  ct.connect(p.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  ct.connect(v.id, 0, p.id, 2);
  ct.connect(v.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('движок на 25 % → 7,5 В', v.reading, 7.5, 0.05);
  p.props.pos = 0.8;
  run(ct, 1e-3);
  check('движок на 80 % → 2 В', v.reading, 2.0, 0.05);
});

test('Выключатель и лампа', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 12; bat.props.Rint = 0.01;
  const sw = ct.add('switch', 6, 0);
  const lamp = ct.add('lamp', 12, 0); lamp.props.Vn = 12; lamp.props.Pn = 3;
  const gnd = ct.add('ground', 0, 6);
  ct.connect(bat.id, 0, sw.id, 0);
  ct.connect(sw.id, 1, lamp.id, 0);
  ct.connect(lamp.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 0.05, 1e-4);
  check('разомкнут — тока нет', Math.abs(lamp.i) < 1e-6 ? 1 : 0, 1, 0);
  sw.props.closed = true;
  run(ct, 2, 1e-4);
  check('мощность лампы ≈ 3 Вт', Math.abs(lamp.p), 3, 0.35);
  check('лампа светится', lamp.glow > 0.8 ? 1 : 0, 1, 0);
});

test('Ток в проводах (первый закон Кирхгофа)', function () {
  const ct = new EC.Circuit();
  const bat = ct.add('battery', 0, 0); bat.props.V = 6; bat.props.Rint = 1e-6;
  const r = ct.add('resistor', 8, 0); r.props.R = 200;
  const gnd = ct.add('ground', 0, 6);
  const w1 = ct.connect(bat.id, 0, r.id, 0);
  ct.connect(r.id, 1, gnd.id, 0);
  ct.connect(bat.id, 1, gnd.id, 0);
  run(ct, 1e-3);
  check('ток в проводе = ток нагрузки', Math.abs(w1.current), 0.03, 1e-5);
});

console.log('\n' + '─'.repeat(50));
console.log(failed === 0 ? `Все проверки пройдены: ${passed}` : `Пройдено ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
