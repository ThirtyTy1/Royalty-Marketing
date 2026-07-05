const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Shader hero background ---------- */
/* Ported from a React/WebGL hero component (Matthias Hurrle, @atzedent) into
   plain canvas + vanilla JS so it can drop into a static site with no build step. */

const shaderFragmentSource = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float
  a=rnd(i),
  b=rnd(i+vec2(1,0)),
  c=rnd(i+vec2(0,1)),
  d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) {
    t+=a*noise(p);
    p*=2.*m;
    a*=.5;
  }
  return t;
}
float clouds(vec2 p) {
	float d=1., t=.0;
	for (float i=.0; i<3.; i++) {
		float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
		t=mix(t,d,a);
		d=a;
		p*=2./(i+1.);
	}
	return t;
}
void main(void) {
	vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
	vec3 col=vec3(0);
	float bg=clouds(vec2(st.x+T*.5,-st.y));
	uv*=1.-.3*(sin(T*.2)*.5+.5);
	for (float i=1.; i<12.; i++) {
		uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
		vec2 p=uv;
		float d=length(p);
		col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
		float b=noise(i+p+bg*1.731);
		col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
		col=mix(col,vec3(bg*.25,bg*.137,bg*.05),d);
	}
	O=vec4(col,1);
}`;

const shaderVertexSource = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;

class ShaderRenderer {
  constructor(canvas, scale) {
    this.canvas = canvas;
    this.scale = scale;
    this.gl = canvas.getContext('webgl2');
    this.mouseMove = [0, 0];
    this.mouseCoords = [0, 0];
    this.pointerCoords = [0, 0];
    this.nbrOfPointers = 0;
  }

  compile(shader, source) {
    const gl = this.gl;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    }
  }

  setup() {
    const gl = this.gl;
    this.vs = gl.createShader(gl.VERTEX_SHADER);
    this.fs = gl.createShader(gl.FRAGMENT_SHADER);
    this.compile(this.vs, shaderVertexSource);
    this.compile(this.fs, shaderFragmentSource);
    this.program = gl.createProgram();
    gl.attachShader(this.program, this.vs);
    gl.attachShader(this.program, this.fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(this.program));
    }
  }

  init() {
    const gl = this.gl;
    const program = this.program;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    program.resolution = gl.getUniformLocation(program, 'resolution');
    program.time = gl.getUniformLocation(program, 'time');
    program.move = gl.getUniformLocation(program, 'move');
    program.touch = gl.getUniformLocation(program, 'touch');
    program.pointerCount = gl.getUniformLocation(program, 'pointerCount');
    program.pointers = gl.getUniformLocation(program, 'pointers');
  }

  updateScale(scale) {
    this.scale = scale;
    this.gl.viewport(0, 0, this.canvas.width * scale, this.canvas.height * scale);
  }

  updateMove(deltas) { this.mouseMove = deltas; }
  updateMouse(coords) { this.mouseCoords = coords; }
  updatePointerCoords(coords) { this.pointerCoords = coords; }
  updatePointerCount(nbr) { this.nbrOfPointers = nbr; }

  render(now = 0) {
    const gl = this.gl;
    const program = this.program;
    if (!program || gl.getProgramParameter(program, gl.DELETE_STATUS)) return;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.uniform2f(program.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(program.time, now * 1e-3);
    gl.uniform2f(program.move, ...this.mouseMove);
    gl.uniform2f(program.touch, ...this.mouseCoords);
    gl.uniform1i(program.pointerCount, this.nbrOfPointers);
    gl.uniform2fv(program.pointers, this.pointerCoords);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

class ShaderPointerHandler {
  constructor(element, scale) {
    this.scale = scale;
    this.active = false;
    this.pointers = new Map();
    this.lastCoords = [0, 0];
    this.moves = [0, 0];

    const map = (el, s, x, y) => [x * s, el.height - y * s];

    element.addEventListener('pointerdown', e => {
      this.active = true;
      this.pointers.set(e.pointerId, map(element, this.scale, e.clientX, e.clientY));
    });
    element.addEventListener('pointerup', e => {
      if (this.count === 1) this.lastCoords = this.first;
      this.pointers.delete(e.pointerId);
      this.active = this.pointers.size > 0;
    });
    element.addEventListener('pointerleave', e => {
      if (this.count === 1) this.lastCoords = this.first;
      this.pointers.delete(e.pointerId);
      this.active = this.pointers.size > 0;
    });
    element.addEventListener('pointermove', e => {
      if (!this.active) return;
      this.lastCoords = [e.clientX, e.clientY];
      this.pointers.set(e.pointerId, map(element, this.scale, e.clientX, e.clientY));
      this.moves = [this.moves[0] + e.movementX, this.moves[1] + e.movementY];
    });
  }

  get count() { return this.pointers.size; }
  get move() { return this.moves; }
  get coords() {
    return this.pointers.size > 0 ? Array.from(this.pointers.values()).flat() : [0, 0];
  }
  get first() { return this.pointers.values().next().value || this.lastCoords; }
}

function initShaderHero() {
  const canvas = document.getElementById('shaderCanvas');
  if (!canvas || !canvas.getContext('webgl2')) return;

  const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
  const renderer = new ShaderRenderer(canvas, dpr);
  const pointers = new ShaderPointerHandler(canvas, dpr);

  function resize() {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    renderer.updateScale(dpr);
  }

  renderer.setup();
  renderer.init();
  resize();
  window.addEventListener('resize', resize);

  if (prefersReducedMotion) {
    renderer.render(0);
    return;
  }

  function loop(now) {
    renderer.updateMouse(pointers.first);
    renderer.updatePointerCount(pointers.count);
    renderer.updatePointerCoords(pointers.coords);
    renderer.updateMove(pointers.move);
    renderer.render(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

initShaderHero();

/* ---------- Network hero (particle canvas) ---------- */
/* Ported from a React/canvas hero component into plain canvas + vanilla JS. */

function initNetworkHero() {
  const section = document.querySelector('.network-hero');
  const canvas = document.getElementById('networkCanvas');
  if (!section || !canvas) return;

  const ctx = canvas.getContext('2d');
  const mouse = { x: null, y: null, radius: 140 };
  const particleColors = ['rgba(217, 184, 118, 0.85)', 'rgba(127, 174, 141, 0.85)'];
  let particles = [];
  let animationId = null;
  let visible = false;

  class NetworkParticle {
    constructor(x, y, dx, dy, size, color) {
      this.x = x;
      this.y = y;
      this.dx = dx;
      this.dy = dy;
      this.size = size;
      this.color = color;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }

    update() {
      if (this.x > canvas.width || this.x < 0) this.dx = -this.dx;
      if (this.y > canvas.height || this.y < 0) this.dy = -this.dy;

      if (mouse.x !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius + this.size) {
          const forceX = dx / dist;
          const forceY = dy / dist;
          const force = (mouse.radius - dist) / mouse.radius;
          this.x -= forceX * force * 4;
          this.y -= forceY * force * 4;
        }
      }

      this.x += this.dx;
      this.y += this.dy;
      this.draw();
    }
  }

  function initParticles() {
    particles = [];
    const count = Math.min(160, (canvas.width * canvas.height) / 9000);
    for (let i = 0; i < count; i += 1) {
      const size = Math.random() * 1.6 + 1;
      const x = Math.random() * (canvas.width - size * 2) + size;
      const y = Math.random() * (canvas.height - size * 2) + size;
      const dx = (Math.random() * 0.4) - 0.2;
      const dy = (Math.random() * 0.4) - 0.2;
      const color = particleColors[i % 2];
      particles.push(new NetworkParticle(x, y, dx, dy, size, color));
    }
  }

  function resize() {
    canvas.width = section.clientWidth;
    canvas.height = section.clientHeight;
    initParticles();
  }

  function connect() {
    const maxDist = (canvas.width / 7) * (canvas.height / 7);
    for (let a = 0; a < particles.length; a += 1) {
      for (let b = a; b < particles.length; b += 1) {
        const dist = ((particles[a].x - particles[b].x) ** 2) + ((particles[a].y - particles[b].y) ** 2);
        if (dist < maxDist) {
          const opacity = 1 - (dist / 20000);
          let nearMouse = false;
          if (mouse.x !== null) {
            const dxm = particles[a].x - mouse.x;
            const dym = particles[a].y - mouse.y;
            nearMouse = Math.sqrt(dxm * dxm + dym * dym) < mouse.radius;
          }
          ctx.strokeStyle = nearMouse
            ? `rgba(244, 241, 230, ${opacity})`
            : `rgba(180, 160, 130, ${opacity * 0.6})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particles[a].x, particles[a].y);
          ctx.lineTo(particles[b].x, particles[b].y);
          ctx.stroke();
        }
      }
    }
  }

  function renderFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => p.update());
    connect();
  }

  function loop() {
    if (!visible) {
      animationId = null;
      return;
    }
    renderFrame();
    animationId = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  resize();

  if (prefersReducedMotion) {
    renderFrame();
    return;
  }

  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      visible = entry.isIntersecting;
      if (visible && !animationId) {
        loop();
      }
    });
  }, { threshold: 0.05 });
  sectionObserver.observe(section);
}

initNetworkHero();

/* ---------- Nav toggle ---------- */

const navToggle = document.getElementById('navToggle');
const siteNav = document.getElementById('siteNav');

navToggle.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

siteNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

/* ---------- Growth math ---------- */

function compoundSeries(start, ratePct, months) {
  const points = [];
  for (let m = 0; m <= months; m += 1) {
    points.push(start * Math.pow(1 + ratePct / 100, m));
  }
  return points;
}

/* ---------- Hero chart ---------- */

const canvas = document.getElementById('growthChart');
const ctx = canvas.getContext('2d');
const startSlider = document.getElementById('startSlider');
const rateSlider = document.getElementById('rateSlider');
const startLabel = document.getElementById('startLabel');
const rateLabel = document.getElementById('rateLabel');
const chartEndValue = document.getElementById('chartEndValue');

const HERO_MONTHS = 24;
let heroProgress = prefersReducedMotion ? 1 : 0;

function drawHeroChart(progress) {
  const start = Number(startSlider.value);
  const rate = Number(rateSlider.value);
  const series = compoundSeries(start, rate, HERO_MONTHS);
  const max = Math.max(...series);

  const w = canvas.width;
  const h = canvas.height;
  const padX = 8;
  const padY = 18;

  ctx.clearRect(0, 0, w, h);

  const visibleCount = Math.max(2, Math.round(series.length * progress));
  const visible = series.slice(0, visibleCount);

  const toXY = (value, i) => {
    const x = padX + (i / HERO_MONTHS) * (w - padX * 2);
    const y = h - padY - (value / max) * (h - padY * 2);
    return [x, y];
  };

  // area fill
  ctx.beginPath();
  visible.forEach((v, i) => {
    const [x, y] = toXY(v, i);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const [lastX] = toXY(visible[visible.length - 1], visible.length - 1);
  ctx.lineTo(lastX, h - padY);
  ctx.lineTo(padX, h - padY);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, 'rgba(177, 128, 42, 0.22)');
  gradient.addColorStop(1, 'rgba(177, 128, 42, 0.02)');
  ctx.fillStyle = gradient;
  ctx.fill();

  // line
  ctx.beginPath();
  visible.forEach((v, i) => {
    const [x, y] = toXY(v, i);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#b1802a';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // end dot
  if (visible.length > 1) {
    const [ex, ey] = toXY(visible[visible.length - 1], visible.length - 1);
    ctx.beginPath();
    ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#b1802a';
    ctx.fill();
  }

  const growthMultiple = (series[series.length - 1] / series[0]).toFixed(1);
  chartEndValue.textContent = `${growthMultiple}× in ${HERO_MONTHS}mo`;
}

function animateHeroIn() {
  if (prefersReducedMotion) {
    drawHeroChart(1);
    return;
  }
  const duration = 900;
  const startTime = performance.now();
  function step(now) {
    heroProgress = Math.min(1, (now - startTime) / duration);
    drawHeroChart(heroProgress);
    if (heroProgress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateHeroLabels() {
  startLabel.textContent = startSlider.value;
  rateLabel.textContent = `${rateSlider.value}%`;
}

[startSlider, rateSlider].forEach(slider => {
  slider.addEventListener('input', () => {
    updateHeroLabels();
    drawHeroChart(1);
  });
});

updateHeroLabels();
animateHeroIn();

/* ---------- Case study sparklines ---------- */

function sparklinePoints(canvasEl) {
  const start = Number(canvasEl.dataset.start);
  const rate = Number(canvasEl.dataset.rate);
  const months = Number(canvasEl.dataset.months);
  const series = compoundSeries(start, rate, months);
  const max = Math.max(...series);
  const w = canvasEl.width;
  const h = canvasEl.height;
  const pad = 10;

  const toXY = (value, i) => [
    pad + (i / months) * (w - pad * 2),
    h - pad - (value / max) * (h - pad * 2)
  ];

  return series.map((v, i) => toXY(v, i));
}

function drawSparkline(canvasEl, pulse = 0) {
  const sctx = canvasEl.getContext('2d');
  const points = sparklinePoints(canvasEl);
  const w = canvasEl.width;
  const h = canvasEl.height;

  sctx.clearRect(0, 0, w, h);

  sctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) sctx.moveTo(x, y);
    else sctx.lineTo(x, y);
  });
  sctx.strokeStyle = '#2f6b4f';
  sctx.lineWidth = 2;
  sctx.lineJoin = 'round';
  sctx.lineCap = 'round';
  sctx.stroke();

  const [ex, ey] = points[points.length - 1];

  if (pulse > 0) {
    sctx.beginPath();
    sctx.arc(ex, ey, 3.5 + pulse * 6, 0, Math.PI * 2);
    sctx.fillStyle = `rgba(177, 128, 42, ${0.25 * (1 - pulse)})`;
    sctx.fill();
  }

  sctx.beginPath();
  sctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
  sctx.fillStyle = '#b1802a';
  sctx.fill();
}

const sparkCanvases = document.querySelectorAll('.spark');
sparkCanvases.forEach(el => drawSparkline(el, 0));

if (!prefersReducedMotion) {
  const pulseDuration = 2200;
  function animateSparkPulse(now) {
    const phase = (now % pulseDuration) / pulseDuration;
    sparkCanvases.forEach(el => drawSparkline(el, phase < 0.5 ? phase * 2 : 0));
    requestAnimationFrame(animateSparkPulse);
  }
  requestAnimationFrame(animateSparkPulse);
}

/* ---------- Count-up numbers ---------- */

function animateCountUp(el) {
  const target = Number(el.dataset.countTo);
  const suffix = el.dataset.suffix || '';
  const isDecimal = el.dataset.countTo.includes('.');
  if (prefersReducedMotion) {
    el.textContent = `${target}${suffix}`;
    return;
  }
  const duration = 1200;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = target * eased;
    el.textContent = `${isDecimal ? value.toFixed(1) : Math.round(value)}${suffix}`;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ---------- Shared scroll reveal ---------- */

const revealEls = document.querySelectorAll('.reveal');
if (prefersReducedMotion) {
  revealEls.forEach(el => el.classList.add('in-view'));
} else {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        const counter = entry.target.querySelector('[data-count-to]');
        if (counter) animateCountUp(counter);
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  revealEls.forEach(el => revealObserver.observe(el));
}

/* ---------- Netlify Forms via AJAX ---------- */

function encodeFormData(form) {
  return new URLSearchParams(new FormData(form)).toString();
}

function wireNetlifyForm(form, note, successMessage) {
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    note.textContent = 'Sending…';

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeFormData(form)
    })
      .then(() => {
        note.textContent = successMessage;
        form.reset();
      })
      .catch(() => {
        note.textContent = 'Something went wrong sending that — please email us directly instead.';
      });
  });
}

wireNetlifyForm(
  document.getElementById('contactForm'),
  document.getElementById('formNote'),
  "Thanks — we'll reply within one business day."
);

wireNetlifyForm(
  document.getElementById('newsletterForm'),
  document.getElementById('newsletterNote'),
  "Subscribed — watch your inbox next month."
);
