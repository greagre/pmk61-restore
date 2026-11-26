/* =========================================================
   mk-emulator / profiles.js
   Профили моделей — только данные, без логики.

   Профиль описывает:
   - название и подпись на корпусе;
   - ряды клавиш основного слоя;
   - слой F и слой K;
   - служебные параметры (сколько регистров, длина программы).

   Добавить МК-51 или МК-61 = добавить ещё один объект сюда.
   Ядро при этом менять не нужно.
   ========================================================= */
(function (global) {
  'use strict';

  /* Основной слой Б3-34. a — действие, c — код команды. */
  var B334_MAIN = [
    { t: 'f',    a: 'pref-f', cls: 'pref' },
    { t: 'k',    a: 'pref-k', cls: 'pref' },
    { t: 'x→П',  a: 'stox' },
    { t: 'П→X',  a: 'loadx' },
    { t: '↔',    a: 'code', c: 0x14, cls: 'dark' },
    { t: 'В↑',   a: 'code', c: 0x0E, cls: 'dark' },

    { t: 'С/П',  a: 'sp', cls: 'red' },
    { t: 'ПП',   a: 'pp', cls: 'dark' },
    { t: 'БП',   a: 'bp', cls: 'dark' },
    { t: 'В/О',  a: 'vo', cls: 'dark' },
    { t: 'Cx',   a: 'code', c: 0x0D, cls: 'red' },
    { t: '/-/',  a: 'code', c: 0x0B, cls: 'dark' },

    { t: '7',    a: 'digit', d: 7, cls: 'dark' },
    { t: '8',    a: 'digit', d: 8, cls: 'dark' },
    { t: '9',    a: 'digit', d: 9, cls: 'dark' },
    { t: '÷',    a: 'code', c: 0x13, cls: 'blue' },
    { t: 'ВП',   a: 'code', c: 0x0C },
    { t: 'F◯',   a: 'code', c: 0x25 },

    { t: '4',    a: 'digit', d: 4, cls: 'dark' },
    { t: '5',    a: 'digit', d: 5, cls: 'dark' },
    { t: '6',    a: 'digit', d: 6, cls: 'dark' },
    { t: '×',    a: 'code', c: 0x12, cls: 'blue' },
    { t: 'π',    a: 'code', c: 0x20 },
    { t: '√',    a: 'code', c: 0x21 },

    { t: '1',    a: 'digit', d: 1, cls: 'dark' },
    { t: '2',    a: 'digit', d: 2, cls: 'dark' },
    { t: '3',    a: 'digit', d: 3, cls: 'dark' },
    { t: '−',    a: 'code', c: 0x11, cls: 'blue' },
    { t: 'x²',   a: 'code', c: 0x22 },
    { t: '1/x',  a: 'code', c: 0x23 },

    { t: '0',    a: 'digit', d: 0, cls: 'dark' },
    { t: '•',    a: 'dot', cls: 'dark' },
    { t: '+',    a: 'code', c: 0x10, cls: 'blue' },
    { t: 'x^y',  a: 'code', c: 0x24 },
    { t: 'e^x',  a: 'code', c: 0x16 },
    { t: 'ln',   a: 'code', c: 0x18 }
  ];

  /* Слой F */
  var B334_F = [
    { t: 'sin',    a: 'layer-cmd', c: 0x1C, cls: 'dark' },
    { t: 'cos',    a: 'layer-cmd', c: 0x1D, cls: 'dark' },
    { t: 'tg',     a: 'layer-cmd', c: 0x1E, cls: 'dark' },
    { t: 'arcsin', a: 'layer-cmd', c: 0x19, cls: 'dark' },
    { t: 'arccos', a: 'layer-cmd', c: 0x1A, cls: 'dark' },
    { t: 'arctg',  a: 'layer-cmd', c: 0x1B, cls: 'dark' },

    { t: 'lg',     a: 'layer-cmd', c: 0x17, cls: 'dark' },
    { t: '10^x',   a: 'layer-cmd', c: 0x15, cls: 'dark' },
    { t: 'e^x',    a: 'layer-cmd', c: 0x16, cls: 'dark' },
    { t: 'x^y',    a: 'layer-cmd', c: 0x24, cls: 'dark' },
    { t: 'π',      a: 'layer-cmd', c: 0x20, cls: 'dark' },
    { t: '√',      a: 'layer-cmd', c: 0x21, cls: 'dark' },

    { t: 'x²',     a: 'layer-cmd', c: 0x22, cls: 'dark' },
    { t: '1/x',    a: 'layer-cmd', c: 0x23, cls: 'dark' },
    { t: 'F◯',     a: 'layer-cmd', c: 0x25, cls: 'dark' },
    { t: 'F Вx',   a: 'layer-cmd', c: 0x0F, cls: 'dark' },
    { t: 'Cx',     a: 'layer-cmd', c: 0x0D, cls: 'dark' },
    { t: 'CF',     a: 'cf', cls: 'dark' },

    { t: 'ПРГ',    a: 'prg', cls: 'blue' },
    { t: 'АВТ',    a: 'aut', cls: 'blue' },
    { t: 'x<0',    a: 'layer-cmd', c: 0x5C, jump: 1, cls: 'dark' },
    { t: 'x=0',    a: 'layer-cmd', c: 0x5E, jump: 1, cls: 'dark' },
    { t: 'x≥0',    a: 'layer-cmd', c: 0x59, jump: 1, cls: 'dark' },
    { t: 'x≠0',    a: 'layer-cmd', c: 0x57, jump: 1, cls: 'dark' },

    { t: 'L0',     a: 'layer-cmd', c: 0x5D, jump: 1, cls: 'dark' },
    { t: 'L1',     a: 'layer-cmd', c: 0x5B, jump: 1, cls: 'dark' },
    { t: 'L2',     a: 'layer-cmd', c: 0x58, jump: 1, cls: 'dark' },
    { t: 'L3',     a: 'layer-cmd', c: 0x5A, jump: 1, cls: 'dark' },
    { t: 'В↑',     a: 'layer-cmd', c: 0x0E, cls: 'dark' },
    { t: '↔',      a: 'layer-cmd', c: 0x14, cls: 'dark' }
  ];

  /* Слой K: команды с косвенным адресом из регистра */
  var B334_K = [
    { t: 'НОП',   a: 'layer-cmd', c: 0x54, cls: 'dark' },
    { t: 'БП R',  a: 'kcmd', k: 0x80, cls: 'dark' },
    { t: 'ПП R',  a: 'kcmd', k: 0xA0, cls: 'dark' },
    { t: 'x≠0 R', a: 'kcmd', k: 0x70, cls: 'dark' },
    { t: 'x≥0 R', a: 'kcmd', k: 0x90, cls: 'dark' },
    { t: 'x<0 R', a: 'kcmd', k: 0xC0, cls: 'dark' },
    { t: 'x=0 R', a: 'kcmd', k: 0xE0, cls: 'dark' }
  ];

  global.MKProfiles = {
    'b3-34': {
      id: 'b3-34',
      title: 'ЭЛЕКТРОНИКА',
      model: 'Б3-34',
      registers: 14,
      progLen: 98,
      layers: { main: B334_MAIN, f: B334_F, k: B334_K },
      notes: 'Оригинал: 8 значащих цифр, порядок до ±99, ~5 шагов в секунду.'
    }
  };
})(typeof window !== 'undefined' ? window : this);
