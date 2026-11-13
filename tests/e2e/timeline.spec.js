// T2.5: timeline scrubber — keyboard, drag, tap a marker, next/previous; readout + list highlight follow.
import { test, expect } from '@playwright/test';
import { prepare, fresh, seedFinished, expectNoOverflow, ART } from './helpers.js';

test('timeline scrubber: keyboard, markers and next/previous update the readout', async ({ page }) => {
  const errors = await prepare(page);
  await fresh(page);
  await seedFinished(page);
  await page.goto('/#timeline');
  await page.reload();
  const read = page.locator('.sc-read');
  const range = page.locator('.sc-range');
  await expect(read.locator('.sc-stage')).toHaveText('Today');
  await expect(range).toHaveAttribute('aria-valuetext', /, age \d+: pot about /);

  // Keyboard: focus, arrow right moves a month; End goes to stop-work; Home back to today.
  await range.focus();
  const d0 = await read.locator('.sc-date').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(read.locator('.sc-date')).not.toHaveText(d0);
  await page.keyboard.press('End');
  await expect(read.locator('.sc-date')).toContainText('age 55');
  await expect(page.locator('.tl-i.cur .tl-l')).toHaveText('Stop work at 55');
  await page.keyboard.press('Home');
  await expect(read.locator('.sc-stage')).toHaveText('Today');

  // Next ›: jumps to the next moment (Speedbird training starts, Sep 2027), springing there.
  await page.getByRole('button', { name: 'Next moment' }).click();
  await expect(read.locator('.sc-date')).toContainText('Sep 2027', { timeout: 2000 });
  await expect(read.locator('.sc-stage')).toHaveText('Speedbird training starts');
  await expect(page.locator('.tl-i.cur .tl-l')).toHaveText('Speedbird training starts');
  await page.getByRole('button', { name: 'Previous moment' }).click();
  await expect(read.locator('.sc-stage')).toHaveText('Today');

  // Tap near a marker on the track → the thumb goes there and snaps onto the moment.
  const mk = page.locator('.sc-mk[data-label="Dirt-bike trip"]');
  const mb = await mk.boundingBox();
  await page.mouse.click(mb.x + mb.width / 2 + 1, mb.y + mb.height / 2);
  await expect(read.locator('.sc-here')).toContainText('Dirt-bike trip', { timeout: 2000 });
  await expect(page.locator('.sc-mk[data-label="Speedbird training starts"]')).toHaveClass(/\bon\b/);

  // Drag the thumb to ~75%.
  const box = await range.boundingBox();
  await page.mouse.move(box.x + 14, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const v = Number(await range.inputValue());
  const max = Number(await range.getAttribute('max'));
  expect(v / max).toBeGreaterThan(0.6);
  await expectNoOverflow(page, 'timeline');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${ART}/timeline-scrub.png` });
  expect(errors).toEqual([]);
});

test('timeline scrubber: reduced motion jumps without tweening', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page);
  await fresh(page);
  await seedFinished(page);
  await page.goto('/#timeline');
  await page.reload();
  await page.getByRole('button', { name: 'Next moment' }).click();
  // Immediately (no animation frames needed) the readout is at the stop.
  await expect(page.locator('.sc-stage')).toHaveText('Speedbird training starts', { timeout: 200 });
});
