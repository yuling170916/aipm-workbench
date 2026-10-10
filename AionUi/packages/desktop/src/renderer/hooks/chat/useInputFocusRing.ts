export const useInputFocusRing = () => {
  return {
    activeBorderColor: 'var(--primary)',
    inactiveBorderColor: 'var(--border-base)',
    activeShadow: '0 0 0 3px color-mix(in srgb, var(--primary) 10%, transparent), var(--shadow-card)',
  };
};
