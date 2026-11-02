import { expect, test } from '@playwright/test';
import { createContact, createWorkspace, expectAccessible, signOut, signUp, uniqueEmail } from './support';

// E2E-03: a User who is not a Member cannot see another Workspace or its Contacts, even with the URLs.
test('E2E-03 Workspace isolation', async ({ page }) => {
  await signUp(page, 'Lastnica Zasebna', uniqueEmail('lastnica'));
  await createWorkspace(page, 'Zasebni projekt');
  const workspaceUrl = page.url();
  await createContact(page, { firstName: 'Tajna', lastName: 'Oseba', email: 'tajna@example.si' });
  await expect(page.getByRole('heading', { name: 'Tajna Oseba' })).toBeVisible();
  const contactUrl = page.url();
  await signOut(page);

  await page.goto(contactUrl);
  await expect(page.getByRole('heading', { name: 'Prijava' })).toBeVisible();
  await expect(page.getByText('Tajna')).toHaveCount(0);

  await signUp(page, 'Radoveden Tujec', uniqueEmail('tujec'));
  await expect(page.getByText('Še niste član nobenega delovnega prostora.')).toBeVisible();
  for (const url of [workspaceUrl, contactUrl, `${contactUrl}/zgodovina`, `${workspaceUrl}/clani`]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Ni najdeno' })).toBeVisible();
    await expect(page.getByText('Tajna')).toHaveCount(0);
    await expect(page.getByText('Zasebni projekt')).toHaveCount(0);
  }
  await expectAccessible(page);
});
