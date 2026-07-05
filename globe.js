import createGlobe from 'https://esm.sh/cobe@0.6.3';

const canvas = document.getElementById('globeCanvas');

if (canvas) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const markers = [
    { location: [40.7128, -74.006], size: 0.05 },   // New York
    { location: [30.2672, -97.7431], size: 0.05 },  // Austin
    { location: [41.8781, -87.6298], size: 0.05 },  // Chicago
    { location: [43.6532, -79.3832], size: 0.05 },  // Toronto
    { location: [34.0522, -118.2437], size: 0.05 }, // Los Angeles
    { location: [51.5074, -0.1278], size: 0.05 },   // London
  ];

  let phi = 0;
  let width = 0;
  let pointerInteracting = null;
  let pointerInteractionMovement = 0;

  function onResize() {
    width = canvas.offsetWidth;
  }
  window.addEventListener('resize', onResize);
  onResize();

  createGlobe(canvas, {
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    width: width * 2,
    height: width * 2,
    phi: 0,
    theta: 0.3,
    dark: 0,
    diffuse: 1.4,
    mapSamples: 15000,
    mapBrightness: 7,
    baseColor: [0.973, 0.973, 0.945],
    markerColor: [0.694, 0.502, 0.165],
    glowColor: [0.851, 0.722, 0.463],
    opacity: 0.85,
    markers,
    onRender: state => {
      if (!pointerInteracting && !prefersReducedMotion) {
        phi += 0.004;
      }
      state.phi = phi + pointerInteractionMovement / 200;
      state.width = width * 2;
      state.height = width * 2;
    },
  });

  canvas.style.cursor = 'grab';

  canvas.addEventListener('pointerdown', e => {
    pointerInteracting = e.clientX - pointerInteractionMovement;
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('pointerup', () => {
    pointerInteracting = null;
    canvas.style.cursor = 'grab';
  });
  window.addEventListener('pointermove', e => {
    if (pointerInteracting !== null) {
      const delta = e.clientX - pointerInteracting;
      pointerInteractionMovement = delta;
    }
  });
  canvas.addEventListener('touchmove', e => {
    if (pointerInteracting !== null && e.touches[0]) {
      const delta = e.touches[0].clientX - pointerInteracting;
      pointerInteractionMovement = delta;
    }
  }, { passive: true });

  requestAnimationFrame(() => {
    canvas.style.opacity = '1';
  });
}
