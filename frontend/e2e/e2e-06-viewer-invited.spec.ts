import { expect, test } from '@playwright/test';
import {
  createContact,
  createWorkspace,
  expectAccessible,
  goTo,
  signIn,
  signOut,
  signUp,
  uniqueEmail,
  verifyEmail,
} from './support';

// E2E-06: an Owner invites a person who has not signed up yet as Viewer; after sign-up and email
// verification the Viewer reads, searches and exports, but sees no changing controls.
test('E2E-06 Viewer invited before sign-up', async ({ page }) => {
  const viewerEmail = uniqueEmail('bralec');
  await signUp(page, 'Lastnik Vabi', uniqueEmail('lastnik'));
  await createWorkspace(page, 'Skupni imenik');
  await createContact(page, { firstName: 'Zala', lastName: 'Žagar', tags: 'vip' });
  await expect(page.getByRole('heading', { name: 'Zala Žagar' })).toBeVisible();

  await goTo(page, 'Člani');
  await page.getByLabel('E-pošta člana').fill(viewerEmail.toUpperCase());
  await page.getByLabel('Vloga', { exact: true }).selectOption('VIEWER');
  await page.getByRole('button', { name: 'Dodaj' }).click();
  await expect(page.getByText(/Povabilo je ustvarjeno/)).toBeVisible();
  await expect(page.getByText(viewerEmail.toUpperCase())).toBeVisible();
  await expectAccessible(page);
  await signOut(page);

  await signUp(page, 'Bralec Novi', viewerEmail);
  await expect(page.getByText('Še niste član nobenega delovnega prostora.')).toBeVisible();
  await signOut(page);
  await verifyEmail(viewerEmail);
  await signIn(page, viewerEmail);

  await page.getByRole('link', { name: 'Skupni imenik' }).click();
  await expect(page.getByRole('navigation', { name: 'Delovni prostor' }).getByText('Bralec')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nov kontakt' })).toHaveCount(0);
  await page.getByLabel('Iskanje', { exact: true }).fill('zagar');
  await expect(page.getByText('Najdenih: 1')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Izvozi vse najdene (1)' }).click();
  expect((await download).suggestedFilename()).toMatch(/^Skupni-imenik-\d{4}-\d{2}-\d{2}\.xlsx$/);

  await page.getByRole('link', { name: 'Zala Žagar' }).click();
  await expect(page.getByRole('heading', { name: 'Zala Žagar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Uredi' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Izbriši' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Zgodovina sprememb' }).click();
  await expect(page.getByRole('listitem', { name: 'Revizija 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Obnovi/ })).toHaveCount(0);

  await goTo(page, 'Člani');
  await expect(page.getByRole('button', { name: 'Dodaj' })).toHaveCount(0);
  await expect(page.getByText('Ni čakajočih povabil.')).toBeVisible();
  await goTo(page, 'Oznake');
  await expect(page.getByRole('button', { name: /Preimenuj/ })).toHaveCount(0);
});
