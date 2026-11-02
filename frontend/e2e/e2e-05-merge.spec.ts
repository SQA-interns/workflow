import { expect, test } from '@playwright/test';
import { createContact, createWorkspace, expectAccessible, goTo, signUp, uniqueEmail } from './support';

// E2E-05: two Contacts of the same person are found as duplicates and merged into one.
test('E2E-05 Merge from the Duplicates page', async ({ page }) => {
  await signUp(page, 'Maja Združi', uniqueEmail('maja'));
  await createWorkspace(page, 'Dvojniki');
  await createContact(page, { firstName: 'Janez', lastName: 'Novak', email: 'janez@example.si', tags: 'stranka' });
  await expect(page.getByRole('heading', { name: 'Janez Novak' })).toBeVisible();

  await goTo(page, 'Kontakti');
  await createContact(page, { firstName: 'janez', lastName: 'novak', phone: '041 555 666', city: 'Kranj', tags: 'udelezenec2025' });
  await expect(page.getByText('Kontakt je shranjen, vendar je podoben obstoječim kontaktom:')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Janez Novak' })).toBeVisible();

  await goTo(page, 'Dvojniki');
  const group = page.getByRole('article', { name: 'Skupina dvojnikov 1' });
  await expect(group.getByText('Ime in priimek: janez novak')).toBeVisible();
  await expectAccessible(page);

  await group.getByRole('button', { name: 'Združi skupino 1' }).click();
  const dialog = page.getByRole('dialog', { name: 'Združi kontakte' });
  await dialog.getByLabel('Ohrani Janez Novak (janez@example.si)').check();
  await expect(dialog.getByLabel('Kraj: Kranj')).toBeChecked();
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Potrdi združitev' }).click();
  await expect(page.getByText('Kontakti so združeni v »Janez Novak«.')).toBeVisible();
  await expect(page.getByText('Ni najdenih dvojnikov.')).toBeVisible();

  await goTo(page, 'Kontakti');
  await expect(page.getByText('Najdenih: 1')).toBeVisible();
  await page.getByRole('link', { name: 'Janez Novak' }).click();
  await expect(page.getByText('Kranj', { exact: true })).toBeVisible();
  await expect(page.getByText('041 555 666')).toBeVisible();
  await expect(page.getByText('stranka', { exact: true })).toBeVisible();
  await expect(page.getByText('udelezenec2025', { exact: true })).toBeVisible();

  await goTo(page, 'Izbrisani kontakti');
  await page.getByRole('link', { name: 'janez novak' }).click();
  await expect(page.getByText('Kontakt je izbrisan.')).toBeVisible();
  await page.getByRole('link', { name: 'ohranjeni kontakt' }).click();
  await expect(page.getByRole('heading', { name: 'Janez Novak' })).toBeVisible();
});
