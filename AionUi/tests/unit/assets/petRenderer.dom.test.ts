import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stateChange = vi.fn();
const bodyMove = vi.fn();

const eyeMoveData = { eyeDx: 1, eyeDy: 0, bodyDx: 0.35, bodyRotate: 0.6 };

describe('branded desktop pet', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '<img id="pet" />';
    window.petAPI = { onStateChange: stateChange, onEyeMove: bodyMove, onResize: vi.fn() };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the same otter artwork when work and click states change', async () => {
    await import('@/renderer/pet/petRenderer');
    const pet = document.getElementById('pet') as HTMLImageElement;
    const onStateChange = stateChange.mock.calls[0][0] as (state: string) => void;

    onStateChange('working');
    onStateChange('happy');

    expect(pet.src).toContain('otter-hero.png');
    expect(pet.dataset.state).toBe('happy');
    expect(document.querySelector('object')).toBeNull();
  });

  it('retains gentle body tracking without moving individual raster pupils', async () => {
    await import('@/renderer/pet/petRenderer');
    const onBodyMove = bodyMove.mock.calls[0][0] as (data: typeof eyeMoveData) => void;
    onBodyMove(eyeMoveData);

    const pet = document.getElementById('pet') as HTMLImageElement;
    expect(pet.style.transform).toContain('translateX(');
    expect(pet.style.transform).toContain('rotate(0.6deg)');
  });

  it('keeps the mascot visible if a movement event contains invalid numbers', async () => {
    await import('@/renderer/pet/petRenderer');
    const onBodyMove = bodyMove.mock.calls[0][0] as (data: typeof eyeMoveData) => void;
    onBodyMove({ ...eyeMoveData, bodyDx: Number.NaN, bodyRotate: Number.POSITIVE_INFINITY });

    const pet = document.getElementById('pet') as HTMLImageElement;
    expect(pet.style.transform).toBe('translateX(0px) rotate(0deg)');
  });

  it('does not crash on events if the render target is unavailable', async () => {
    document.body.innerHTML = '';
    await import('@/renderer/pet/petRenderer');
    const onStateChange = stateChange.mock.calls[0][0] as (state: string) => void;
    const onBodyMove = bodyMove.mock.calls[0][0] as (data: typeof eyeMoveData) => void;

    expect(() => onStateChange('dragging')).not.toThrow();
    expect(() => onBodyMove(eyeMoveData)).not.toThrow();
  });
});
