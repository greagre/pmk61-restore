/* =========================================================
   mk-emulator / core.js
   Чистое ядро семейства (Б3-34 и родственные модели).

   Правила этого файла:
   - ничего не знает про DOM, CSS, звук и вёрстку;
   - состояние — обычные данные, годится для JSON;
   - наружу отдаёт только состояния и события через onEvent.

   Коды команд и правила переходов перенесены из проверенного
   ядра greagre/calculator/b3-34.js без изменения смысла.

   Угол (переключатель Р-ГРД-Г на корпусе):
     'deg'  — градусы (по умолчанию, как у оригинала при включении)
     'grad' — грады (полный оборот 400)
     'rad'  — радианы
   Угол меняет только тригонометрию (sin, cos, tg и обратные),
   на остальные команды не влияет и кнопкой «Сброс» не сбрасывается —
   это положение переключателя на корпусе, а не содержимое памяти.
   ========================================================= */
(function (global) {
  'use strict';

  var MAXDIG = 8;      /* значащих цифр мантиссы */
  var PROG_LEN = 98;   /* шагов программной памяти */
  var NOP = 0x54;      /* «К НОП» — пустой шаг */
  var REG_COUNT = 14;
  var REG_NAMES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd'];
  var CODE_CHARS = '0123456789-LCГE ';
  var ANGLES = ['deg', 'grad', 'rad'];

  var CMD_NAMES = {
    0x0A: '·', 0x0B: '/-/', 0x0C: 'ВП', 0x0D: 'Cx', 0x0E: 'В↑', 0x0F: 'Вx',
    0x10: '+', 0x11: '−', 0x12: '×', 0x13: '÷', 0x14: '↔',
    0x15: '10^x', 0x16: 'e^x', 0x17: 'lg', 0x18: 'ln',
    0x19: 'arcsin', 0x1A: 'arccos', 0x1B: 'arctg', 0x1C: 'sin', 0x1D: 'cos', 0x1E: 'tg',
    0x20: 'π', 0x21: '√', 0x22: 'x²', 0x23: '1/x', 0x24: 'x^y', 0x25: 'F◯',
    0x50: 'С/П', 0x51: 'БП', 0x52: 'В/О', 0x53: 'ПП', 0x54: 'К НОП',
    0x57: 'F x≠0', 0x58: 'F L2', 0x59: 'F x≥0', 0x5A: 'F L3',
    0x5B: 'F L1', 0x5C: 'F x<0', 0x5D: 'F L0', 0x5E: 'F x=0'
  };

  function codeStr(c) {
    c = c & 255;
    return CODE_CHARS[(c >> 4) & 15] + CODE_CHARS[c & 15];
  }

  function hex2(c) {
    var s = (c & 255).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  function cmdName(c) {
    if (c >= 0 && c <= 9) return String(c);
    if (CMD_NAMES[c]) return CMD_NAMES[c];
    if (c >= 0x40 && c <= 0x4D) return 'X→П ' + REG_NAMES[c & 15];
    if (c >= 0x60 && c <= 0x6D) return 'П→X ' + REG_NAMES[c & 15];
    if (c >= 0x70 && c <= 0x7D) return 'К x≠0 ' + REG_NAMES[c & 15];
    if (c >= 0x80 && c <= 0x8D) return 'К БП ' + REG_NAMES[c & 15];
    if (c >= 0x90 && c <= 0x9D) return 'К x≥0 ' + REG_NAMES[c & 15];
    if (c >= 0xA0 && c <= 0xAD) return 'К ПП ' + REG_NAMES[c & 15];
    if (c >= 0xB0 && c <= 0xBD) return 'К X→П ' + REG_NAMES[c & 15];
    if (c >= 0xC0 && c <= 0xCD) return 'К x<0 ' + REG_NAMES[c & 15];
    if (c >= 0xD0 && c <= 0xDD) return 'К П→X ' + REG_NAMES[c & 15];
    if (c >= 0xE0 && c <= 0xED) return 'К x=0 ' + REG_NAMES[c & 15];
    return '?';
  }

  /* Переходы занимают три ячейки: команда, десятки адреса, единицы адреса. */
  function isJumpCmd(c) {
    return c === 0x51 || c === 0x53 ||
           c === 0x57 || c === 0x59 || c === 0x5C || c === 0x5E ||
           c === 0x5D || c === 0x5B || c === 0x58 || c === 0x5A;
  }

  function isCondJump(c) {
    return c === 0x57 || c === 0x59 || c === 0x5C || c === 0x5E;
  }

  function isLoopCmd(c) {
    return c === 0x5D || c === 0x5B || c === 0x58 || c === 0x5A;
  }

  function loopRegIndex(c) {
    if (c === 0x5D) return 0;
    if (c === 0x5B) return 1;
    if (c === 0x58) return 2;
    if (c === 0x5A) return 3;
    return -1;
  }

  /* ---------- числа в духе Б3-34 ---------- */
  function norm(x) {
    if (typeof x !== 'number' || isNaN(x) || !isFinite(x)) return NaN;
    if (x === 0) return 0;
    var a = Math.abs(x);
    if (a >= 1e100) return NaN;
    if (a < 1e-99) return NaN;
    var y = Number(x.toPrecision(MAXDIG));
    if (!isFinite(y) || Math.abs(y) >= 1e100) return NaN;
    return y;
  }

  function fmtNum(x) {
    if (typeof x !== 'number' || isNaN(x) || !isFinite(x)) return 'ЕГГОГ';
    if (x === 0) return '0';
    var a = Math.abs(x), s, e, m, ms;
    if (a >= 1e8 || a < 1e-2) {
      e = Math.floor(Math.log10(a));
      m = x / Math.pow(10, e);
      ms = m.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
      s = ms + ' ' + (e < 0 ? '-' : ' ') + String(Math.abs(e));
      if (String(Math.abs(e)).length < 2) s = ms + ' ' + (e < 0 ? '-' : ' ') + '0' + Math.abs(e);
      return s;
    }
    return Number(x.toPrecision(MAXDIG)).toString();
  }

  /* ---------- фабрика ядра ---------- */
  function createCore(options) {
    var opt = options || {};
    var onEvent = typeof opt.onEvent === 'function' ? opt.onEvent : function () {};
    var maxLog = opt.maxLog || 4000;

    var ST = {
      X: 0, Y: 0, Z: 0, T: 0, X1: 0,
      R: new Array(REG_COUNT).fill(0),
      prog: new Array(PROG_LEN).fill(NOP),
      ip: 0,
      mode: 'AUT',        /* AUT | PRG */
      run: false,
      sub: [],
      layer: 'main',      /* main | f | k */
      await: null,        /* null | 'reg' | 'addr' */
      kind: null,
      addrBuf: '',
      input: '',
      typing: false,
      exp: false,
      err: false,
      steps: 0,
      angle: (ANGLES.indexOf(opt.angle) >= 0 ? opt.angle : 'deg')
    };

    var log = [];

    function emit(type, data) {
      try { onEvent(type, data === undefined ? null : data); } catch (e) {}
    }

    function hint(text) { emit('hint', text); }
    function changed() { emit('change', null); }

    function pushLog(note) {
      log.push({
        step: ST.steps,
        ip: ST.ip,
        code: ST.prog[ST.ip],
        note: note || '',
        X: ST.X, Y: ST.Y, Z: ST.Z, T: ST.T, X1: ST.X1,
        R: ST.R.slice(0)
      });
      if (log.length > maxLog) log.shift();
    }

    /* ---------- стек ---------- */
    function shiftUp() {
      ST.T = ST.Z;
      ST.Z = ST.Y;
      ST.Y = ST.X;
    }

    function pushValue(v) {
      var n = norm(v);
      shiftUp();
      ST.X = isNaN(n) ? NaN : n;
      ST.typing = false;
      ST.input = '';
      ST.exp = false;
    }

    function setErr() {
      ST.err = true;
      emit('error', null);
      changed();
    }

    /* ---------- ввод числа ---------- */
    function mantissaDigits(s) {
      return String(s).split('e')[0].replace(/[^0-9]/g, '').length;
    }

    function startTyping() {
      if (!ST.typing) {
        shiftUp();
        ST.input = '';
        ST.typing = true;
        ST.exp = false;
      }
      ST.err = false;
    }

    function typeDigit(d) {
      startTyping();
      if (ST.exp) {
        var parts = ST.input.split('e');
        if ((parts[1] || '').length >= 2) {
          hint('Порядок — только 2 цифры, как у оригинала');
          return;
        }
      } else if (mantissaDigits(ST.input) >= MAXDIG) {
        hint('Мантисса — 8 цифр, как у оригинала. Дальше вводи порядок через ВП.');
        return;
      }
      ST.input += String(d);
      var v = parseFloat(ST.input);
      ST.X = isNaN(v) ? 0 : v;
    }

    function typeDot() {
      startTyping();
      if (ST.exp) return;
      if (ST.input === '') ST.input = '0';
      if (ST.input.indexOf('.') < 0) ST.input += '.';
      ST.X = parseFloat(ST.input) || 0;
    }

    function typeExp() {
      startTyping();
      if (ST.input === '') ST.input = '0';
      if (ST.input.indexOf('e') < 0) {
        ST.input += 'e';
        ST.exp = true;
      }
    }

    /* ---------- операции ---------- */
    function unary(fn) {
      var old = ST.X;
      var v = norm(fn(ST.X));
      if (isNaN(v)) { setErr(); return; }
      ST.X1 = old;
      ST.X = v;
      ST.typing = false; ST.input = ''; ST.exp = false;
    }

    function binary(fn) {
      var x = ST.X, y = ST.Y;
      var v = norm(fn(y, x));
      if (isNaN(v)) { setErr(); return; }
      ST.X1 = x;
      ST.Y = ST.Z;
      ST.Z = ST.T;
      ST.X = v;
      ST.typing = false; ST.input = ''; ST.exp = false;
    }

    /* ---------- угловые единицы (переключатель Р-ГРД-Г) ---------- */
    function setAngle(mode) {
      if (ANGLES.indexOf(mode) < 0) return ST.angle;
      if (ST.angle === mode) return ST.angle;
      ST.angle = mode;
      changed();
      return ST.angle;
    }

    function getAngle() { return ST.angle; }

    function angleName(mode) {
      var m = mode || ST.angle;
      return m === 'grad' ? 'грады' : (m === 'rad' ? 'радианы' : 'градусы');
    }

    /* вход тригонометрии: число на индикаторе -> радианы */
    function toRad(v) {
      if (ST.angle === 'rad') return v;
      if (ST.angle === 'grad') return v * Math.PI / 200;
      return v * Math.PI / 180;
    }

    /* выход обратной тригонометрии: радианы -> число на индикаторе */
    function fromRad(v) {
      if (ST.angle === 'rad') return v;
      if (ST.angle === 'grad') return v * 200 / Math.PI;
      return v * 180 / Math.PI;
    }

    /* ---------- выполнение одной команды ---------- */
    function exec(code) {
      code = code & 255;
      var hi = (code >> 4) & 15, lo = code & 15;

      if (code >= 0x26 && code <= 0x2A) { setErr(); return; }
      if (code >= 0x30 && code <= 0x3B) { setErr(); return; }

      if (code >= 0x00 && code <= 0x09) { typeDigit(code); return; }
      if (code === 0x0A) { typeDot(); return; }
      if (code === 0x0B) { ST.X = -ST.X; if (ST.typing) ST.input = String(ST.X); return; }
      if (code === 0x0C) { typeExp(); return; }
      if (code === 0x0D) { ST.X = 0; ST.typing = false; ST.input = ''; ST.exp = false; return; }
      if (code === 0x0E) { shiftUp(); ST.typing = false; ST.input = ''; ST.exp = false; return; }
      if (code === 0x0F) { var t = ST.X1; ST.X1 = ST.X; ST.X = t; ST.typing = false; return; }

      if (code === 0x10) { binary(function (a, b) { return a + b; }); return; }
      if (code === 0x11) { binary(function (a, b) { return a - b; }); return; }
      if (code === 0x12) { binary(function (a, b) { return a * b; }); return; }
      if (code === 0x13) { binary(function (a, b) { return a / b; }); return; }
      if (code === 0x14) { var q = ST.X; ST.X = ST.Y; ST.Y = q; ST.typing = false; return; }

      if (code === 0x15) { unary(function (v) { return Math.pow(10, v); }); return; }
      if (code === 0x16) { unary(function (v) { return Math.exp(v); }); return; }
      if (code === 0x17) { unary(function (v) { return Math.log10(v); }); return; }
      if (code === 0x18) { unary(function (v) { return Math.log(v); }); return; }
      if (code === 0x19) { unary(function (v) { return fromRad(Math.asin(v)); }); return; }
      if (code === 0x1A) { unary(function (v) { return fromRad(Math.acos(v)); }); return; }
      if (code === 0x1B) { unary(function (v) { return fromRad(Math.atan(v)); }); return; }
      if (code === 0x1C) { unary(function (v) { return Math.sin(toRad(v)); }); return; }
      if (code === 0x1D) { unary(function (v) { return Math.cos(toRad(v)); }); return; }
      if (code === 0x1E) { unary(function (v) { return Math.tan(toRad(v)); }); return; }

      if (code === 0x20) { pushValue(Math.PI); return; }
      if (code === 0x21) { unary(function (v) { return Math.sqrt(v); }); return; }
      if (code === 0x22) { unary(function (v) { return v * v; }); return; }
      if (code === 0x23) { unary(function (v) { return 1 / v; }); return; }
      if (code === 0x24) { binary(function (a, b) { return Math.pow(a, b); }); return; }
      if (code === 0x25) {
        var tx = ST.X;
        ST.X = ST.Y; ST.Y = ST.Z; ST.Z = ST.T; ST.T = tx;
        ST.typing = false;
        return;
      }

      if (hi === 4) { ST.R[lo] = norm(ST.X); hint('X → R' + REG_NAMES[lo]); return; }
      if (hi === 6) { pushValue(ST.R[lo]); hint('R' + REG_NAMES[lo] + ' → X'); return; }

      if (code === 0x50) { return; }
      if (code === 0x52) { ST.ip = ST.sub.length ? ST.sub.pop() : 0; return; }

      setErr();
    }

    /* ---------- адреса ---------- */
    function jumpAddr(ip) {
      var at = (ip === undefined ? ST.ip : ip);
      var a = ST.prog[(at + 1) % PROG_LEN];
      var b = ST.prog[(at + 2) % PROG_LEN];
      if (a > 9 || b > 9) return -1;
      var v = a * 10 + b;
      if (v < 0 || v > 97) return -1;
      return v;
    }

    function modAddr(v, r) {
      var a;
      if (r >= 0 && r <= 3) a = (v - 1 + 100) % 100;
      else if (r >= 4 && r <= 6) a = (v + 1) % 100;
      else a = v;
      if (a < 0 || a > 97) a = ((a % PROG_LEN) + PROG_LEN) % PROG_LEN;
      return a;
    }

    function badAddress() {
      hint('Ошибка в адресе перехода: после команды должны стоять две цифры (00–97)');
      ST.err = true;
      ST.run = false;
      emit('error', null);
      changed();
      return 'error';
    }

    /* ---------- один шаг программы ---------- */
    function step() {
      if (ST.err) return 'error';
      var code = ST.prog[ST.ip];
      var hi = (code >> 4) & 15, lo = code & 15;
      var addr, ok;

      if (code === 0x50) { ST.run = false; return 'stop'; }

      if (code === 0x51) {
        addr = jumpAddr();
        if (addr < 0) return badAddress();
        ST.ip = addr;
        return 'jump';
      }

      if (code === 0x52) {
        ST.ip = ST.sub.length ? ST.sub.pop() : 0;
        return 'jump';
      }

      if (code === 0x53) {
        addr = jumpAddr();
        if (addr < 0) return badAddress();
        ST.sub.push((ST.ip + 3) % PROG_LEN);
        ST.ip = addr;
        return 'jump';
      }

      if (code === NOP) { ST.ip = (ST.ip + 1) % PROG_LEN; return 'cont'; }

      /* Условие истинно -> следующая команда, ложно -> переход по адресу. */
      if (isCondJump(code)) {
        addr = jumpAddr();
        if (addr < 0) return badAddress();
        ok = false;
        if (code === 0x57) ok = (ST.X !== 0);
        else if (code === 0x59) ok = (ST.X >= 0);
        else if (code === 0x5C) ok = (ST.X < 0);
        else ok = (ST.X === 0);
        ST.ip = ok ? ((ST.ip + 3) % PROG_LEN) : addr;
        return 'jump';
      }

      /* Циклы L0–L3: регистр уменьшается, пока не ноль — переход по адресу. */
      if (isLoopCmd(code)) {
        addr = jumpAddr();
        if (addr < 0) return badAddress();
        var r = loopRegIndex(code);
        ST.R[r] = norm(ST.R[r] - 1);
        if (ST.R[r] !== 0) ST.ip = addr;
        else ST.ip = (ST.ip + 3) % PROG_LEN;
        return 'jump';
      }

      if (hi === 8) { ST.ip = modAddr(ST.R[lo], lo); return 'jump'; }
      if (hi === 0xA) { ST.sub.push((ST.ip + 1) % PROG_LEN); ST.ip = modAddr(ST.R[lo], lo); return 'jump'; }
      if (hi === 0xB) { ST.R[modAddr(ST.R[lo], lo) % REG_COUNT] = norm(ST.X); ST.ip = (ST.ip + 1) % PROG_LEN; return 'cont'; }
      if (hi === 0xD) { pushValue(ST.R[modAddr(ST.R[lo], lo) % REG_COUNT]); ST.ip = (ST.ip + 1) % PROG_LEN; return 'cont'; }

      if (hi === 7) { ST.ip = (ST.X !== 0) ? ((ST.ip + 1) % PROG_LEN) : modAddr(ST.R[lo], lo); return 'jump'; }
      if (hi === 9) { ST.ip = (ST.X >= 0) ? ((ST.ip + 1) % PROG_LEN) : modAddr(ST.R[lo], lo); return 'jump'; }
      if (hi === 0xC) { ST.ip = (ST.X < 0) ? ((ST.ip + 1) % PROG_LEN) : modAddr(ST.R[lo], lo); return 'jump'; }
      if (hi === 0xE) { ST.ip = (ST.X === 0) ? ((ST.ip + 1) % PROG_LEN) : modAddr(ST.R[lo], lo); return 'jump'; }

      exec(code);
      if (ST.err) { ST.run = false; return 'error'; }
      ST.ip = (ST.ip + 1) % PROG_LEN;
      return 'cont';
    }

    /* ---------- прогон ---------- */
    function run(limit) {
      var max = limit || 100000;
      var n = 0, res = 'cont';
      ST.err = false;
      ST.steps = 0;
      while (n < max) {
        res = step();
        n++;
        ST.steps = n;
        if (res === 'stop' || res === 'error') break;
      }
      return { result: res, steps: n, err: ST.err, x: ST.X, overflow: (n >= max && res !== 'stop' && res !== 'error') };
    }

    /* ---------- запись программы ---------- */
    function writeStep(code) {
      if (ST.ip < 0 || ST.ip >= PROG_LEN) {
        hint('Программная память заполнена (' + PROG_LEN + ' шагов)');
        return false;
      }
      ST.prog[ST.ip] = code & 255;
      ST.ip = (ST.ip + 1) % PROG_LEN;
      return true;
    }

    function writeJump(code) {
      if (ST.ip > PROG_LEN - 3) {
        hint('Для перехода нужно три ячейки (команда + две цифры адреса). Свободного места не хватает.');
        return false;
      }
      ST.prog[ST.ip] = code & 255;
      ST.ip = (ST.ip + 1) % PROG_LEN;
      ST.await = 'addr';
      ST.addrBuf = '';
      hint('Введи адрес перехода двумя цифрами (десятки, затем единицы)');
      return true;
    }

    function setProgram(arr, keepRegisters) {
      var p = new Array(PROG_LEN).fill(NOP);
      if (Array.isArray(arr)) {
        for (var i = 0; i < PROG_LEN; i++) {
          if (typeof arr[i] === 'number' && isFinite(arr[i])) {
            p[i] = Math.max(0, Math.min(255, Math.round(arr[i])));
          }
        }
      }
      ST.prog = p;
      ST.ip = 0;
      ST.sub = [];
      ST.err = false;
      if (!keepRegisters) ST.R = new Array(REG_COUNT).fill(0);
      changed();
      return ST.prog;
    }

    function getProgram() { return ST.prog.slice(0); }

    function lastStep() {
      var last = -1;
      for (var i = 0; i < PROG_LEN; i++) { if (ST.prog[i] !== NOP) last = i; }
      return last;
    }

    function programHasData() {
      for (var i = 0; i < PROG_LEN; i++) { if (ST.prog[i] !== NOP) return true; }
      return false;
    }

    function clearProgram() { return setProgram(null, true); }

    function reset(soft) {
      ST.X = ST.Y = ST.Z = ST.T = ST.X1 = 0;
      ST.typing = false; ST.input = ''; ST.exp = false;
      ST.err = false; ST.run = false; ST.ip = 0; ST.sub = [];
      ST.layer = 'main'; ST.await = null; ST.kind = null; ST.addrBuf = '';
      if (!soft) ST.R = new Array(REG_COUNT).fill(0);
      /* угол не сбрасывается: это переключатель на корпусе */
      log = [];
      changed();
    }

    /* ---------- снимки состояния ---------- */
    function snapshot() {
      return {
        X: ST.X, Y: ST.Y, Z: ST.Z, T: ST.T, X1: ST.X1,
        R: ST.R.slice(0),
        prog: ST.prog.slice(0),
        ip: ST.ip, mode: ST.mode, err: ST.err,
        angle: ST.angle
      };
    }

    function restore(snap) {
      if (!snap) return false;
      ['X', 'Y', 'Z', 'T', 'X1'].forEach(function (k) {
        if (typeof snap[k] === 'number') ST[k] = snap[k];
      });
      if (Array.isArray(snap.R)) {
        for (var i = 0; i < REG_COUNT; i++) {
          ST.R[i] = typeof snap.R[i] === 'number' ? snap.R[i] : 0;
        }
      }
      if (Array.isArray(snap.prog)) setProgram(snap.prog, true);
      if (typeof snap.ip === 'number') ST.ip = snap.ip;
      if (typeof snap.mode === 'string') ST.mode = snap.mode;
      if (typeof snap.angle === 'string' && ANGLES.indexOf(snap.angle) >= 0) ST.angle = snap.angle;
      ST.err = !!snap.err;
      changed();
      return true;
    }

    /* ---------- нажатия клавиш по описанию профиля ---------- */
    function key(k) {
      if (!k) return;

      /* ввод адреса перехода: каждая цифра — отдельная ячейка программы */
      if (ST.await === 'addr' && k.a === 'digit') {
        ST.prog[ST.ip] = k.d;
        ST.ip = (ST.ip + 1) % PROG_LEN;
        ST.addrBuf += String(k.d);
        if (ST.addrBuf.length >= 2) {
          var full = parseInt(ST.addrBuf, 10);
          hint('Адрес перехода записан: ' + (full < 10 ? '0' : '') + full);
          ST.addrBuf = '';
          ST.await = null;
        } else {
          hint('Адрес: ' + ST.addrBuf + '_ (вторая цифра)');
        }
        changed();
        return;
      }

      if (k.a === 'pref-f') { ST.layer = (ST.layer === 'f') ? 'main' : 'f'; changed(); return; }
      if (k.a === 'pref-k') { ST.layer = (ST.layer === 'k') ? 'main' : 'k'; changed(); return; }

      if (k.a === 'digit') {
        if (ST.mode === 'PRG') { writeStep(k.d); hint('Код ' + k.d); }
        else typeDigit(k.d);
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'dot') {
        if (ST.mode === 'PRG') writeStep(0x0A);
        else typeDot();
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'code') {
        if (ST.mode === 'PRG') {
          if (k.jump) writeJump(k.c);
          else { writeStep(k.c); hint('Код ' + codeStr(k.c)); }
        } else {
          exec(k.c);
        }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'stox' || k.a === 'loadx' || k.a === 'kcmd') {
        ST.await = 'reg';
        ST.kind = (k.a === 'stox') ? 0x40 : (k.a === 'loadx' ? 0x60 : k.k);
        emit('pick-register', { mode: k.a });
        return;
      }

      if (k.a === 'reg') {
        var mode = k.mode;
        if (ST.mode === 'PRG') {
          if (mode === 'sto') writeStep(0x40 | k.r);
          else if (mode === 'ld') writeStep(0x60 | k.r);
          else writeStep(ST.kind | k.r);
          ST.await = null; ST.kind = null;
          changed();
          return;
        }
        if (mode === 'sto') { ST.R[k.r] = norm(ST.X); hint('X → R' + REG_NAMES[k.r] + ' = ' + fmtNum(ST.X)); }
        else if (mode === 'ld') { pushValue(ST.R[k.r]); hint('R' + REG_NAMES[k.r] + ' → X = ' + fmtNum(ST.R[k.r])); }
        ST.await = null; ST.kind = null;
        changed();
        return;
      }

      if (k.a === 'sp') {
        if (ST.mode === 'PRG') { writeStep(0x50); hint('Код 50 (С/П)'); }
        else if (ST.run) { ST.run = false; hint('Остановлено клавишей С/П на адресе ' + ST.ip); }
        else { ST.run = true; }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'pp') {
        if (ST.mode === 'PRG') writeJump(0x53);
        else { ST.run = false; step(); }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'bp') {
        if (ST.mode === 'PRG') writeJump(0x51);
        else { ST.await = 'addr'; ST.addrBuf = ''; hint('Введи адрес перехода двумя цифрами'); }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'vo') {
        if (ST.mode === 'PRG') writeStep(0x52);
        else { ST.ip = 0; ST.sub = []; hint('Адрес 00'); }
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'prg') {
        ST.mode = 'PRG'; ST.typing = false; ST.exp = false; ST.run = false;
        hint('Режим программирования: нажимай клавиши — их коды пишутся в память');
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'aut') {
        ST.mode = 'AUT'; ST.err = false;
        hint('Автоматический режим');
        ST.layer = 'main';
        changed();
        return;
      }

      if (k.a === 'cf') {
        ST.layer = 'main'; ST.await = null; ST.kind = null;
        changed();
        return;
      }

      if (k.a === 'layer-cmd') {
        var cmd = k.c;
        if (ST.mode === 'PRG') {
          if (k.jump) writeJump(cmd); else writeStep(cmd);
        } else {
          exec(cmd);
        }
        ST.layer = 'main';
        changed();
        return;
      }
    }

    function getLog() { return log.slice(0); }
    function clearLog() { log = []; }
    function record(msg) { pushLog(msg); }

    function setRegister(i, v) {
      if (i >= 0 && i < REG_COUNT) { ST.R[i] = norm(v); changed(); }
    }

    function setX(v) { ST.X = norm(v); ST.typing = false; ST.input = ''; changed(); }

    return {
      ST: ST,
      key: key,
      exec: exec,
      step: step,
      run: run,
      reset: reset,
      setProgram: setProgram,
      getProgram: getProgram,
      clearProgram: clearProgram,
      lastStep: lastStep,
      programHasData: programHasData,
      writeStep: writeStep,
      writeJump: writeJump,
      setRegister: setRegister,
      setX: setX,
      setAngle: setAngle,
      getAngle: getAngle,
      angleName: angleName,
      snapshot: snapshot,
      restore: restore,
      getLog: getLog,
      clearLog: clearLog,
      record: record,
      fmt: fmtNum,
      cmdName: cmdName,
      jumpAddr: jumpAddr,
      changed: changed,
      hint: hint
    };
  }

  global.MKCore = {
    create: createCore,
    fmtNum: fmtNum,
    norm: norm,
    cmdName: cmdName,
    codeStr: codeStr,
    hex2: hex2,
    isJumpCmd: isJumpCmd,
    isCondJump: isCondJump,
    isLoopCmd: isLoopCmd,
    REG_NAMES: REG_NAMES,
    ANGLES: ANGLES,
    NOP: NOP,
    PROG_LEN: PROG_LEN,
    REG_COUNT: REG_COUNT,
    MAXDIG: MAXDIG
  };
})(typeof window !== 'undefined' ? window : this);
