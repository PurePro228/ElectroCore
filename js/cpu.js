/* ElectroCore — восьмибитный процессор EC-8.
 *
 * Аккумуляторная архитектура: все действия идут через регистр A, второй
 * операнд берётся из регистра B или прямо из команды. Память одна на 256
 * байт: программа с нуля, данные и стек — где укажет программист.
 * Команды хранятся настоящими байтами, ассемблер и дизассемблер работают
 * по одной и той же таблице.
 */
(function (global) {
  'use strict';
  var EC = (global.EC = global.EC || {});

  /* ------------------------------------------------------------------ */
  /*  Система команд                                                     */
  /* ------------------------------------------------------------------ */

  var ISA = [
    { op: 0x00, m: 'NOP', arg: 0, t: 'ничего не делает' },
    { op: 0x01, m: 'LDI', arg: 'n', t: 'A = число' },
    { op: 0x02, m: 'LD', arg: 'a', t: 'A = память[адрес]' },
    { op: 0x03, m: 'ST', arg: 'a', t: 'память[адрес] = A' },
    { op: 0x04, m: 'TAB', arg: 0, t: 'B = A' },
    { op: 0x05, m: 'TBA', arg: 0, t: 'A = B' },
    { op: 0x06, m: 'ADD', arg: 0, t: 'A = A + B' },
    { op: 0x07, m: 'SUB', arg: 0, t: 'A = A − B' },
    { op: 0x08, m: 'AND', arg: 0, t: 'A = A и B (побитно)' },
    { op: 0x09, m: 'OR', arg: 0, t: 'A = A или B (побитно)' },
    { op: 0x0A, m: 'XOR', arg: 0, t: 'A = A исключающее или B' },
    { op: 0x0B, m: 'INC', arg: 0, t: 'A = A + 1' },
    { op: 0x0C, m: 'DEC', arg: 0, t: 'A = A − 1' },
    { op: 0x0D, m: 'SHL', arg: 0, t: 'сдвиг A влево, старший бит → C' },
    { op: 0x0E, m: 'SHR', arg: 0, t: 'сдвиг A вправо, младший бит → C' },
    { op: 0x0F, m: 'NOT', arg: 0, t: 'инверсия всех битов A' },
    { op: 0x10, m: 'ADDI', arg: 'n', t: 'A = A + число' },
    { op: 0x11, m: 'SUBI', arg: 'n', t: 'A = A − число' },
    { op: 0x12, m: 'ANDI', arg: 'n', t: 'A = A и число' },
    { op: 0x13, m: 'ORI', arg: 'n', t: 'A = A или число' },
    { op: 0x14, m: 'CMPI', arg: 'n', t: 'сравнить A с числом (меняет флаги)' },
    { op: 0x20, m: 'JMP', arg: 'a', t: 'перейти по адресу' },
    { op: 0x21, m: 'JZ', arg: 'a', t: 'перейти, если результат нулевой' },
    { op: 0x22, m: 'JNZ', arg: 'a', t: 'перейти, если результат не нулевой' },
    { op: 0x23, m: 'JC', arg: 'a', t: 'перейти, если был перенос' },
    { op: 0x24, m: 'JNC', arg: 'a', t: 'перейти, если переноса не было' },
    { op: 0x25, m: 'CALL', arg: 'a', t: 'вызвать подпрограмму' },
    { op: 0x26, m: 'RET', arg: 0, t: 'вернуться из подпрограммы' },
    { op: 0x30, m: 'OUT', arg: 0, t: 'выдать A на выводы' },
    { op: 0x31, m: 'IN', arg: 0, t: 'считать выводы в A' },
    { op: 0x32, m: 'DIR', arg: 0, t: 'настроить направление выводов по A' },
    { op: 0xFF, m: 'HLT', arg: 0, t: 'остановить процессор' }
  ];

  var BY_MNEMONIC = {}, BY_OP = {};
  ISA.forEach(function (d) { BY_MNEMONIC[d.m] = d; BY_OP[d.op] = d; });

  var MEM_SIZE = 256;
  var PORT_BITS = 4;                           // наружу выведено четыре линии
  var PORT_MASK = (1 << PORT_BITS) - 1;

  /* ------------------------------------------------------------------ */
  /*  Ассемблер                                                          */
  /* ------------------------------------------------------------------ */

  /** Разбирает число: 255, 0xFF, $FF, 0b1010, 'A'. */
  function parseNumber(tok) {
    if (/^0[xX][0-9a-fA-F]+$/.test(tok)) return parseInt(tok.slice(2), 16);
    if (/^\$[0-9a-fA-F]+$/.test(tok)) return parseInt(tok.slice(1), 16);
    if (/^0[bB][01]+$/.test(tok)) return parseInt(tok.slice(2), 2);
    if (/^%[01]+$/.test(tok)) return parseInt(tok.slice(1), 2);
    if (/^-?\d+$/.test(tok)) return parseInt(tok, 10);
    return null;
  }

  /**
   * Собирает текст программы в машинный код.
   * Возвращает { ok, code, lines, errors }, где lines[i] — адрес строки i.
   */
  function assemble(text) {
    var src = String(text || '').split(/\r?\n/);
    var labels = {}, errors = [];
    var items = [];                            // разобранные строки
    var addr = 0, i;

    function fail(line, msg) { errors.push({ line: line + 1, msg: msg }); }

    // первый проход: метки и размеры
    for (i = 0; i < src.length; i++) {
      var raw = src[i].replace(/[;#].*$/, '').trim();
      if (!raw) { items.push(null); continue; }
      var label = null;
      // буквы ё и Ё стоят в Unicode вне диапазона а-я, поэтому указаны отдельно
      var m = /^([A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*)\s*:\s*(.*)$/.exec(raw);
      if (m) { label = m[1]; raw = m[2].trim(); }
      if (label) {
        if (labels[label] !== undefined) fail(i, 'метка «' + label + '» уже объявлена');
        labels[label] = addr;
      }
      if (!raw) { items.push(null); continue; }

      var parts = raw.split(/[\s,]+/);
      var mn = parts[0].toUpperCase();
      var item = { line: i, mn: mn, arg: parts[1], addr: addr };
      if (mn === 'DB') {
        item.bytes = parts.slice(1).filter(function (p) { return p.length; });
        if (!item.bytes.length) fail(i, 'DB без значений');
        addr += item.bytes.length;
      } else {
        var def = BY_MNEMONIC[mn];
        if (!def) { fail(i, 'неизвестная команда «' + parts[0] + '»'); items.push(null); continue; }
        item.def = def;
        if (def.arg && parts[1] === undefined) fail(i, mn + ' требует операнд');
        if (!def.arg && parts[1] !== undefined) fail(i, mn + ' не принимает операнд');
        addr += def.arg ? 2 : 1;
      }
      if (addr > MEM_SIZE) { fail(i, 'программа не помещается в 256 байт'); break; }
      items.push(item);
    }

    // второй проход: байты
    var code = new Uint8Array(MEM_SIZE);
    var lines = [];
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) { lines.push(null); continue; }
      lines.push(it.addr);
      if (it.mn === 'DB') {
        for (var k = 0; k < it.bytes.length; k++) {
          var v = resolve(it.bytes[k], it.line);
          code[it.addr + k] = v & 0xFF;
        }
        continue;
      }
      code[it.addr] = it.def.op;
      if (it.def.arg) code[it.addr + 1] = resolve(it.arg, it.line) & 0xFF;
    }

    function resolve(tok, line) {
      if (tok === undefined) return 0;
      var n = parseNumber(tok);
      if (n !== null) return n;
      if (labels[tok] !== undefined) return labels[tok];
      fail(line, 'непонятный операнд «' + tok + '»');
      return 0;
    }

    return {
      ok: errors.length === 0,
      code: code,
      size: addr,
      lines: lines,
      labels: labels,
      errors: errors
    };
  }

  /** Обратный разбор: байты по адресу → текст команды. */
  function disassemble(mem, at) {
    var def = BY_OP[mem[at & 0xFF]];
    if (!def) return { text: 'DB 0x' + hex(mem[at & 0xFF]), size: 1 };
    if (!def.arg) return { text: def.m, size: 1 };
    return { text: def.m + ' 0x' + hex(mem[(at + 1) & 0xFF]), size: 2 };
  }

  function hex(v) { return ('0' + (v & 0xFF).toString(16).toUpperCase()).slice(-2); }

  /* ------------------------------------------------------------------ */
  /*  Исполнитель                                                        */
  /* ------------------------------------------------------------------ */

  function create() {
    var m = {
      mem: new Uint8Array(MEM_SIZE),
      a: 0, b: 0, pc: 0, sp: 0xFF,
      z: false, c: false,
      halted: false,
      port: 0, ddr: 0, pins: 0,               // выход, направление, состояние входов
      cycles: 0
    };
    return m;
  }

  /** Загружает программу и сбрасывает процессор. */
  function load(m, code) {
    m.mem.set(code.subarray(0, MEM_SIZE));
    reset(m);
  }

  function reset(m) {
    m.a = 0; m.b = 0; m.pc = 0; m.sp = 0xFF;
    m.z = false; m.c = false;
    m.halted = false;
    m.port = 0; m.ddr = 0;
    m.cycles = 0;
  }

  function setZ(m, v) { m.z = (v & 0xFF) === 0; return v & 0xFF; }

  /** Выполняет одну команду. */
  function step(m) {
    if (m.halted) return;
    var op = m.mem[m.pc];
    var arg = m.mem[(m.pc + 1) & 0xFF];
    var def = BY_OP[op];
    var size = def ? (def.arg ? 2 : 1) : 1;
    var next = (m.pc + size) & 0xFF;
    var r;

    switch (op) {
      case 0x00: break;
      case 0x01: m.a = arg; setZ(m, m.a); break;
      case 0x02: m.a = m.mem[arg]; setZ(m, m.a); break;
      case 0x03: m.mem[arg] = m.a; break;
      case 0x04: m.b = m.a; break;
      case 0x05: m.a = m.b; setZ(m, m.a); break;
      case 0x06: r = m.a + m.b; m.c = r > 0xFF; m.a = setZ(m, r); break;
      case 0x07: r = m.a - m.b; m.c = r < 0; m.a = setZ(m, r); break;
      case 0x08: m.a = setZ(m, m.a & m.b); m.c = false; break;
      case 0x09: m.a = setZ(m, m.a | m.b); m.c = false; break;
      case 0x0A: m.a = setZ(m, m.a ^ m.b); m.c = false; break;
      case 0x0B: r = m.a + 1; m.c = r > 0xFF; m.a = setZ(m, r); break;
      case 0x0C: r = m.a - 1; m.c = r < 0; m.a = setZ(m, r); break;
      case 0x0D: m.c = (m.a & 0x80) !== 0; m.a = setZ(m, m.a << 1); break;
      case 0x0E: m.c = (m.a & 0x01) !== 0; m.a = setZ(m, m.a >> 1); break;
      case 0x0F: m.a = setZ(m, ~m.a); break;
      case 0x10: r = m.a + arg; m.c = r > 0xFF; m.a = setZ(m, r); break;
      case 0x11: r = m.a - arg; m.c = r < 0; m.a = setZ(m, r); break;
      case 0x12: m.a = setZ(m, m.a & arg); m.c = false; break;
      case 0x13: m.a = setZ(m, m.a | arg); m.c = false; break;
      case 0x14: r = m.a - arg; m.c = r < 0; setZ(m, r); break;
      case 0x20: next = arg; break;
      case 0x21: if (m.z) next = arg; break;
      case 0x22: if (!m.z) next = arg; break;
      case 0x23: if (m.c) next = arg; break;
      case 0x24: if (!m.c) next = arg; break;
      case 0x25:
        m.mem[m.sp] = next;
        m.sp = (m.sp - 1) & 0xFF;
        next = arg;
        break;
      case 0x26:
        m.sp = (m.sp + 1) & 0xFF;
        next = m.mem[m.sp];
        break;
      case 0x30: m.port = m.a & PORT_MASK; break;
      case 0x31: m.a = m.pins & PORT_MASK; setZ(m, m.a); break;
      case 0x32: m.ddr = m.a & PORT_MASK; break;
      case 0xFF: m.halted = true; return;
      default: break;                          // неизвестный байт пропускается
    }
    m.pc = next;
    m.cycles++;
  }

  /* ------------------------------------------------------------------ */
  /*  Процессор с внешней шиной                                          */
  /* ------------------------------------------------------------------ */

  /*
   * У этой машины памяти внутри нет. Каждый байт она читает и пишет
   * через шину: выставляет адрес, опускает /RD или /WR и ждёт такта.
   * Команда занимает столько тактов, сколько обращений ей нужно:
   *   без операнда            — 1 такт  (выборка кода)
   *   с операндом             — 2 такта (код, операнд)
   *   LD и ST                 — 3 такта (код, операнд, обмен с памятью)
   * Возвраты из подпрограмм хранит аппаратный стек на восемь уровней,
   * как у однокристальных машин, поэтому CALL работает и без ОЗУ.
   */

  var PH_CODE = 0, PH_ARG = 1, PH_READ = 2, PH_WRITE = 3;
  var STACK_DEPTH = 8;

  function createBus() {
    var m = {
      a: 0, b: 0, pc: 0,
      z: false, c: false,
      halted: false,
      phase: PH_CODE, op: 0, arg: 0,
      stack: new Uint8Array(STACK_DEPTH), sp: 0,
      port: 0, ddr: 0, pins: 0,
      cycles: 0,
      addr: 0, rd: true, wr: true,       // управление активно низким уровнем
      dataOut: 0, driveData: false,
      fetch: true                        // идёт выборка кода команды
    };
    busUpdate(m);
    return m;
  }

  function resetBus(m) {
    m.a = 0; m.b = 0; m.pc = 0;
    m.z = false; m.c = false;
    m.halted = false;
    m.phase = PH_CODE; m.op = 0; m.arg = 0;
    m.sp = 0;
    m.port = 0; m.ddr = 0;
    m.cycles = 0;
    busUpdate(m);
  }

  /** Что процессор держит на шине в течение текущего такта. */
  function busUpdate(m) {
    m.fetch = !m.halted && m.phase === PH_CODE;
    if (m.halted) {
      m.rd = true; m.wr = true; m.driveData = false;
      return;
    }
    m.driveData = false;
    m.wr = true;
    m.rd = false;
    if (m.phase === PH_CODE || m.phase === PH_ARG) m.addr = m.pc;
    else if (m.phase === PH_READ) m.addr = m.arg;
    else {                                  // запись
      m.addr = m.arg;
      m.rd = true; m.wr = false;
      m.driveData = true; m.dataOut = m.a;
    }
  }

  /** Один такт: процессор забирает то, что на шине, и делает следующий шаг. */
  function busTick(m, dataIn) {
    if (m.halted) return;
    var def;
    switch (m.phase) {
      case PH_CODE:
        m.op = dataIn & 0xFF;
        m.pc = (m.pc + 1) & 0xFF;
        def = BY_OP[m.op];
        if (def && def.arg) m.phase = PH_ARG;
        else { execBus(m, m.op, 0); m.phase = PH_CODE; }
        break;
      case PH_ARG:
        m.arg = dataIn & 0xFF;
        m.pc = (m.pc + 1) & 0xFF;
        if (m.op === 0x02) m.phase = PH_READ;        // LD
        else if (m.op === 0x03) m.phase = PH_WRITE;  // ST
        else { execBus(m, m.op, m.arg); m.phase = PH_CODE; }
        break;
      case PH_READ:
        m.a = dataIn & 0xFF;
        m.z = m.a === 0;
        m.phase = PH_CODE;
        break;
      case PH_WRITE:
        m.phase = PH_CODE;
        break;
    }
    m.cycles++;
    busUpdate(m);
  }

  /** Команды, не требующие обращения к памяти. */
  function execBus(m, op, arg) {
    var r;
    switch (op) {
      case 0x00: break;
      case 0x01: m.a = arg; setZ(m, m.a); break;
      case 0x04: m.b = m.a; break;
      case 0x05: m.a = m.b; setZ(m, m.a); break;
      case 0x06: r = m.a + m.b; m.c = r > 0xFF; m.a = setZ(m, r); break;
      case 0x07: r = m.a - m.b; m.c = r < 0; m.a = setZ(m, r); break;
      case 0x08: m.a = setZ(m, m.a & m.b); m.c = false; break;
      case 0x09: m.a = setZ(m, m.a | m.b); m.c = false; break;
      case 0x0A: m.a = setZ(m, m.a ^ m.b); m.c = false; break;
      case 0x0B: r = m.a + 1; m.c = r > 0xFF; m.a = setZ(m, r); break;
      case 0x0C: r = m.a - 1; m.c = r < 0; m.a = setZ(m, r); break;
      case 0x0D: m.c = (m.a & 0x80) !== 0; m.a = setZ(m, m.a << 1); break;
      case 0x0E: m.c = (m.a & 0x01) !== 0; m.a = setZ(m, m.a >> 1); break;
      case 0x0F: m.a = setZ(m, ~m.a); break;
      case 0x10: r = m.a + arg; m.c = r > 0xFF; m.a = setZ(m, r); break;
      case 0x11: r = m.a - arg; m.c = r < 0; m.a = setZ(m, r); break;
      case 0x12: m.a = setZ(m, m.a & arg); m.c = false; break;
      case 0x13: m.a = setZ(m, m.a | arg); m.c = false; break;
      case 0x14: r = m.a - arg; m.c = r < 0; setZ(m, r); break;
      case 0x20: m.pc = arg; break;
      case 0x21: if (m.z) m.pc = arg; break;
      case 0x22: if (!m.z) m.pc = arg; break;
      case 0x23: if (m.c) m.pc = arg; break;
      case 0x24: if (!m.c) m.pc = arg; break;
      case 0x25:
        if (m.sp < STACK_DEPTH) m.stack[m.sp++] = m.pc;   // переполнение стека теряет адрес
        m.pc = arg;
        break;
      case 0x26:
        if (m.sp > 0) m.pc = m.stack[--m.sp];
        break;
      case 0x30: m.port = m.a & PORT_MASK; break;
      case 0x31: m.a = m.pins & PORT_MASK; setZ(m, m.a); break;
      case 0x32: m.ddr = m.a & PORT_MASK; break;
      case 0xFF: m.halted = true; break;
      default: break;
    }
  }

  /** Сколько тактов занимает команда с этим кодом. */
  function cyclesOf(op) {
    var def = BY_OP[op];
    if (!def) return 1;
    if (op === 0x02 || op === 0x03) return 3;
    return def.arg ? 2 : 1;
  }

  EC.cpu = {
    ISA: ISA,
    STACK_DEPTH: STACK_DEPTH,
    createBus: createBus,
    resetBus: resetBus,
    busTick: busTick,
    busUpdate: busUpdate,
    cyclesOf: cyclesOf,
    MEM_SIZE: MEM_SIZE,
    PORT_BITS: PORT_BITS,
    PORT_MASK: PORT_MASK,
    assemble: assemble,
    disassemble: disassemble,
    hex: hex,
    create: create,
    load: load,
    reset: reset,
    step: step
  };
})(window);
