import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api';
import { fakeApi, renderApp } from './helpers';

describe('AC-004-04 a non-Member sees a not-found page and no data', () => {
  it.each(['/w/w1', '/w/w1/kontakti/c1', '/w/w1/kontakti/c1/zgodovina', '/w/w1/dvojniki', '/w/w1/clani'])('%s', async (path) => {
    const notFound = async () => {
      throw new ApiError(404, [{ field: null, message: 'not found' }]);
    };
    const getContact = vi.fn(notFound);
    const listContacts = vi.fn(notFound);
    renderApp(path, fakeApi({ getWorkspace: vi.fn(notFound), getContact, listContacts }));
    expect(await screen.findByRole('heading', { name: 'Ni najdeno' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Delovni prostor' })).not.toBeInTheDocument();
    expect(getContact).not.toHaveBeenCalled();
    expect(listContacts).not.toHaveBeenCalled();
  });
});
