import { expect, test } from '@playwright/test';
import { createContact, createWorkspace, expectAccessible, goTo, signUp, uniqueEmail, workbookText } from './support';

// E2E-02: a Member selects Contacts with checkboxes and exports exactly those.
test('E2E-02 Export of selected Contacts', async ({ page }) => {
  await signUp(page, 'Eva Izvoz', uniqueEmail('eva'));
  await createWorkspace(page, 'Izvoz Škofja Loka');
  for (const [first, last] of [
    ['Ana', 'Avsec'],
    ['Bor', 'Bizjak'],
    ['Cvetka', 'Čuk'],
  ]) {
    await createContact(page, { firstName: first, lastName: last, attributes: [['kompetenca', `k-${first}`]] });
    await expect(page.getByRole('heading', { name: `${first} ${last}` })).toBeVisible();
    await goTo(page, 'Kontakti');
  }
  await expect(page.getByText('Najdenih: 3')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Izberi Ana Avsec' }).check();
  await page.getByRole('checkbox', { name: 'Izberi Cvetka Čuk' }).check();
  await expectAccessible(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Izvozi izbrane (2)' }).click();
  const download = await downloadPromise;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Ljubljana' }).format(new Date());
  expect(download.suggestedFilename()).toBe(`Izvoz-Škofja-Loka-${today}.xlsx`);
  const text = await workbookText(await download.path());
  expect(text).toContain('Avsec');
  expect(text).toContain('Čuk');
  expect(text).not.toContain('Bizjak');
  expect(text).toContain('kompetenca');
  expect(text).not.toContain('<f>');
});
