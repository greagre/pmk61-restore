/* =========================================================
   mk-emulator / lang.js
   МК-Алго — алгоритмический язык-надстройка над ПМК.

   Правила этого файла:
   - ядро (core.js) не трогает; на выходе — только коды 0…255;
   - ничего не знает про DOM, только текст -> коды и листинг;
   - все переходы считаются метками, руками адреса не пишутся.

   Чего не умеет: массивов, подпрограмм, дробных степеней,
   экспоненциальной записи. Всё остальное — ниже.

   Правки этой ревизии:
   - отрицательные константы: знак ставится ПОСЛЕ цифр, иначе
     startTyping в ядре обнуляет ввод и минус пропадает;
   - сравнение с нулём (n != 0, n < 0 и т. п.) больше не тратит
     промежуточный регистр и 5 шагов — X уже содержит a - 0.
   ========================================================= */
(function (global) {
  'use strict';

  var CORE = global.MKCore;
  var PROG_LEN = CORE ? CORE.PROG_LEN : 98;
  var REG_COUNT = CORE ? CORE.REG_COUNT : 14;
  var REG_NAMES = (CORE && CORE.REG_NAMES) ? CORE.REG_NAMES : ['0','1','2','3','4','5','6','7','8','9','a','b','c','d'];

  var OPCODE = { '+': 0x10, '-': 0x11, '*': 0x12, '/': 0x13, '^': 0x24 };

  /* Семантика ядра (core.js, step): условие ИСТИННО — идём на
     следующую команду, ЛОЖНО — переход по адресу.
     Значит каждый код ниже — «уйти, если условие нарушено». */
  var COND = {
    '!=': [0x57],           /* F x≠0: уйти, если X = 0        */
    '==': [0x5E],           /* F x=0 : уйти, если X <> 0      */
    '<':  [0x5C],           /* F x<0 : уйти, если X >= 0      */
    '>=': [0x59],           /* F x>=0: уйти, если X < 0       */
    '>':  [0x0B, 0x5C],     /* сменить знак, уйти, если X <= 0 */
    '<=': [0x0B, 0x59]      /* сменить знак, уйти, если X > 0  */
  };

  /* То же, но когда сравниваем с нулём: промежуточный регистр
     не нужен, потому что в X уже лежит само a (a - 0). */
  var ZERO_JUMP = { '!=': 0x57, '==': 0x5E, '<': 0x5C, '>=': 0x59 };

  var NEG = 0x0B;   /* /-/ */
  var DOT = 0x0A;   /* .   */
  var CX  = 0x0D;   /* Cx  — завершает ввод числа, не двигая стек */
  var STOP = 0x50;  /* С/П */
  var BP   = 0x51;  /* БП  */
  var NOP  = 0x54;

  /* ---------- токены ---------- */
  function tokenize(s) {
    var out = [], i = 0;
    while (i < s.length) {
      var ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9]/.test(ch)) {
        var j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        out.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        var k = i;
        while (k < s.length && /[A-Za-z0-9_]/.test(s[k])) k++;
        out.push({ t: 'id', v: s.slice(i, k) });
        i = k;
        continue;
      }
      var two = s.substr(i, 2);
      if (two === '!=' || two === '<=' || two === '>=') {
        out.push({ t: 'op', v: two }); i += 2; continue;
      }
      if ('+-*/^()=<>'.indexOf(ch) >= 0) {
        out.push({ t: 'op', v: ch }); i++; continue;
      }
      throw new Error('непонятный символ «' + ch + '»');
    }
    return out;
  }

  /* ---------- разбор выражений ---------- */
  function EP(tokens) { this.t = tokens; this.i = 0; }
  EP.prototype.peek = function () { return this.t[this.i]; };
  EP.prototype.take = function () { return this.t[this.i++]; };
  EP.prototype.isOp = function (v) {
    var p = this.peek();
    return !!(p && p.t === 'op' && p.v === v);
  };
  EP.prototype.expr = function () {
    var node = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      var op = this.take().v;
      node = { k: 'bin', op: op, a: node, b: this.term() };
    }
    return node;
  };
  EP.prototype.term = function () {
    var node = this.factor();
    while (this.isOp('*') || this.isOp('/')) {
      var op = this.take().v;
      node = { k: 'bin', op: op, a: node, b: this.factor() };
    }
    return node;
  };
  EP.prototype.factor = function () {
    var node = this.unary();
    if (this.isOp('^')) {
      this.take();
      node = { k: 'bin', op: '^', a: node, b: this.factor() };
    }
    return node;
  };
  EP.prototype.unary = function () {
    if (this.isOp('-')) { this.take(); return { k: 'neg', a: this.unary() }; }
    return this.primary();
  };
  EP.prototype.primary = function () {
    var p = this.take();
    if (!p) throw new Error('выражение оборвалось');
    if (p.t === 'num') return { k: 'num', v: p.v };
    if (p.t === 'id') return { k: 'var', n: p.v };
    if (p.t === 'op' && p.v === '(') {
      var e = this.expr();
      var q = this.take();
      if (!q || q.v !== ')') throw new Error('не закрыта скобка');
      return e;
    }
    throw new Error('лишнее «' + p.v + '»');
  };

  function parseExprText(s) {
    if (!s || !s.trim()) throw new Error('пустое выражение');
    var p = new EP(tokenize(s));
    var node = p.expr();
    if (p.peek()) throw new Error('лишнее «' + p.peek().v + '»');
    return node;
  }

  function parseCondText(s) {
    if (!s || !s.trim()) throw new Error('пустое условие');
    var p = new EP(tokenize(s));
    var a = p.expr();
    var t = p.peek();
    if (t && t.t === 'op' && ['=', '!=', '<', '>', '<=', '>='].indexOf(t.v) >= 0) {
      var rel = p.take().v;
      if (rel === '=') rel = '==';
      var b = p.expr();
      if (p.peek()) throw new Error('лишнее «' + p.peek().v + '»');
      return { k: 'cmp', rel: rel, a: a, b: b };
    }
    if (p.peek()) throw new Error('лишнее «' + p.peek().v + '»');
    return { k: 'cmp', rel: '!=', a: a, b: null };
  }

  /* ---------- разбор программы ---------- */
  function parseProgram(src) {
    var lines = String(src).split(/\r?\n/);
    var ctx = { regs: {}, order: [], params: [], errors: [] };
    var i = 0;

    function head(s) {
      var m = /^[A-Za-z_]+/.exec(s);
      return m ? m[0].toLowerCase() : '';
    }

    function declare(name, lineNo) {
      if (ctx.regs[name] !== undefined) {
        throw new Error('строка ' + lineNo + ': «' + name + '» уже объявлена');
      }
      if (ctx.order.length >= REG_COUNT) {
        throw new Error('строка ' + lineNo + ': нужно больше ' + REG_COUNT + ' регистров');
      }
      var r = ctx.order.length;
      ctx.regs[name] = r;
      ctx.order.push(name);
      return r;
    }

    function parseBlock(stops, depth) {
      var nodes = [];
      while (i < lines.length) {
        var raw = lines[i];
        var s = raw.trim();
        var lineNo = i + 1;
        if (!s || s.charAt(0) === '#') { i++; continue; }
        var h = head(s);
        if (stops.indexOf(h) >= 0) return nodes;

        if (h === 'reg') {
          var names = s.slice(3).trim().split(/[\s,]+/).filter(Boolean);
          if (!names.length) throw new Error('строка ' + lineNo + ': после reg нет имён');
          names.forEach(function (n) {
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) {
              throw new Error('строка ' + lineNo + ': плохое имя «' + n + '»');
            }
            declare(n, lineNo);
          });
          i++; continue;
        }

        if (h === 'param') {
          var rest = s.slice(5).trim();
          var eq = rest.indexOf('=');
          var nm = (eq >= 0 ? rest.slice(0, eq) : rest).trim();
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm)) {
            throw new Error('строка ' + lineNo + ': плохое имя параметра');
          }
          var r = ctx.regs[nm] !== undefined ? ctx.regs[nm] : declare(nm, lineNo);
          var val = 0;
          if (eq >= 0) {
            var vtxt = rest.slice(eq + 1).trim();
            var vnode = parseExprText(vtxt);
            if (vnode.k !== 'num') {
              throw new Error('строка ' + lineNo + ': параметр принимает только число');
            }
            val = vnode.v;
          }
          ctx.params.push({ name: nm, reg: r, value: val });
          i++; continue;
        }

        if (h === 'data') {
          var nums = s.slice(4).trim().split(/[\s,]+/).filter(Boolean);
          nums.forEach(function (txt, idx) {
            if (!/^-?[0-9]+(\.[0-9]+)?$/.test(txt)) {
              throw new Error('строка ' + lineNo + ': «' + txt + '» не число');
            }
            if (idx >= ctx.order.length) {
              throw new Error('строка ' + lineNo + ': data некуда класть, объяви переменные через reg');
            }
            var nm2 = ctx.order[idx];
            ctx.params.push({ name: nm2, reg: ctx.regs[nm2], value: parseFloat(txt) });
          });
          i++; continue;
        }

        if (h === 'if') {
          var cond = parseCondText(s.slice(2));
          i++;
          var body = parseBlock(['else', 'end'], depth + 1);
          var els = [];
          if (i < lines.length && head(lines[i].trim()) === 'else') {
            i++;
            els = parseBlock(['end'], depth + 1);
          }
          if (i >= lines.length || head(lines[i].trim()) !== 'end') {
            throw new Error('строка ' + lineNo + ': if не закрыт словом end');
          }
          i++;
          nodes.push({ k: 'if', cond: cond, body: body, els: els, line: lineNo });
          continue;
        }

        if (h === 'while') {
          var c2 = parseCondText(s.slice(5));
          i++;
          var bod = parseBlock(['end'], depth + 1);
          if (i >= lines.length || head(lines[i].trim()) !== 'end') {
            throw new Error('строка ' + lineNo + ': while не закрыт словом end');
          }
          i++;
          nodes.push({ k: 'while', cond: c2, body: bod, line: lineNo });
          continue;
        }

        if (h === 'else' || h === 'end') {
          throw new Error('строка ' + lineNo + ': лишнее «' + h + '»');
        }

        if (h === 'print') {
          nodes.push({ k: 'print', e: parseExprText(s.slice(5)), line: lineNo });
          i++; continue;
        }

        if (h === 'stop') {
          nodes.push({ k: 'stop', line: lineNo });
          i++; continue;
        }

        var m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(s);
        if (!m) throw new Error('строка ' + lineNo + ': не понял «' + s + '»');
        if (ctx.regs[m[1]] === undefined) {
          throw new Error('строка ' + lineNo + ': переменная «' + m[1] + '» не объявлена');
        }
        nodes.push({ k: 'assign', name: m[1], e: parseExprText(m[2]), line: lineNo });
        i++;
      }
      if (stops.length) {
        throw new Error('не закрыт блок ' + stops.join('/') + ' — не хватает end');
      }
      return nodes;
    }

    var program = parseBlock([], 0);
    return { nodes: program, ctx: ctx };
  }

  /* ---------- генерация кодов ---------- */
  function Gen(ctx) {
    this.ctx = ctx;
    this.out = [];
    this.n = 0;
    this.tmps = [];
    this.ctx.free = [];
    for (var r = REG_COUNT - 1; r >= 0; r--) {
      if (ctx.order.indexOf(undefined) >= 0) break;
      if (r >= ctx.order.length) ctx.free.push(r);
    }
  }

  Gen.prototype.emit = function (c) { this.out.push({ t: 'c', c: c }); };
  Gen.prototype.jump = function (c, label) { this.out.push({ t: 'j', c: c, label: label }); };
  Gen.prototype.label = function (name) { this.out.push({ t: 'l', name: name }); };
  Gen.prototype.newLabel = function (p) { return p + (++this.n); };

  Gen.prototype.alloc = function () {
    if (!this.ctx.free.length) throw new Error('нет свободного регистра для промежуточного значения — сократи выражение');
    var r = this.ctx.free.pop();
    this.tmps.push(r);
    return r;
  };
  Gen.prototype.release = function () {
    var r = this.tmps.pop();
    if (r !== undefined) this.ctx.free.push(r);
  };

  Gen.prototype.num = function (v) {
    if (!isFinite(v)) throw new Error('число не представимо');
    var neg = v < 0;
    var s = String(Math.abs(v));
    if (s.indexOf('e') >= 0) throw new Error('экспоненциальная запись не поддерживается');
    var digits = s.replace('.', '').replace(/^0+/, '');
    if (digits.length > 8) throw new Error('в числе «' + s + '» больше 8 значащих цифр');
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '.') this.emit(DOT);
      else this.emit(Number(ch));
    }
    /* Знак — строго после цифр. Если поставить /‑/ до них, ядро начнёт
       ввод числа заново (startTyping обнуляет input) и минус пропадёт. */
    if (neg) this.emit(NEG);
  };

  Gen.prototype.expr = function (node) {
    if (node.k === 'num') { this.num(node.v); return; }
    if (node.k === 'var') {
      var r = this.ctx.regs[node.n];
      if (r === undefined) throw new Error('переменная «' + node.n + '» не объявлена');
      this.emit(0x60 | r);
      return;
    }
    if (node.k === 'neg') { this.expr(node.a); this.emit(NEG); return; }
    if (node.k === 'bin') {
      var code = OPCODE[node.op];
      if (code === undefined) throw new Error('неизвестная операция «' + node.op + '»');
      var t = this.alloc();
      this.expr(node.b);
      this.emit(0x40 | t);
      this.emit(CX);
      this.expr(node.a);
      this.emit(0x60 | t);
      this.emit(code);
      this.release();
      return;
    }
    throw new Error('неизвестный узел выражения');
  };

  Gen.prototype.cond = function (c, label) {
    if (!c.b) {
      this.expr(c.a);
      this.jump(0x57, label);
      return;
    }
    /* сравнение с нулём: X = a, промежуточный регистр не нужен */
    if (c.b.k === 'num' && c.b.v === 0 && ZERO_JUMP[c.rel]) {
      this.expr(c.a);
      this.jump(ZERO_JUMP[c.rel], label);
      return;
    }
    var t = this.alloc();
    this.expr(c.b);
    this.emit(0x40 | t);
    this.emit(CX);
    this.expr(c.a);
    this.emit(0x60 | t);
    this.emit(0x11);
    this.release();
    var seq = COND[c.rel];
    if (!seq) throw new Error('неизвестное сравнение «' + c.rel + '»');
    for (var i = 0; i < seq.length - 1; i++) this.emit(seq[i]);
    this.jump(seq[seq.length - 1], label);
  };

  Gen.prototype.block = function (nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.k === 'assign') {
        this.expr(n.e);
        this.emit(0x40 | this.ctx.regs[n.name]);
        this.emit(CX);
      } else if (n.k === 'print') {
        this.expr(n.e);
        this.emit(STOP);
      } else if (n.k === 'stop') {
        this.emit(STOP);
      } else if (n.k === 'while') {
        var L = this.newLabel('L');
        var E = this.newLabel('E');
        this.label(L);
        this.cond(n.cond, E);
        this.block(n.body);
        this.jump(BP, L);
        this.label(E);
      } else if (n.k === 'if') {
        var E2 = this.newLabel('E');
        this.cond(n.cond, E2);
        this.block(n.body);
        if (n.els && n.els.length) {
          var END = this.newLabel('E');
          this.jump(BP, END);
          this.label(E2);
          this.block(n.els);
          this.label(END);
        } else {
          this.label(E2);
        }
      }
    }
  };

  /* ---------- раскладка адресов ---------- */
  function nameOf(code) {
    if (CORE && CORE.cmdName) return CORE.cmdName(code);
    return '?';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function layout(out) {
    var addr = 0, labels = {}, items = [];
    for (var i = 0; i < out.length; i++) {
      var e = out[i];
      if (e.t === 'l') { labels[e.name] = addr; continue; }
      var size = e.t === 'j' ? 3 : 1;
      items.push({ addr: addr, size: size, code: e.c, label: e.label, tail: e.tail });
      addr += size;
    }

    var errors = [], codes = [], listing = [], stops = [];

    if (addr > PROG_LEN) {
      errors.push('программа занимает ' + addr + ' шагов, а памяти ' + PROG_LEN);
    }

    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      if (it.size === 1) {
        codes.push(it.code);
        listing.push({ addr: it.addr, code: it.code, name: nameOf(it.code) });
        if (it.code === STOP && !it.tail) stops.push(it.addr);
        continue;
      }
      var target = labels[it.label];
      if (target === undefined) { errors.push('не найдена метка ' + it.label); continue; }
      if (target > 97) { errors.push('адрес перехода ' + target + ' вне диапазона 00–97'); continue; }
      codes.push(it.code, Math.floor(target / 10), target % 10);
      listing.push({ addr: it.addr, code: it.code, name: nameOf(it.code) + ' ' + pad2(target) });
    }

    return { codes: codes, listing: listing, stops: stops, errors: errors, size: addr };
  }

  /* ---------- точка входа ---------- */
  function assemble(src) {
    try {
      var parsed = parseProgram(src);
      var ctx = parsed.ctx;
      if (!ctx.order.length) {
        return { ok: false, errors: ['в программе нет ни одной переменной: начни со строки reg'] };
      }
      var g = new Gen(ctx);
      g.block(parsed.nodes);

      var last = g.out[g.out.length - 1];
      if (!last || last.t !== 'c' || last.c !== STOP) {
        g.out.push({ t: 'c', c: STOP, tail: true });
      }

      var lay = layout(g.out);
      if (lay.errors.length) return { ok: false, errors: lay.errors };

      var codes = lay.codes.slice(0);
      while (codes.length < PROG_LEN) codes.push(NOP);

      return {
        ok: true,
        codes: codes,
        size: lay.size,
        listing: lay.listing,
        stops: lay.stops,
        params: ctx.params,
        regs: ctx.regs,
        order: ctx.order
      };
    } catch (e) {
      return { ok: false, errors: [e.message || String(e)] };
    }
  }

  global.MKLang = {
    assemble: assemble,
    OPCODE: OPCODE,
    COND: COND,
    ZERO_JUMP: ZERO_JUMP
  };
})(typeof window !== 'undefined' ? window : this);
