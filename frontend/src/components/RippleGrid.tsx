import React, { useEffect, useRef } from 'react';
import './RippleGrid.css';

const MAX_RIPPLES = 12;
const VARIANTS: Record<string, number> = { lines: 0, dots: 1, cross: 2 };

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uView;
uniform float uRatio;
uniform float uCell;
uniform float uLineWidth;
uniform float uGlow;
uniform float uTilt;
uniform float uFocal;
uniform vec2 uTurn;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform int uRippleCount;
uniform float uWaveLength;
uniform float uWaveSpeed;
uniform float uStrength;
uniform vec3 uPointer;
uniform vec3 uColor;
uniform vec3 uInk;
uniform float uPresence;
uniform float uReveal;
uniform float uFade;
uniform float uOpacity;
uniform float uLightMode;
uniform int uVariant;
out vec4 outColor;

float smootherstep(float edge, float x) {
  float t = clamp(x / max(edge, 0.0001), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 css = gl_FragCoord.xy / uRatio;
  vec2 screen = vec2(css.x - uView.x * 0.5, uView.y * 0.5 - css.y);
  vec2 plane = screen;
  float horizon = 1.0;
  if (uTilt > 0.0001) {
    float depth = uFocal + screen.y * tan(uTilt);
    horizon = smoothstep(0.0, uFocal * 0.35, depth);
    float scale = uFocal / max(depth, 0.001);
    plane = vec2(screen.x * scale, screen.y * scale / cos(uTilt));
  }

  vec2 push = vec2(0.0);
  float lift = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= uRippleCount) break;
    vec4 ripple = uRipples[i];
    vec2 delta = plane - ripple.xy;
    float dist = length(delta);
    float x = (dist - ripple.z * uWaveSpeed) / uWaveLength;
    float packet = exp(-x * x * 1.8);
    float spread = 1.0 / (1.0 + dist / (uWaveLength * 5.0));
    float calm = smoothstep(0.0, uWaveLength * 0.9, dist);
    float wave = sin(x * 6.28318) * packet * spread * calm * ripple.w;
    push += (dist > 0.001 ? delta / dist : vec2(0.0)) * wave;
    lift += wave;
  }

  vec2 bent = plane + push * uStrength * uCell * 0.22;
  vec2 grid = mat2(uTurn.x, uTurn.y, -uTurn.y, uTurn.x) * bent / uCell;
  vec2 fw = max(fwidth(grid), vec2(0.00001));
  vec2 offset = abs(fract(grid - 0.5) - 0.5);
  vec2 dist = offset / fw;
  float width = max(uLineWidth * uRatio, 1.0);
  float thin = min(uLineWidth * uRatio, 1.0);
  float shape = 0.0;
  float edge = min(dist.x, dist.y);
  if (uVariant == 1) {
    edge = length(dist);
    shape = (1.0 - smoothstep(width * 1.7 - 0.5, width * 1.7 + 0.5, edge)) * thin * 1.8;
  } else if (uVariant == 2) {
    float arm = 0.16;
    vec2 cover = (1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, dist)) * thin;
    vec2 reach = 1.0 - smoothstep(arm - fw * 0.5, arm + fw * 0.5, offset);
    shape = max(cover.x * reach.y, cover.y * reach.x);
    edge = max(min(dist.x, dist.y), length(max(offset - arm, 0.0) / fw));
  } else {
    vec2 cover = (1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, dist)) * thin;
    shape = max(cover.x, cover.y);
  }
  float halo = exp(-edge / (uRatio * 2.4)) * uGlow;
  float far = 1.0 - smoothstep(0.18, 0.5, max(fw.x, fw.y));

  vec2 toPointer = (plane - uPointer.xy) / (uCell * 3.2);
  float near = uPointer.z * exp(-dot(toPointer, toPointer));
  float shine = max(1.0 + lift * 3.4 * uStrength, 0.25) * (1.0 + near * 1.6);

  float radius = length(plane);
  float reveal = 1.0 - smoothstep(uReveal - uCell * 4.0, uReveal, radius);
  vec2 uv = gl_FragCoord.xy / (uView * uRatio);
  float edgeFade = uFade * 0.5;
  float mask = smootherstep(edgeFade, uv.x) * smootherstep(edgeFade, 1.0 - uv.x) * smootherstep(edgeFade, uv.y) * smootherstep(edgeFade, 1.0 - uv.y);
  mask *= horizon * far * reveal * uPresence * uOpacity;

  float level = (shape * 0.26 + halo * 0.1) * shine * mask;
  float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  if (uLightMode > 0.5) {
    float alpha = clamp(level * 1.2 + dither, 0.0, 1.0);
    outColor = vec4(uInk * alpha, alpha);
  } else {
    float alpha = clamp(level + dither, 0.0, 1.0);
    vec3 color = mix(uColor, vec3(1.0), clamp(level - 0.7, 0.0, 1.0));
    outColor = vec4(color * alpha, alpha);
  }
}`;

const INTRO_SECONDS = 1.6;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const compile = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.error('[RippleGrid] Shader error:', gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
};

const link = (gl: WebGL2RenderingContext) => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[RippleGrid] Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) {
      const cleanName = info.name.replace(/\[0\]$/, '');
      const loc = gl.getUniformLocation(program, info.name);
      uniforms[cleanName] = loc;
      uniforms[info.name] = loc;
    }
  }
  return { program, uniforms };
};

export interface RippleGridProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: string;
  variant?: 'lines' | 'dots' | 'cross';
  cellSize?: number;
  lineWidth?: number;
  glow?: number;
  rippleStrength?: number;
  rippleSpeed?: number;
  rippleSize?: number;
  autoRipple?: 'center' | 'random' | 'none';
  rippleInterval?: number;
  tilt?: number;
  rotation?: number;
  mouseInteraction?: boolean;
  clickRipple?: boolean;
  intro?: boolean;
  fade?: number;
  opacity?: number;
  lightMode?: boolean;
  paused?: boolean;
  dpr?: number;
  className?: string;
}

interface Ripple {
  x: number;
  y: number;
  born: number;
  strength: number;
}

export const RippleGrid: React.FC<RippleGridProps> = ({
  color = '#ffffff',
  variant = 'lines',
  cellSize = 48,
  lineWidth = 1,
  glow = 0.6,
  rippleStrength = 1,
  rippleSpeed = 1,
  rippleSize = 1,
  autoRipple = 'center',
  rippleInterval = 2.6,
  tilt = 0,
  rotation = 0,
  mouseInteraction = true,
  clickRipple = true,
  intro = true,
  fade = 0.5,
  opacity = 1,
  lightMode = false,
  paused = false,
  dpr,
  className = '',
  ...rest
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wakeRef = useRef<(() => void) | null>(null);

  const settings = {
    color: String(color),
    variant: VARIANTS[variant] ?? 0,
    cellSize: Math.max(8, cellSize),
    lineWidth: Math.max(0.25, lineWidth),
    glow: Math.max(0, glow),
    rippleStrength: Math.max(0, rippleStrength),
    rippleSpeed: Math.max(0.05, rippleSpeed),
    rippleSize: Math.max(0.2, rippleSize),
    autoRipple,
    rippleInterval: Math.max(0.3, rippleInterval),
    tilt: clamp(tilt, 0, 80),
    rotation,
    mouseInteraction,
    clickRipple,
    intro,
    fade: clamp(fade, 0, 1),
    opacity: clamp(opacity, 0, 1),
    lightMode,
    paused,
    dpr
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
    if (!gl) {
      console.warn('[RippleGrid] WebGL2 not supported or context lost');
      return undefined;
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('[RippleGrid] WebGL context lost handled');
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);

    const program = link(gl);
    if (!program) return undefined;
    const u = program.uniforms;

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const colorCache = new Map<string, number[]>();
    const toLinear = (value: string): number[] => {
      if (colorCache.has(value)) return colorCache.get(value)!;
      let rgb = [1, 1, 1];
      if (value.startsWith('#')) {
        let hex = value.slice(1);
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const num = parseInt(hex, 16);
        if (!isNaN(num)) {
          const r = (num >> 16) & 255;
          const g = (num >> 8) & 255;
          const b = num & 255;
          rgb = [Math.pow(r / 255, 2.2), Math.pow(g / 255, 2.2), Math.pow(b / 255, 2.2)];
        }
      }
      colorCache.set(value, rgb);
      return rgb;
    };

    const view = { width: 1, height: 1, ratio: 1 };
    const pointer = { x: 0, y: 0, inside: false, planeX: 0, planeY: 0, lastX: 0, lastY: 0, travel: 0 };
    const state = { clock: 0, intro: settingsRef.current.intro ? 0 : 1, glow: 0, nextAuto: 0.2 };
    const ripples: Ripple[] = [];
    const packed = new Float32Array(MAX_RIPPLES * 4);
    let raf = 0;
    let last = 0;

    const focalOf = () => view.height * 1.15;

    const toPlane = (x: number, y: number): [number, number] | null => {
      const s = settingsRef.current;
      const sx = x - view.width / 2;
      const sy = y - view.height / 2;
      const tilt = (s.tilt * Math.PI) / 180;
      if (tilt <= 0.0001) return [sx, sy];
      const focal = focalOf();
      const depth = focal + sy * Math.tan(tilt);
      if (depth <= focal * 0.05) return null;
      const scale = focal / depth;
      return [sx * scale, (sy * scale) / Math.cos(tilt)];
    };

    const spawn = (x: number, y: number, strength: number) => {
      ripples.push({ x, y, born: state.clock, strength });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
    };

    const render = () => {
      if (gl.isContextLost()) return;
      const s = settingsRef.current;
      const presence = state.intro * state.intro * (3 - 2 * state.intro);
      const waveLength = s.cellSize * 2.4 * s.rippleSize;
      const waveSpeed = 240 * s.rippleSpeed;
      let count = 0;
      for (let i = ripples.length - 1; i >= 0 && count < MAX_RIPPLES; i--) {
        const r = ripples[i];
        const age = state.clock - r.born;
        packed[count * 4] = r.x;
        packed[count * 4 + 1] = r.y;
        packed[count * 4 + 2] = age;
        packed[count * 4 + 3] = r.strength * Math.exp(-age * 0.55);
        count++;
      }
      const angle = (s.rotation * Math.PI) / 180;
      const tint = toLinear(s.color);
      const tone = 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2];
      const depth = Math.min(1, 0.12 / Math.max(tone, 0.001));
      const ink = tint.map(v => Math.pow(Math.min(1, v * depth), 1 / 2.2));
      const diagonal = Math.hypot(view.width, view.height);

      gl.bindVertexArray(vao);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program.program);
      if (u.uView != null) gl.uniform2f(u.uView, view.width, view.height);
      if (u.uRatio != null) gl.uniform1f(u.uRatio, view.ratio);
      if (u.uCell != null) gl.uniform1f(u.uCell, s.cellSize);
      if (u.uLineWidth != null) gl.uniform1f(u.uLineWidth, s.lineWidth);
      if (u.uGlow != null) gl.uniform1f(u.uGlow, s.glow);
      if (u.uTilt != null) gl.uniform1f(u.uTilt, (s.tilt * Math.PI) / 180);
      if (u.uFocal != null) gl.uniform1f(u.uFocal, focalOf());
      if (u.uTurn != null) gl.uniform2f(u.uTurn, Math.cos(angle), Math.sin(angle));
      if (u.uRipples != null) gl.uniform4fv(u.uRipples, packed);
      if (u.uRippleCount != null) gl.uniform1i(u.uRippleCount, count);
      if (u.uWaveLength != null) gl.uniform1f(u.uWaveLength, waveLength);
      if (u.uWaveSpeed != null) gl.uniform1f(u.uWaveSpeed, waveSpeed);
      if (u.uStrength != null) gl.uniform1f(u.uStrength, s.rippleStrength);
      if (u.uPointer != null) gl.uniform3f(u.uPointer, pointer.planeX, pointer.planeY, state.glow);
      if (u.uColor != null) {
        gl.uniform3fv(
          u.uColor,
          tint.map(v => Math.pow(v, 1 / 2.2))
        );
      }
      if (u.uInk != null) gl.uniform3fv(u.uInk, ink);
      if (u.uPresence != null) gl.uniform1f(u.uPresence, Math.min(1, presence * 1.6));
      if (u.uReveal != null) gl.uniform1f(u.uReveal, s.intro ? presence * diagonal * 1.4 + s.cellSize * 4 : 1e6);
      if (u.uFade != null) gl.uniform1f(u.uFade, s.fade);
      if (u.uOpacity != null) gl.uniform1f(u.uOpacity, s.opacity);
      if (u.uLightMode != null) gl.uniform1f(u.uLightMode, s.lightMode ? 1 : 0);
      if (u.uVariant != null) gl.uniform1i(u.uVariant, s.variant);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      const s = settingsRef.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (!s.paused) state.clock += dt;
      if (!s.intro) state.intro = 1;
      else if (state.intro < 1) state.intro = Math.min(1, state.intro + dt / INTRO_SECONDS);

      if (!s.paused && s.autoRipple !== 'none' && state.clock >= state.nextAuto) {
        if (s.autoRipple === 'random') {
          const spot = toPlane(Math.random() * view.width, view.height * (0.2 + Math.random() * 0.7));
          if (spot) spawn(spot[0], spot[1], 0.75);
        } else {
          spawn(0, 0, 1.1);
        }
        state.nextAuto = state.clock + s.rippleInterval;
      }
      const lifetime = 9 / Math.max(0.2, s.rippleSpeed);
      while (ripples.length && state.clock - ripples[0].born > lifetime) ripples.shift();

      const engaged = s.mouseInteraction && pointer.inside;
      state.glow += ((engaged ? 1 : 0) - state.glow) * (1 - Math.exp(-dt * (engaged ? 6 : 2.5)));
      render();

      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const s = settingsRef.current;
      const width = Math.max(1, container.clientWidth || 300);
      const height = Math.max(1, container.clientHeight || 300);
      const ratio = Math.min(s.dpr || window.devicePixelRatio || 1, 2);
      view.width = width;
      view.height = height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      view.ratio = canvas.width / width;
      render();
      wake();
    };

    const onPointerMove = (event: PointerEvent | MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      if (pointer.inside) {
        const spot = toPlane(x, y);
        if (spot) {
          const s = settingsRef.current;
          const step = Math.hypot(spot[0] - pointer.planeX, spot[1] - pointer.planeY);
          pointer.planeX = spot[0];
          pointer.planeY = spot[1];
          if (s.mouseInteraction) {
            pointer.travel += step;
            if (pointer.travel > s.cellSize * 1.2) {
              pointer.travel = 0;
              spawn(spot[0], spot[1], 0.45);
            }
          }
        }
      }
      pointer.x = x;
      pointer.y = y;
      wake();
    };

    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
        const spot = toPlane(x, y);
        if (spot && settingsRef.current.clickRipple) {
          spawn(spot[0], spot[1], 1.4);
          wake();
        }
      }
    };

    const onPointerLeave = () => {
      pointer.inside = false;
      wake();
    };

    const onVisibility = () => {
      if (!document.hidden) {
        last = 0;
        wake();
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);

    spawn(0, 0, 1.2);
    resize();
    wake();

    wakeRef.current = () => {
      resize();
      wake();
    };

    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      gl.deleteProgram(program.program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      // NOTE: NEVER call loseContext() in React as it destroys the WebGL canvas permanently.
    };
  }, []);

  useEffect(() => {
    wakeRef.current?.();
  });

  return (
    <div ref={containerRef} className={`ripple-grid-container${className ? ` ${className}` : ''}`} {...rest}>
      <canvas ref={canvasRef} className="ripple-grid-canvas" aria-hidden="true" />
    </div>
  );
};

export default RippleGrid;
