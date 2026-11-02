import { screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAuth } from './helpers';

const boot = vi.hoisted(() => ({ loadConfig: vi.fn(), firebaseAuth: vi.fn() }));
vi.mock('../src/lib/firebaseAuth', () => boot);

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
  document.body.innerHTML = '';
});

async function start() {
  await act(async () => {
    await import('../src/main');
  });
}

describe('main: starting the application', () => {
  it('starts with the served configuration and shows the sign-in page', async () => {
    boot.loadConfig.mockResolvedValue({ apiKey: 'k', authDomain: 'd', projectId: 'p' });
    boot.firebaseAuth.mockReturnValue(fakeAuth(null));
    await start();
    expect(boot.firebaseAuth).toHaveBeenCalledWith({ apiKey: 'k', authDomain: 'd', projectId: 'p' });
    expect(await screen.findByRole('heading', { name: 'Prijava' })).toBeInTheDocument();
  });

  it('says so when the configuration is missing', async () => {
    boot.loadConfig.mockRejectedValue(new Error('Missing /config.json'));
    await start();
    expect(await screen.findByRole('alert')).toHaveTextContent('manjka konfiguracija');
  });
});
