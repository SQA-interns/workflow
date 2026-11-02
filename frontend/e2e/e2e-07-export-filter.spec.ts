import { expect, test } from '@playwright/test';
import { createContact, createWorkspace, goTo, signUp, uniqueEmail, workbookText } from './support';

// E2E-07: with nothing selected, Export takes every Contact matching the current search and filters.
test('E2E-07 Export of a filtered list', async ({ page }) => {
  await signUp(page, 'Filip Filter', uniqueEmail('filip'));
  await createWorkspace(page, 'Filtri');
  const people: [string, string, string][] = [
    ['Saša', 'Kranjc', 'udelezenec2025'],
    ['Tina', 'Bela', 'udelezenec2025'],
    ['Urban', 'Zelen', 'drugo'],
  ];
  for (const [first, last, tag] of people) {
    await createContact(page, { firstName: first, lastName: last, tags: tag, company: '=1+1' });
    await expect(page.getByRole('heading', { name: `${first} ${last}` })).toBeVisible();
    await goTo(page, 'Kontakti');
  }
  await page.getByLabel('Oznake', { exact: true }).fill('udelezenec2025');
  await expect(page.getByText('Najdenih: 2')).toBeVisible();
  expect(page.url()).toContain('tag=udelezenec2025');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Izvozi vse najdene (2)' }).click();
  const text = await workbookText(await (await downloadPromise).path());
  expect(text).toContain('Kranjc');
  expect(text).toContain('Bela');
  expect(text).not.toContain('Zelen');
  expect(text).toContain('=1+1');
  expect(text).not.toContain('<f>');

  await page.getByLabel('Iskanje', { exact: true }).fill('sasa');
  await expect(page.getByText('Najdenih: 1')).toBeVisible();
  const second = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Izvozi vse najdene (1)' }).click();
  const text2 = await workbookText(await (await second).path());
  expect(text2).toContain('Kranjc');
  expect(text2).not.toContain('Bela');
});
