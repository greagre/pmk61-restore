/* =========================================================
   mk-emulator / core-fix.js
   Надстройка над core.js: набор числа при выполнении программы.

   Что было не так (тесты «Подпрограммы»):
     программа  5 · ПП 06 · С/П · 1 · + · В/О
     адрес 00 набирает 5, но ST.typing остаётся true.
     На адресе 06 цифра 1 дописывается к набору: «5» + «1» = 51.
     Дальше «+» прибавляет к 51 пустое Y (0) — на индикаторе 51,
     а ждали 6. Во втором кейсе так же выходит 21 вместо 3.

   Как на настоящем Б3-34:
     цифровая команда начинает НОВОЕ число, если предыдущая
     выполненная команда — не цифра; подряд идущие цифры
     по-прежнему собирают одно число (константа 123 = три шага).

   Ядро core.js не меняется: обёртка перехватывает create()
   и подменяет step() и run() у готового экземпляра.
   Подключать СТРОГО после core.js:
     <script src="core.js"></script>
     <script src="core-fix.js"></script>
   ========================================================= */
(function (global) {
  'use strict';

  var MK = global.MKCore;
  if (!MK || MK.__fixTyping) return;

  var origCreate = MK.create;

  /* цифры 0–9 и десятичная точка остаются продолжением набора */
  function isNumberCode(code) {
    return code >= 0x00 && code <= 0x0A;
  }

  MK.create = function (options) {
    var core = origCreate(options);
    var ST = core.ST;
    var origStep = core.step;

    /* перед нецифровой командой закрываем открытый набор числа */
    function closeTyping() {
      var code = ST.prog[ST.ip];
      if (!isNumberCode(code) && ST.typing) {
        ST.typing = false;
      }
    }

    function stepFixed() {
      closeTyping();
      return origStep();
    }

    /* run() в ядре вызывает свою внутреннюю step, поэтому повторяем
       его правило поверх исправленной step — результат тот же */
    function runFixed(limit) {
      var max = limit || 100000;
      var n = 0, res = 'cont';
      ST.err = false;
      ST.steps = 0;
      while (n < max) {
        res = stepFixed();
        n++;
        ST.steps = n;
        if (res === 'stop' || res === 'error') break;
      }
      return {
        result: res,
        steps: n,
        err: ST.err,
        x: ST.X,
        overflow: (n >= max && res !== 'stop' && res !== 'error')
      };
    }

    core.step = stepFixed;
    core.run = runFixed;
    return core;
  };

  MK.__fixTyping = true;
})(typeof window !== 'undefined' ? window : this);
