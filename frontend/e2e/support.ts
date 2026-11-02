import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const EMULATOR = process.env.E2E_AUTH_EMULATOR ?? 'http://localhost:9099';
const API_KEY = 'demo-api-key';

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.si`;
}

export const PASSWORD = 'geslo-123456';

/** Signs up through the UI and lands on the Workspace list. */
export async function signUp(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Registracija' }).click();
  await page.getByLabel('Ime in priimek').fill(name);
  await page.getByLabel('E-pošta').fill(email);
  await page.getByLabel('Geslo').fill(PASSWORD);
  await page.getByRole('button', { name: 'Registracija' }).click();
  await expect(page.getByRole('heading', { name: 'Delovni prostori' })).toBeVisible();
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-pošta').fill(email);
  await page.getByLabel('Geslo').fill(PASSWORD);
  await page.getByRole('button', { name: 'Prijava', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delovni prostori' })).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Odjava' }).click();
  await expect(page.getByRole('heading', { name: 'Prijava' })).toBeVisible();
}

/** Marks the account's email as verified in the Auth emulator (what clicking the link would do). */
export async function verifyEmail(email: string): Promise<void> {
  const signInRes = await fetch(`${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const { localId } = (await signInRes.json()) as { localId: string };
  const res = await fetch(`${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:update?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId, emailVerified: true }),
  });
  expect(res.ok).toBeTruthy();
}

export async function createWorkspace(page: Page, name: string): Promise<void> {
  await page.getByLabel('Ime', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Ustvari' }).click();
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { name: 'Kontakti' })).toBeVisible();
}

export interface NewContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  city?: string;
  country?: string;
  tags?: string;
  attributes?: [string, string][];
}

/** Creates a Contact through the form; ends on the Contact page (or the form when a duplicate warning shows). */
export async function createContact(page: Page, c: NewContact): Promise<void> {
  await page.getByRole('link', { name: 'Nov kontakt' }).click();
  if (c.firstName) await page.getByLabel('Ime', { exact: true }).fill(c.firstName);
  if (c.lastName) await page.getByLabel('Priimek').fill(c.lastName);
  if (c.email) await page.getByLabel('E-pošta').fill(c.email);
  if (c.phone) await page.getByLabel('Telefon').fill(c.phone);
  if (c.company) await page.getByLabel('Podjetje').fill(c.company);
  if (c.city) await page.getByLabel('Kraj').fill(c.city);
  if (c.country) await page.getByLabel('Država (koda, npr. SI)').fill(c.country);
  for (const [i, [k, v]] of (c.attributes ?? []).entries()) {
    await page.getByRole('button', { name: 'Dodaj atribut' }).click();
    await page.getByLabel(`Ključ ${i + 1}`).fill(k);
    await page.getByLabel(`Vrednost ${i + 1}`).fill(v);
  }
  if (c.tags) await page.getByLabel('Oznake (ločene s presledkom)').fill(c.tags);
  await page.getByRole('button', { name: 'Shrani' }).click();
}

/** NFR-06: no serious or critical axe-core violations on the current page. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** A link in the Workspace navigation. */
export async function goTo(page: Page, item: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Delovni prostor' }).getByRole('link', { name: item, exact: true }).click();
}
