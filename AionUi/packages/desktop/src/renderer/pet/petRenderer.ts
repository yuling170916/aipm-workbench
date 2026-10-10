import otterHero from '@renderer/assets/logos/brand/otter-hero.png';

const pet = document.getElementById('pet') as HTMLImageElement | null;
// The existing idle ticker reports movement in the legacy 58-unit artwork space.
const ARTWORK_WIDTH = 58;

if (pet) {
  pet.src = otterHero;
  pet.draggable = false;
  pet.dataset.state = 'idle';
}

window.petAPI.onStateChange((state: string) => {
  // Keep the approved mascot in every state. The existing hit window and main
  // process still handle dragging, clicks, resizing, and confirmation bubbles.
  if (pet) pet.dataset.state = state;
});

window.petAPI.onEyeMove(({ bodyDx, bodyRotate }) => {
  if (!pet) return;
  // A raster portrait has no separately movable pupils. Preserve the existing
  // gentle body tracking without pretending it has a full set of animated poses.
  const dx = Number.isFinite(bodyDx) ? Math.max(-2, Math.min(2, bodyDx)) : 0;
  const angle = Number.isFinite(bodyRotate) ? Math.max(-3, Math.min(3, bodyRotate)) : 0;
  pet.style.transform = `translateX(${(dx * window.innerWidth) / ARTWORK_WIDTH}px) rotate(${angle}deg)`;
});
