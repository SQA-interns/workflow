import { expect, test } from '@playwright/test';
import { createContact, createWorkspace, expectAccessible, signUp, uniqueEmail } from './support';

// E2E-04: an Editor changes a Contact, reads the history and restores the first Revision.
test('E2E-04 history and Restore', async ({ page }) => {
  await signUp(page, 'Rok Zgodovina', uniqueEmail('rok'));
  await createWorkspace(page, 'Zgodovina');
  await createContact(page, { firstName: 'Mojca', lastName: 'Pokrajculja', city: 'Celje', tags: 'stara' });
  await expect(page.getByRole('heading', { name: 'Mojca Pokrajculja' })).toBeVisible();

  await page.getByRole('link', { name: 'Uredi' }).click();
  await page.getByLabel('Kraj').fill('Maribor');
  await page.getByLabel('Oznake (ločene s presledkom)').fill('nova');
  await page.getByRole('button', { name: 'Shrani' }).click();
  await expect(page.getByText('Maribor')).toBeVisible();

  await page.getByRole('link', { name: 'Zgodovina sprememb' }).click();
  const rev2 = page.getByRole('listitem', { name: 'Revizija 2' });
  await expect(rev2.getByRole('heading')).toHaveText('Revizija 2: Spremenjen');
  await expect(rev2.getByRole('row', { name: /Kraj/ })).toContainText('Celje');
  await expect(rev2.getByRole('row', { name: /Kraj/ })).toContainText('Maribor');
  await expect(rev2.getByRole('row', { name: /Oznaka.*nova/ })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Obnovi revizijo 1' }).click();
  await expect(page.getByText('Revizija 1 je obnovljena kot nova revizija.')).toBeVisible();
  const rev3 = page.getByRole('listitem', { name: 'Revizija 3' });
  await expect(rev3.getByRole('heading')).toHaveText('Revizija 3: Obnovljen');
  await expect(rev3.getByRole('row', { name: /Kraj/ })).toContainText('Celje');

  await page.getByRole('link', { name: 'Nazaj na kontakt' }).click();
  await expect(page.getByRole('heading', { name: 'Mojca Pokrajculja', exact: true })).toBeVisible();
  await expect(page.getByText('Celje', { exact: true })).toBeVisible();
  await expect(page.getByText('stara', { exact: true })).toBeVisible();
  await expect(page.getByText('Različica 3')).toBeVisible();
  await expectAccessible(page);
});
