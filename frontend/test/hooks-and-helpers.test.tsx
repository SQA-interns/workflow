import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { filterOf, queryFromParams } from '../src/lib/listQuery';
import { useLoad } from '../src/lib/useLoad';

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useLoad', () => {
  it('is loading until the data arrives, then reloads with the loading flag and clears an old error', async () => {
    const first = deferred<string>();
    let next: Promise<string> = first.promise;
    const { result } = renderHook(() => useLoad(() => next, []));
    expect(result.current).toMatchObject({ data: null, error: null, loading: true });
    await act(async () => first.resolve('a'));
    expect(result.current).toMatchObject({ data: 'a', error: null, loading: false });

    const failing = deferred<string>();
    next = failing.promise;
    let reload: Promise<void> = Promise.resolve();
    act(() => {
      reload = result.current.reload();
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      failing.reject(new Error('boom'));
      await reload;
    });
    expect(result.current).toMatchObject({ data: 'a', loading: false });
    expect(result.current.error).toEqual(new Error('boom'));

    next = Promise.resolve('b');
    await act(async () => result.current.reload());
    expect(result.current).toMatchObject({ data: 'b', error: null, loading: false });
  });

  it('reports a failed first load and clears it when the inputs change', async () => {
    let fail = true;
    const { result, rerender } = renderHook(({ key }: { key: number }) => useLoad(() => (fail ? Promise.reject(new Error('x')) : Promise.resolve(key)), [key]), {
      initialProps: { key: 1 },
    });
    await waitFor(() => expect(result.current.error).toEqual(new Error('x')));
    expect(result.current.loading).toBe(false);
    fail = false;
    rerender({ key: 2 });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current).toMatchObject({ data: 2, error: null, loading: false }));
  });

  it('ignores an answer that arrives after the inputs changed', async () => {
    const slow = deferred<string>();
    const slowError = deferred<string>();
    const { result, rerender } = renderHook(({ p }: { p: Promise<string> }) => useLoad(() => p, [p]), { initialProps: { p: slow.promise } });
    rerender({ p: Promise.resolve('new') });
    await waitFor(() => expect(result.current.data).toBe('new'));
    await act(async () => slow.resolve('old'));
    expect(result.current.data).toBe('new');
    rerender({ p: slowError.promise });
    rerender({ p: Promise.resolve('newer') });
    await waitFor(() => expect(result.current.data).toBe('newer'));
    await act(async () => slowError.reject(new Error('late')));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('list query in the URL', () => {
  it('reads every filter; empty values count as absent', () => {
    expect(queryFromParams(new URLSearchParams('q=a&tag=x%20y&tag=z&tagMode=any&attr=k&attr=&country=SI&company=K&sort=company&dir=asc&page=3'))).toEqual({
      q: 'a', tag: ['x', 'y', 'z'], tagMode: 'any', attr: ['k'], country: 'SI', company: 'K', sort: 'company', dir: 'asc', page: 3, size: 20,
    });
    expect(queryFromParams(new URLSearchParams('tagMode=all&dir=up&page=x'))).toEqual({
      q: undefined, tag: undefined, tagMode: undefined, attr: [], country: undefined, company: undefined, sort: undefined, dir: undefined, page: 0, size: 20,
    });
  });

  it('the Export filter leaves out paging, the Deleted flag and empty values', () => {
    expect(filterOf({ q: '', tag: ['a'], attr: [], country: undefined, company: 'K', page: 2, size: 20, deleted: true, sort: 'company' })).toEqual({
      tag: ['a'], company: 'K', sort: 'company',
    });
    expect(filterOf({ q: 'x', tagMode: 'any' })).toEqual({ q: 'x', tagMode: 'any' });
  });
});
