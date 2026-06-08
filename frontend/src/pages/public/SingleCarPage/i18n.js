/**
 * Shared EN/BG dictionary for the Single Car page family.
 *
 * Imported by every component inside `SingleCarPage/` so we have ONE source
 * of truth for labels, breadcrumb crumbs, section titles, CTA copy, toast
 * messages, aria-labels, etc. Pages call `useLang()` and then `T[lang]`.
 *
 * Conventions:
 *   • Keys are camelCase + descriptive
 *   • `bg` mirrors `en` 1:1 — never let a key be missing in BG
 *   • Toast strings are full sentences; aria-labels are concise
 */
const T = {
  en: {
    // Breadcrumb + page states
    home: 'Home',
    catalog: 'Catalog',
    vehicle: 'Vehicle',
    loading: 'Loading…',
    loadingVehicleData: 'Loading vehicle data for',
    vinNotFound: 'VIN not found',
    vinNotFoundDesc:
      "We couldn't locate {vin} in any of the connected auctions. Please double-check the VIN or try a lot number from the header search.",
    couldNotLoad: "Couldn't load this vehicle",
    unexpectedErr: 'Unexpected error format.',
    tryAgain: 'Try again',
    browseCatalog: 'Browse catalog',

    // Navigation header icons (aria)
    shareCar: 'Share car',
    addToCompare: 'Add to compare',
    removeFromCompare: 'Remove from compare',
    addToFavorites: 'Add to favorites',
    removeFromFavorites: 'Remove from favorites',

    // Image grid
    tradedChip: 'TRADED',
    vehicleInformation: 'Vehicle information',
    auctionDetails: 'Auction details',
    description: 'Description',
    brand: 'Brand',
    model: 'Model',
    year: 'Year',
    mileage: 'Mileage',
    damage: 'Damage',
    location: 'Location',
    fuel: 'Fuel',
    transmission: 'Transmission',
    bodyType: 'Body type',
    driveType: 'Drive type',
    engineVolume: 'Engine volume',
    lot: 'LOT',
    vin: 'VIN',
    auction: 'Auction',
    updated: 'Updated',
    bidPrice: 'Bid price',
    estimatedTotalPrice: 'Estimated total price',
    exactCostInBulgaria: 'exact cost in Bulgaria',
    openPhotoGallery: 'Open photo gallery',
    photo: 'Photo',
    showAllPhotos: 'Show all {count} photos',
    allImages: 'All images',
    closeGallery: 'Close gallery',
    previousPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
    photoGallery: 'Photo gallery',
    galleryPagination: 'Gallery pagination',

    // Cost calculator
    costCalculatorPart1: 'Cost ',
    costCalculatorPart2: 'calculator',
    costCalculatorPart3: 'FOR THIS CAR',
    allKeyParameters:
      'All key parameters are pre-filled from the auction listing. Adjust if needed and get your total import cost to Bulgaria.',
    preFilledFromAuction: 'PRE-FILLED FROM AUCTION',
    auctionLbl: 'Auction',
    carLbl: 'Car',
    fuelTypeLbl: 'Fuel type',
    mileageLbl: 'Mileage',
    costEstimate: 'Cost Estimate',
    vehiclePurchasePrice: 'Vehicle purchase price ',
    fillTheSum: 'Fill the sum',
    auctionFee: 'Auction fee',
    carAndAuction: 'CAR & AUCTION',
    portLoadingHandling: 'Port loading & handling (USA)',
    oceanFreight: 'Ocean freight (vessel)',
    marineInsurance: 'Marine insurance',
    portHandlingBulgaria: 'Port handling in Bulgaria',
    logisticsToBulgaria: 'LOGISTICS TO BULGARIA',
    customsDuty: 'Customs duty (import tax)',
    vatBulgaria: 'VAT Bulgaria (20%)',
    bibiServiceFee: 'BIBI service fee',
    transportToBulgaria: 'Transport to Bulgaria',
    technotest: 'Technotest (BG registration)',
    customsAndFinalFees: 'CUSTOMS & FINAL FEES',
    totalApproximateCost: 'TOTAL APPROXIMATE COST',
    approximateEstimate: 'Approximate estimate',
    approximateEstimateRest:
      '. Final cost depends on actual auction result, current freight rates and individual customs assessment. Contact BIBI for a precise binding quote.',
    iWantCompleteCalculation: 'I want a complete calculation',

    // Navigation footer
    goBackToCatalog: 'go back to catalog',
    haveAQuestion: 'Have a question?',
    contactUs: 'Contact us',

    // Similar cars
    similarPart1: 'Similar ',
    similarPart2: 'Cars',
    previous: 'Previous',
    next: 'Next',

    // CarCard
    purchasePrice: 'Purchase price',
    engine: 'engine',
    drive: 'drive',
    estimatedFinalCostToBulgaria: 'Estimated final cost to Bulgaria:',
    moreDetails: 'More details',
    auctionTba: 'Auction TBA',
    tradingDate: 'Trading date',
    auctionPrefix: 'Auction',
    closed: 'Closed',

    // Toasts
    signInToSaveFavorites: 'Sign in to save favorites',
    signInToCompareCars: 'Sign in to compare cars',
    signInBtn: 'Sign in',
    pleaseSignInAgain: 'Please sign in again',
    addedToFavorites: 'Added to favorites',
    removedFromFavorites: 'Removed from favorites',
    addedToCompare: 'Added to compare',
    addedToCompareNeedMore: 'Added to compare',
    compareNeedMoreDesc: 'Add at least 1 more car to start comparing',
    compareReadyTitle: 'Ready to compare!',
    compareReadyDesc: '2 cars selected — open the comparison view',
    compareFullTitle: 'Compare list is full (3/3)',
    compareFullDesc: 'Open the comparison view or remove a car to add another',
    removedFromCompare: 'Removed from compare',
    openCompareBtn: 'Open compare',
    couldNotUpdateFavorites: 'Could not update favorites',
    couldNotUpdateCompare: 'Could not update compare',
  },

  bg: {
    // Breadcrumb + page states
    home: 'Начало',
    catalog: 'Каталог',
    vehicle: 'Автомобил',
    loading: 'Зареждане…',
    loadingVehicleData: 'Зареждане на данни за',
    vinNotFound: 'VIN не е намерен',
    vinNotFoundDesc:
      'Не успяхме да открием {vin} в нито един от свързаните аукциони. Моля, проверете отново VIN или опитайте номер на лот от търсачката в хедъра.',
    couldNotLoad: 'Не успяхме да заредим този автомобил',
    unexpectedErr: 'Неочакван формат на грешка.',
    tryAgain: 'Опитайте отново',
    browseCatalog: 'Преглед на каталога',

    // Navigation header icons (aria)
    shareCar: 'Сподели автомобила',
    addToCompare: 'Добави към сравнение',
    removeFromCompare: 'Премахни от сравнение',
    addToFavorites: 'Добави в любими',
    removeFromFavorites: 'Премахни от любими',

    // Image grid
    tradedChip: 'ТЪРГУВАН',
    vehicleInformation: 'Информация за автомобила',
    auctionDetails: 'Детайли за аукциона',
    description: 'Описание',
    brand: 'Марка',
    model: 'Модел',
    year: 'Година',
    mileage: 'Пробег',
    damage: 'Щети',
    location: 'Локация',
    fuel: 'Гориво',
    transmission: 'Скоростна кутия',
    bodyType: 'Тип каросерия',
    driveType: 'Задвижване',
    engineVolume: 'Обем на двигателя',
    lot: 'ЛОТ',
    vin: 'VIN',
    auction: 'Аукцион',
    updated: 'Обновено',
    bidPrice: 'Цена на наддаване',
    estimatedTotalPrice: 'Прогнозна обща цена',
    exactCostInBulgaria: 'точна цена в България',
    openPhotoGallery: 'Отвори галерията със снимки',
    photo: 'Снимка',
    showAllPhotos: 'Покажи всички {count} снимки',
    allImages: 'Всички снимки',
    closeGallery: 'Затвори галерията',
    previousPhoto: 'Предишна снимка',
    nextPhoto: 'Следваща снимка',
    photoGallery: 'Галерия със снимки',
    galleryPagination: 'Пагинация на галерията',

    // Cost calculator
    costCalculatorPart1: 'Калкулатор ',
    costCalculatorPart2: 'на цена',
    costCalculatorPart3: 'ЗА ТОЗИ АВТОМОБИЛ',
    allKeyParameters:
      'Всички ключови параметри са попълнени автоматично от обявата на аукциона. Коригирайте при нужда и вижте общата цена за внос в България.',
    preFilledFromAuction: 'ПОПЪЛНЕНО ОТ АУКЦИОНА',
    auctionLbl: 'Аукцион',
    carLbl: 'Автомобил',
    fuelTypeLbl: 'Тип гориво',
    mileageLbl: 'Пробег',
    costEstimate: 'Прогноза на разходите',
    vehiclePurchasePrice: 'Покупна цена на автомобила ',
    fillTheSum: 'Въведете сумата',
    auctionFee: 'Такса на аукциона',
    carAndAuction: 'АВТОМОБИЛ И АУКЦИОН',
    portLoadingHandling: 'Натоварване и обработка в пристанище (САЩ)',
    oceanFreight: 'Морски транспорт (кораб)',
    marineInsurance: 'Морска застраховка',
    portHandlingBulgaria: 'Пристанищна обработка в България',
    logisticsToBulgaria: 'ЛОГИСТИКА ДО БЪЛГАРИЯ',
    customsDuty: 'Митническа такса (импортно мито)',
    vatBulgaria: 'ДДС България (20%)',
    bibiServiceFee: 'Такса за услуги BIBI',
    transportToBulgaria: 'Транспорт до България',
    technotest: 'Технически преглед (BG регистрация)',
    customsAndFinalFees: 'МИТНИЦА И КРАЙНИ ТАКСИ',
    totalApproximateCost: 'ОБЩА ПРИБЛИЗИТЕЛНА ЦЕНА',
    approximateEstimate: 'Приблизителна оценка',
    approximateEstimateRest:
      '. Крайната цена зависи от резултата на аукциона, актуалните навла и индивидуалната митническа оценка. Свържете се с BIBI за точна обвързваща оферта.',
    iWantCompleteCalculation: 'Искам пълно изчисление',

    // Navigation footer
    goBackToCatalog: 'обратно към каталога',
    haveAQuestion: 'Имате въпрос?',
    contactUs: 'Свържете се с нас',

    // Similar cars
    similarPart1: 'Подобни ',
    similarPart2: 'Автомобили',
    previous: 'Предишен',
    next: 'Следващ',

    // CarCard
    purchasePrice: 'Покупна цена',
    engine: 'двигател',
    drive: 'задвижване',
    estimatedFinalCostToBulgaria: 'Прогнозна крайна цена в България:',
    moreDetails: 'Повече детайли',
    auctionTba: 'Аукцион предстои',
    tradingDate: 'Дата на търг',
    auctionPrefix: 'Аукцион',
    closed: 'Закрит',

    // Toasts
    signInToSaveFavorites: 'Влезте, за да запазите в любими',
    signInToCompareCars: 'Влезте, за да сравнявате автомобили',
    signInBtn: 'Влез',
    pleaseSignInAgain: 'Моля, влезте отново',
    addedToFavorites: 'Добавено в любими',
    removedFromFavorites: 'Премахнато от любими',
    addedToCompare: 'Добавено за сравнение',
    addedToCompareNeedMore: 'Добавено за сравнение',
    compareNeedMoreDesc: 'Добавете още поне 1 автомобил, за да започнете сравнението',
    compareReadyTitle: 'Готово за сравнение!',
    compareReadyDesc: 'Избрани са 2 автомобила — отворете изгледа за сравнение',
    compareFullTitle: 'Списъкът за сравнение е пълен (3/3)',
    compareFullDesc: 'Отворете сравнението или премахнете автомобил, за да добавите друг',
    removedFromCompare: 'Премахнато от сравнение',
    openCompareBtn: 'Отвори сравнение',
    couldNotUpdateFavorites: 'Не успяхме да обновим любими',
    couldNotUpdateCompare: 'Не успяхме да обновим сравнението',
  },
};

export default T;

/** Convenience wrapper — returns the active language slice. */
export function useSingleCarT(lang) {
  return lang === 'bg' ? T.bg : T.en;
}
