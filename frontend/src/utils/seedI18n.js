/**
 * seedI18n.js - Frontend translation helper for legacy MongoDB seed data.
 *
 * Cabinet pages render data (invoices, shipment timeline events, notifications)
 * that was seeded UK-only. Until the backend exposes per-language fields for every
 * seed record, this helper translates known UK strings into EN/BG on the fly.
 *
 * Usage:
 *   import { tSeed } from '../utils/seedI18n';
 *   <p>{tSeed(invoice.description, lang)}</p>
 *
 * If the string is unknown, returns it unchanged (UK fallback).
 */

// Dictionary of UK -> { en, bg } mappings for well-known seed data.
const SEED_DICT = {
  'Готово до видачі': { en: 'Ready for pickup', bg: 'Готов за получаване' },
  '🏁 Готово до видачі': { en: '🏁 Ready for pickup', bg: '🏁 Готов за получаване' },
  'за Audi Q7': { en: 'for Audi Q7', bg: 'за Audi Q7' },
  'за Mercedes-Benz': { en: 'for Mercedes-Benz', bg: 'за Mercedes-Benz' },
  'за BMW': { en: 'for BMW', bg: 'за BMW' },
  'за Tesla': { en: 'for Tesla', bg: 'за Tesla' },
  ' за ': { en: ' for ', bg: ' за ' },
  // Invoice description fragments
  'Вартість авто': { en: 'Vehicle cost', bg: 'Стойност на автомобила' },
  'Послуги': { en: 'Services', bg: 'Услуги' },
  'Депозит': { en: 'Deposit', bg: 'Депозит' },
  'Доставка': { en: 'Delivery', bg: 'Доставка' },
  'Доставка та логістика': { en: 'Delivery & logistics', bg: 'Доставка и логистика' },
  'Основна оплата': { en: 'Main payment', bg: 'Основно плащане' },
  'Передплата': { en: 'Advance payment', bg: 'Авансово плащане' },
  'Повна оплата': { en: 'Full payment', bg: 'Пълно плащане' },
  ' від ': { en: ' from ', bg: ' от ' },
  // City names
  'Київ': { en: 'Kyiv', bg: 'Киев' },
  // Common surnames used in seed
  'Демо': { en: 'Demo', bg: 'Демо' },
  'BIB-2026-0487 на Audi Q7 Premium Plus очікує вашого підпису': { en: 'BIB-2026-0487 for Audi Q7 Premium Plus awaits your signature', bg: 'BIB-2026-0487 за Audi Q7 Premium Plus очаква вашия подпис' },
  'BIBI Cars': { en: 'BIBI Cars', bg: 'BIBI Cars' },
  'Klaipeda, LT': { en: 'Klaipeda, LT', bg: 'Клайпеда, LT' },
  'Mercedes-Benz GLE 450 прибуло в порт': { en: 'Mercedes-Benz GLE 450 arrived at port', bg: 'Mercedes-Benz GLE 450 пристигна в пристанището' },
  'Near Port': { en: 'Near Port', bg: 'Близо до пристанището' },
  'Odesa, UA': { en: 'Odesa, UA', bg: 'Одеса, UA' },
  'Olha Tkachuk': { en: 'Olha Tkachuk', bg: 'Олга Ткачук' },
  'Tesla Model 3 доставлено': { en: 'Tesla Model 3 delivered', bg: 'Tesla Model 3 доставена' },
  'Ірина Петренко': { en: 'Iryna Petrenko', bg: 'Ирина Петренко' },
  'Авто': { en: 'Car', bg: 'Автомобил' },
  'Авто завантажено на судно': { en: 'Car loaded onto vessel', bg: 'Автомобилът е натоварен на кораб' },
  'Автомобіль у Клайпеді. Митне оформлення розпочато.': { en: 'Car in Klaipeda. Customs clearance started.', bg: 'Автомобилът е в Клайпеда. Митническото оформяне започна.' },
  'Автомобіль успішно передано. Дякуємо за вибір BIBI Cars!': { en: 'Car successfully handed over. Thank you for choosing BIBI Cars!', bg: 'Автомобилът е успешно предаден. Благодарим ви, че избрахте BIBI Cars!' },
  'Атлантичний океан': { en: 'Atlantic Ocean', bg: 'Атлантически океан' },
  'В дорозі': { en: 'In Transit', bg: 'На път' },
  'Ви виграли аукціон!': { en: 'You won the auction!', bg: 'Вие спечелихте търга!' },
  'Відплив з порту': { en: 'Departed from port', bg: 'Отплава от пристанището' },
  'Демо': { en: 'Demo', bg: 'Демо' },
  'Депозит за': { en: 'Deposit for', bg: 'Депозит за' },
  'Депозит за Audi Q7 Premium Plus 2024': { en: 'Deposit for Audi Q7 Premium Plus 2024', bg: 'Депозит за Audi Q7 Premium Plus 2024' },
  'Договір': { en: 'Contract', bg: 'Договор' },
  'Договір BIB-2026-0312 на Mercedes-Benz GLE 450 успішно підписано': { en: 'Contract BIB-2026-0312 for Mercedes-Benz GLE 450 successfully signed', bg: 'Договор BIB-2026-0312 за Mercedes-Benz GLE 450 е успешно подписан' },
  'Договір готовий до підпису': { en: 'Contract ready for signature', bg: 'Договорът е готов за подписване' },
  'Договір підписано': { en: 'Contract signed', bg: 'Договорът е подписан' },
  'Дякуємо за вибір': { en: 'Thank you for choosing', bg: 'Благодарим ви, че избрахте' },
  'Дякуємо за вибір BIBI Cars!': { en: 'Thank you for choosing BIBI Cars!', bg: 'Благодарим ви, че избрахте BIBI Cars!' },
  'Завантажено на судно': { en: 'Loaded onto vessel', bg: 'Натоварено на кораб' },
  'Здається, ви тут вперше': { en: 'It seems you\'re new here', bg: 'Изглежда, че сте тук за първи път' },
  'Знайдемо машину разом': { en: 'Let\'s find a car together', bg: 'Нека намерим кола заедно' },
  'Київ': { en: 'Kyiv', bg: 'Киев' },
  'Контракт підписано': { en: 'Contract signed', bg: 'Договорът е подписан' },
  'Лот': { en: 'Lot', bg: 'Лот' },
  'Лот Mercedes-Benz GLE 450 успішно придбано за': { en: 'Lot Mercedes-Benz GLE 450 successfully purchased for', bg: 'Лот Mercedes-Benz GLE 450 е успешно закупен за' },
  'Митне оформлення': { en: 'Customs clearance', bg: 'Митническо оформяне' },
  'Митне оформлення розпочато': { en: 'Customs clearance started', bg: 'Митническото оформяне започна' },
  'Митниця пройдена': { en: 'Customs passed', bg: 'Митницата е премината' },
  'Наближається до порту': { en: 'Approaching port', bg: 'Приближава пристанището' },
  'Олександр': { en: 'Oleksandr', bg: 'Александър' },
  'Олександр Демо': { en: 'Oleksandr Demo', bg: 'Александър Демо' },
  'Оплату отримано': { en: 'Payment received', bg: 'Плащането е получено' },
  'Перевірте свої контактні дані': { en: 'Check your contact details', bg: 'Проверете вашите данни за контакт' },
  'Передплата за': { en: 'Prepayment for', bg: 'Предплата за' },
  'Передплата за Mercedes-Benz GLE 450 2023': { en: 'Advance payment for Mercedes-Benz GLE 450 2023', bg: 'Авансово плащане за Mercedes-Benz GLE 450 2023' },
  'Платіж': { en: 'Payment', bg: 'Плащане' },
  'Платіж INV-2026-0421 на $30,640 зараховано': { en: 'Payment INV-2026-0421 for $30,640 credited', bg: 'Плащане INV-2026-0421 на стойност $30,640 е кредитирано' },
  'Платіж зараховано': { en: 'Payment credited', bg: 'Плащането е кредитирано' },
  'Повна оплата за': { en: 'Full payment for', bg: 'Пълно плащане за' },
  'Повна оплата за BMW X5 xDrive40i 2023': { en: 'Full payment for BMW X5 xDrive40i 2023', bg: 'Пълно плащане за BMW X5 xDrive40i 2023' },
  'Повна оплата за Tesla Model 3 Long Range 2022': { en: 'Full payment for Tesla Model 3 Long Range 2022', bg: 'Пълно плащане за Tesla Model 3 Long Range 2022' },
  'Прибув у порт': { en: 'Arrived at port', bg: 'Пристигна в пристанището' },
  'Підпишіть договір': { en: 'Sign the contract', bg: 'Подпишете договора' },
  'Рахунок': { en: 'Invoice', bg: 'Фактура' },
  'Рахунок INV-2026-0312 на $19,260 — оплатіть до 23.04.2026': { en: 'Invoice INV-2026-0312 for $19,260 — pay by 23.04.2026', bg: 'Фактура INV-2026-0312 на стойност $19,260 — платете до 23.04.2026' },
  'Рахунок на депозит за': { en: 'Invoice for deposit for', bg: 'Фактура за депозит за' },
  'Середина океану': { en: 'Mid-ocean', bg: 'Средата на океана' },
  'Судно прибуває в порт призначення': { en: 'Vessel arriving at destination port', bg: 'Корабът пристига в пристанището на местоназначение' },
  'Тесла Model 3 доставлено': { en: 'Tesla Model 3 delivered', bg: 'Тесла Model 3 доставена' },
  'зараховано': { en: 'credited', bg: 'кредитирано' },
  'оплатіть до': { en: 'pay by', bg: 'платете до' },
  'очікує вашого підпису': { en: 'awaits your signature', bg: 'очаква вашия подпис' },
  'прибуло в порт': { en: 'arrived at port', bg: 'пристигна в пристанището' },
  'успішно передано': { en: 'successfully handed over', bg: 'успешно предаден' },
  'успішно придбано за': { en: 'successfully purchased for', bg: 'успешно закупен за' },
  'успішно підписано': { en: 'successfully signed', bg: 'успешно подписан' },
  '⚓ Прибуття в порт': { en: '⚓ Arrived at Port', bg: '⚓ Пристигна в пристанището' },
  '⚓ Прибуття в порт Клайпеда': { en: '⚓ Arrived at Klaipeda Port', bg: '⚓ Пристигна в пристанище Клайпеда' },
  '✅ Автомобіль отримано': { en: '✅ Car received', bg: '✅ Автомобилът е получен' },
  '✓ Платіж зараховано': { en: '✓ Payment credited', bg: '✓ Плащането е кредитирано' },
  '🎉 Ви виграли аукціон!': { en: '🎉 You won the auction!', bg: '🎉 Вие спечелихте търга!' },
  '🏁 Дякуємо за вибір BIBI Cars!': { en: '🏁 Thank you for choosing BIBI Cars!', bg: '🏁 Благодарим ви, че избрахте BIBI Cars!' },
  '🏗 Розвантаження': { en: '🏗 Unloading', bg: '🏗 Разтоварване' },
  '🏗️ Розвантаження': { en: '🏗️ Unloading', bg: '🏗️ Разтоварване' },
  '📄 Договір готовий до підпису': { en: '📄 Contract ready for signature', bg: '📄 Договорът е готов за подписване' },
  '📋 Митниця пройдена': { en: '📋 Customs passed', bg: '📋 Митницата е премината' },
  '📍 Near Port': { en: '📍 Near Port', bg: '📍 Близо до пристанището' },
  '🚢 Mercedes-Benz GLE 450 прибуло в порт': { en: '🚢 Mercedes-Benz GLE 450 arrived at port', bg: '🚢 Mercedes-Benz GLE 450 пристигна в пристанището' },
};

// Sorted keys for substring replacement (longest first to win)
const SORTED_KEYS = Object.keys(SEED_DICT).sort((a, b) => b.length - a.length);

/**
 * Translate a seed string. Returns the original if unknown. Tries:
 *   1. Exact match
 *   2. Substring replacement (longest match first)
 */
export function tSeed(text, lang) {
  if (!text || typeof text !== 'string') return text;
  if (lang === 'uk' || !lang) return text;
  if (lang !== 'en' && lang !== 'bg') return text;
  // Exact match
  const exact = SEED_DICT[text];
  if (exact && exact[lang]) return exact[lang];
  // Substring substitution
  let result = text;
  for (const uk of SORTED_KEYS) {
    if (result.includes(uk)) {
      const tr = SEED_DICT[uk][lang];
      if (tr) result = result.split(uk).join(tr);
    }
  }
  return result;
}

const FIELD_NAMES = ['title', 'description', 'message', 'body', 'label', 'name', 'subtitle', 'text'];

/** Translate common string fields on an object. */
export function tSeedObject(obj, lang) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const f of FIELD_NAMES) {
    if (typeof out[f] === 'string') {
      out[f] = tSeed(out[f], lang);
    }
  }
  return out;
}

export default tSeed;
