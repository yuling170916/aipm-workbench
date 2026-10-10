import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock('@/renderer/pages/ModelBench/client', () => ({
  loadModels: vi.fn(),
  loadHistory: vi.fn(),
  saveRecord: vi.fn(),
  runComparison: vi.fn(),
}));

import ModelBench from '@/renderer/pages/ModelBench';
import { loadHistory, loadModels } from '@/renderer/pages/ModelBench/client';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('model comparison page', () => {
  it('renders an actionable empty state and disables sending without models', async () => {
    vi.mocked(loadModels).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <ModelBench />
      </MemoryRouter>
    );
    await waitFor(() => expect(loadModels).toHaveBeenCalled());
    expect(screen.getByText('common.modelBench.noModels')).toBeTruthy();
    expect((screen.getByText('common.modelBench.run').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows a recoverable error when the catalog fails', async () => {
    vi.mocked(loadModels).mockRejectedValue(new Error('offline'));
    render(
      <MemoryRouter>
        <ModelBench />
      </MemoryRouter>
    );
    expect(await screen.findByText('common.modelBench.loadError')).toBeTruthy();
    vi.mocked(loadModels).mockResolvedValue([]);
    fireEvent.click(screen.getByText('common.modelBench.refresh'));
    await waitFor(() => expect(loadModels).toHaveBeenCalledTimes(2));
  });
  it('restores the saved prompt, provider identity, and answer together', async () => {
    vi.mocked(loadModels).mockResolvedValue([]);
    vi.mocked(loadHistory).mockResolvedValue([
      {
        id: 'saved',
        created: 1,
        prompt: 'original input',
        results: [
          {
            target: { provider_id: 'p', provider_name: 'Provider one', model: 'Model one' },
            text: 'saved answer',
            elapsed: 1200,
            status: 'done',
          },
        ],
      },
    ]);
    render(
      <MemoryRouter>
        <ModelBench />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('common.modelBench.history'));
    fireEvent.click(await screen.findByText(/original input/));
    expect(await screen.findByText('saved answer')).toBeTruthy();
    expect(screen.getByText('Provider one')).toBeTruthy();
    expect((screen.getByLabelText('common.modelBench.prompt') as HTMLTextAreaElement).value).toBe('original input');
  });
});
