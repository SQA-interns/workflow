import { expect, test } from '@playwright/test';
import { createContact, createWorkspace, expectAccessible, goTo, signUp, tabTo, uniqueEmail } from './support';

// E2E-01: a new User creates a Workspace and its first Contact with Attributes and Tags.
test('E2E-01 first Contact in a new Workspace', async ({ page }) => {
  await signUp(page, 'Ana Kovač', uniqueEmail('ana'));
  await expectAccessible(page);
  await createWorkspace(page, 'Konferenca 2025');
  await expect(page.getByText('Lastnik')).toBeVisible();

  await createContact(page, {
    firstName: 'Saša',
    lastName: 'Šuštar',
    email: 'sasa.sustar@example.si',
    phone: '+386 41 111 222',
    company: 'Žito d.o.o.',
    city: 'Ljubljana',
    country: 'si',
    attributes: [['kompetenca', 'spletnoProgramiranje']],
    tags: 'udelezenec2025 neObvescaj',
  });
  await expect(page.getByRole('heading', { name: 'Saša Šuštar' })).toBeVisible();
  await expect(page.getByText('spletnoProgramiranje')).toBeVisible();
  await expect(page.getByText('SI', { exact: true })).toBeVisible();
  await expectAccessible(page);

  await goTo(page, 'Kontakti');
  await expect(page.getByRole('link', { name: 'Saša Šuštar' })).toBeVisible();
  await expectAccessible(page);

  await goTo(page, 'Oznake');
  await expect(page.getByRole('row', { name: /udelezenec2025\s+1/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /neObvescaj\s+1/ })).toBeVisible();
  await expectAccessible(page);

  // NFR-06: the main flow works with the keyboard alone.
  await goTo(page, 'Kontakti');
  await page.locator('body').focus();
  await tabTo(page, 'Nov kontakt');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Nov kontakt' })).toBeVisible();
  await tabTo(page, 'Ime');
  await page.keyboard.type('Tipko');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Brez Miške');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Tipko Brez Miške' })).toBeVisible();
  await tabTo(page, 'Zgodovina sprememb');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listitem', { name: 'Revizija 1' })).toBeVisible();
});
