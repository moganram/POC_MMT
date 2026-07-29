// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Calculates a Date N days from today with time zeroed out.
 * @param {number} n
 * @returns {Date}
 */
function daysFromToday(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Generates attribute selectors matching MakeMyTrip's aria-label formats.
 * @param {Date} date
 * @returns {string}
 */
function getCalendarDateSelector(date) {
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  const paddedDay = String(day).padStart(2, '0');
  const year = date.getFullYear();

  return `div.DayPicker-Day[aria-label*="${month} ${paddedDay} ${year}"], div.DayPicker-Day[aria-label*="${month} ${day} ${year}"], div[role="gridcell"][aria-label*="${month} ${paddedDay} ${year}"]`;
}

/**
 * Converts JS Date to MMT URL Itinerary Date format (DD/MM/YYYY)
 * @param {Date} date
 * @returns {string}
 */
function toUrlDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/**
 * Dismisses common popup banners on MMT homepage & results page.
 * @param {import('@playwright/test').Page} page
 */
async function dismissBanners(page) {
  const dismissSelectors = [
    'span.commonModal__close',
    'div.commonModal__close',
    '.latestOffersModalClose',
    'button:has-text("NOT NOW")',
    '[data-cy="closeModal"]',
    '.close',
    'span.bgProperties',
    'div[class*="overlay"] span[class*="close"]'
  ];

  for (const selector of dismissSelectors) {
    try {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 1000 })) {
        await element.click({ force: true });
        await page.waitForTimeout(300);
      }
    } catch {
      // Banner not present
    }
  }
}

/**
 * Handles city auto-suggest selection.
 * @param {import('@playwright/test').Page} page
 * @param {string} fieldId
 * @param {string} searchText
 * @param {RegExp} matchRegex
 */
async function selectCity(page, fieldId, searchText, matchRegex) {
  await page.locator(`#${fieldId}`).first().click({ force: true });

  const overlayInput = page.locator('input[placeholder="From"], input[placeholder="To"]').first();
  await overlayInput.waitFor({ state: 'visible', timeout: 5000 });
  await overlayInput.fill(searchText);

  const option = page.locator('#react-autowhatsoever-1-section-0-item-0, li[role="option"]')
    .filter({ hasText: matchRegex })
    .first();

  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.click();
}

/**
 * Navigates calendar and selects target date safely.
 * @param {import('@playwright/test').Page} page
 * @param {Date} targetDate
 */
async function selectCalendarDate(page, targetDate) {
  const calendarContainer = page.locator('.DayPicker-wrapper, .datePickerContainer, div.DayPicker').first();
  if (!(await calendarContainer.isVisible().catch(() => false))) {
    const depInput = page.locator('label[for="departure"], div[data-cy="departure"]').first();
    await depInput.click({ force: true });
  }

  await calendarContainer.waitFor({ state: 'visible', timeout: 5000 });

  const dateSelector = getCalendarDateSelector(targetDate);
  const nextMonthBtn = page.locator('.DayPicker-NavButton--next, span[aria-label="Next Month"]').first();
  const dayCell = page.locator(dateSelector).first();

  for (let i = 0; i < 12; i++) {
    if (await dayCell.isVisible().catch(() => false)) {
      const isDisabled = await dayCell.getAttribute('aria-disabled');
      if (isDisabled !== 'true') {
        await dayCell.scrollIntoViewIfNeeded();
        await dayCell.click({ force: true });
        return;
      }
    }

    if (await nextMonthBtn.isVisible().catch(() => false)) {
      await nextMonthBtn.click({ force: true });
      await page.waitForTimeout(300);
    } else {
      break;
    }
  }

  throw new Error(`Could not find or select calendar date: ${targetDate.toDateString()}`);
}

test('Automate Round-Trip Flight Search and Validate Prices', async ({ page }) => {
  // Set extended timeout for slow network calls
  test.setTimeout(90000);

  // Target dates: +9 days (Departure) & +16 days (Return) from today
  const depDate = daysFromToday(9);
  const retDate = daysFromToday(16);

  console.log(`[TEST] Departure Date: ${toUrlDate(depDate)} | Return Date: ${toUrlDate(retDate)}`);

  // 1. Open Site
  await page.goto('https://www.makemytrip.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissBanners(page);

  // 2. Select Round Trip
  const roundTripRadio = page.getByText('Round Trip', { exact: true }).first();
  await roundTripRadio.click({ force: true });

  // 3. Auto-Suggest Origin & Destination
  await selectCity(page, 'fromCity', 'DEL', /New Delhi/i);
  await selectCity(page, 'toCity', 'beng', /Bengaluru/i);

  // 4. Select Departure & Return Dates (+9d & +16d)
  await selectCalendarDate(page, depDate);
  await selectCalendarDate(page, retDate);

  // 5. Select Passengers (2 Adults) & Cabin Class (Economy)
  const travellerWidget = page.locator('div[data-cy="flightTravellersOnly"], label[for="travellers"]').first();
  await travellerWidget.click({ force: true });

  const adult2Option = page.locator('li[data-cy="adults-2"], ul.guestCounter li[data-cy="adults-2"]').first();
  await adult2Option.click({ force: true });

  // Select Cabin Class safely
  const economyCard = page.locator('li[data-cy="travelClass-0"], div[data-cy="cabinClassCard-0"], li:has-text("Economy")').first();
  if (await economyCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await economyCard.scrollIntoViewIfNeeded();
    await economyCard.click({ force: true });
  }

  // Click Apply
  const applyBtn = page.locator('button[data-cy="travellerApplyBtn"]').first();
  await applyBtn.scrollIntoViewIfNeeded();
  await applyBtn.click({ force: true });

  // 6. Click Search
  const searchBtn = page.locator('p[data-cy="submit"] a.widgetSearchBtn, a.primaryBtn').first();
  await searchBtn.scrollIntoViewIfNeeded();
  await searchBtn.click({ force: true });

  // Wait for navigation to search results URL
  await page.waitForURL(/\/flight\/search/i, { timeout: 45000 });

  // Clear any popups that appear on search results screen
  await dismissBanners(page);

  // ============================================================
  // VALIDATIONS & PRICE EXTRACTION
  // ============================================================

  // Validation 1: URL Itinerary contains computed parameters
  const currentUrl = page.url();
  expect(currentUrl).toContain(toUrlDate(depDate));
  expect(currentUrl).toContain(toUrlDate(retDate));

  // Validation 2: Ensure flight results listing container or card elements load
  const listingContainer = page.locator([
    'div.flightsContainer',
    'div.listingV4Page',
    'div.flightBody',
    'div.splitV2',
    'div.listingCardContainer',
    'div[class*="clusterView"]',
    'div[class*="listingCard"]'
  ].join(', ')).first();

  await listingContainer.waitFor({ state: 'attached', timeout: 40000 });
  await dismissBanners(page);

  // Validation 3: Verify Result Cards exist
  const flightCards = page.locator('div.listingCard, div[class*="listingCard"], div.makeFlex.spaceBetween, div[class*="cluster"]');
  await flightCards.first().waitFor({ state: 'visible', timeout: 20000 });

  const cardCount = await flightCards.count();
  console.log(`[RESULT] Total Flight Cards Found: ${cardCount}`);
  expect(cardCount).toBeGreaterThan(0);

  // Validation 4: Price Extraction & JS Minimum Price Verification
  const priceElements = page.locator('span[class*="price"], div[class*="price"], p[class*="price"]');
  await priceElements.first().waitFor({ state: 'visible', timeout: 10000 });

  const rawPrices = await priceElements.allInnerTexts();
  const numericPrices = rawPrices
    .map((p) => parseInt(p.replace(/[^0-9]/g, ''), 10))
    .filter((n) => !isNaN(n) && n > 1000);

  expect(numericPrices.length).toBeGreaterThan(0);

  const jsMinPrice = Math.min(...numericPrices);
  console.log(`[RESULT] Extracted ${numericPrices.length} price nodes.`);
  console.log(`[RESULT] Computed Minimum Flight Price: ₹${jsMinPrice}`);

  // Validation 5: Cross-check against "Cheapest" tag if present
  const cheapestBadge = page.locator('text=/Cheapest/i').first();
  if (await cheapestBadge.isVisible().catch(() => false)) {
    const cheapestCard = cheapestBadge.locator('xpath=ancestor::div[contains(@class, "listingCard") or contains(@class, "cluster")]').first();
    const cheapestPriceText = await cheapestCard.locator('span[class*="price"], div[class*="price"]').first().innerText();
    const cheapestPriceNum = parseInt(cheapestPriceText.replace(/[^0-9]/g, ''), 10);

    expect(cheapestPriceNum).toEqual(jsMinPrice);
    console.log(`[VALIDATION PASSED] "Cheapest" tag (₹${cheapestPriceNum}) matches JS minimum price (₹${jsMinPrice}).`);
  } else {
    console.log('[VALIDATION PASSED] Extracted prices processed successfully.');
  }
});