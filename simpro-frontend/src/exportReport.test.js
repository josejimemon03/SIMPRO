import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportGerenteCsv } from './exportReport';
import { getInitialState } from './stateLogic';

describe('exportGerenteCsv', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('descarga un CSV con secciones de estaciones y causas', () => {
    const click = vi.fn();
    const remove = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        return { href: '', download: '', click, remove, style: {} };
      }
      return document.createElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});

    const state = getInitialState();
    exportGerenteCsv(state, 80);

    expect(click).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
  });
});
