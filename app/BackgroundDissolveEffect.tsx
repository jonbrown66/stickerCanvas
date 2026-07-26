"use client";

import { useEffect, useRef } from "react";
import type { Application as PixiApplication } from "pixi.js";
import type { BackgroundDissolveTexture } from "@/lib/background-dissolve";

export type BackgroundDissolveEffectData = BackgroundDissolveTexture & {
  id: string;
  centerX: number;
  centerY: number;
  displayWidth: number;
  displayHeight: number;
  rotation: number;
};

type BackgroundDissolveEffectProps = {
  effect: BackgroundDissolveEffectData;
  onReady: (id: string) => void;
  onComplete: (id: string) => void;
};

const EFFECT_PADDING = 72;
type PixiModule = typeof import("pixi.js");
let pixiModulePromise: Promise<PixiModule> | null = null;

function loadPixiModule() {
  pixiModulePromise ??= import("pixi.js");
  return pixiModulePromise;
}

// eslint-disable-next-line react-refresh/only-export-components
export async function preloadBackgroundDissolveEffect() {
  await loadPixiModule();
}

const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(vec2 positionValue) {
  vec2 position = positionValue * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y =
    position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) -
    uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(vec2 positionValue) {
  return positionValue * (uOutputFrame.zw * uInputSize.zw);
}

void main() {
  gl_Position = filterVertexPosition(aPosition);
  vTextureCoord = filterTextureCoord(aPosition);
}
`;

const FILTER_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uProgress;
uniform float uTime;
uniform float uSeed;
uniform float uEdgeWidth;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32 + uSeed);
  return fract(point.x * point.y);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.56;
  mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
  for (int octave = 0; octave < 4; octave++) {
    value += valueNoise(point) * amplitude;
    point = rotation * point * 2.03 + 9.17;
    amplitude *= 0.48;
  }
  return value;
}

void main() {
  vec4 source = texture(uTexture, vTextureCoord);
  if (source.a < 0.002) {
    finalColor = vec4(0.0);
    return;
  }

  vec2 drift = vec2(uTime * 0.035, -uTime * 0.022);
  float broadNoise = fbm(vTextureCoord * 3.35 + drift);
  float detailNoise = fbm(vTextureCoord * 10.5 - drift * 1.7);
  float direction =
    vTextureCoord.x * 0.11 + (1.0 - vTextureCoord.y) * 0.055;
  float field = broadNoise * 0.72 + detailNoise * 0.28 + direction;
  float threshold = mix(-0.14, 1.42, uProgress);
  float visibility = smoothstep(
    threshold - 0.034,
    threshold + 0.034,
    field
  );
  float edge = 1.0 - smoothstep(
    0.0,
    uEdgeWidth,
    abs(field - threshold)
  );
  edge *= visibility;

  float alpha = source.a * visibility;
  vec3 straightColor = source.rgb / max(source.a, 0.001);
  vec3 paperFiber = vec3(1.0, 0.88, 0.66);
  vec3 color = mix(straightColor, paperFiber, edge * 0.58);
  finalColor = vec4(color * alpha, alpha);
}
`;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function easeOutQuart(value: number) {
  return 1 - (1 - value) ** 4;
}

function createBackgroundCanvas(effect: BackgroundDissolveEffectData) {
  const canvas = document.createElement("canvas");
  canvas.width = effect.width;
  canvas.height = effect.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Dissolve texture unavailable");
  const pixels = new Uint8ClampedArray(effect.pixels.length);
  pixels.set(effect.pixels);
  context.putImageData(
    new ImageData(pixels, effect.width, effect.height),
    0,
    0,
  );
  return canvas;
}

function createParticleCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 20;
  canvas.height = 20;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Particle texture unavailable");
  const gradient = context.createRadialGradient(10, 10, 0, 10, 10, 10);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 20, 20);
  return canvas;
}

export function BackgroundDissolveEffect({
  effect,
  onReady,
  onComplete,
}: BackgroundDissolveEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let app: PixiApplication | null = null;
    let animationFrame = 0;
    let disposed = false;
    let ready = false;
    let completed = false;

    const markReady = () => {
      if (ready || disposed) return;
      ready = true;
      onReady(effect.id);
    };

    const finish = () => {
      if (completed || disposed) return;
      markReady();
      completed = true;
      onComplete(effect.id);
    };

    const destroy = () => {
      cancelAnimationFrame(animationFrame);
      if (!app) return;
      app.destroy(
        { removeView: false },
        {
          children: true,
          texture: true,
          textureSource: true,
          context: true,
        },
      );
      app = null;
    };

    const start = async () => {
      try {
        const {
          Application,
          Filter,
          Particle,
          ParticleContainer,
          Sprite,
          Texture,
          UniformGroup,
        } = await loadPixiModule();
        if (disposed) return;

        const nextApp = new Application();
        await nextApp.init({
          canvas,
          width: effect.width + EFFECT_PADDING * 2,
          height: effect.height + EFFECT_PADDING * 2,
          backgroundAlpha: 0,
          antialias: false,
          resolution: 1,
          autoStart: false,
          preference: "webgl",
          powerPreference: "high-performance",
        });
        app = nextApp;
        if (disposed) {
          destroy();
          return;
        }

        const backgroundCanvas = createBackgroundCanvas(effect);
        const backgroundTexture = Texture.from(backgroundCanvas, true);
        const background = new Sprite(backgroundTexture);
        background.position.set(EFFECT_PADDING, EFFECT_PADDING);
        background.width = effect.width;
        background.height = effect.height;

        const dissolveUniforms = new UniformGroup({
          uProgress: { value: 0, type: "f32" },
          uTime: { value: 0, type: "f32" },
          uSeed: {
            value: ((effect.width * 17 + effect.height * 31) % 997) / 997,
            type: "f32",
          },
          uEdgeWidth: { value: 0.075, type: "f32" },
        });
        const dissolveFilter = Filter.from({
          gl: {
            vertex: FILTER_VERTEX,
            fragment: FILTER_FRAGMENT,
          },
          resources: { dissolveUniforms },
          antialias: false,
          padding: 2,
        });
        background.filters = [dissolveFilter];

        const particleCanvas = createParticleCanvas();
        const particleTexture = Texture.from(particleCanvas, true);
        const particleContainer = new ParticleContainer({
          texture: particleTexture,
          dynamicProperties: {
            position: true,
            vertex: true,
            rotation: false,
            color: true,
          },
        });
        const particleStates = effect.particles.map((seed) => {
          const particle = new Particle({
            texture: particleTexture,
            x: EFFECT_PADDING + seed.x,
            y: EFFECT_PADDING + seed.y,
            anchorX: 0.5,
            anchorY: 0.5,
            tint:
              (seed.red << 16) |
              (seed.green << 8) |
              seed.blue,
            alpha: 0,
          });
          particleContainer.addParticle(particle);
          return {
            seed,
            particle,
            scale: seed.size / 5,
          };
        });

        nextApp.stage.addChild(background);
        nextApp.stage.addChild(particleContainer);
        nextApp.render();
        markReady();

        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        const duration = reducedMotion ? 920 : 1_160;
        const movementScale = reducedMotion ? 0.48 : 1;
        const startedAt = performance.now();

        const render = (now: number) => {
          if (disposed || !app) return;
          const progress = clamp((now - startedAt) / duration);
          dissolveUniforms.uniforms.uProgress = progress;
          dissolveUniforms.uniforms.uTime = (now - startedAt) / 1_000;

          for (const { seed, particle, scale } of particleStates) {
            const life = clamp(
              (progress - seed.delay) /
                Math.max(0.01, 1 - seed.delay),
            );
            if (life <= 0 || life >= 1) {
              particle.alpha = 0;
              continue;
            }
            const travel = easeOutQuart(life);
            particle.x =
              EFFECT_PADDING +
              seed.x +
              seed.driftX * travel * movementScale;
            particle.y =
              EFFECT_PADDING +
              seed.y +
              seed.driftY * travel * movementScale +
              effect.height * 0.032 * life * life * movementScale;
            const particleScale = scale * (0.82 + life * 0.72);
            particle.scaleX = particleScale;
            particle.scaleY = particleScale;
            particle.alpha = seed.alpha * (1 - life) ** 1.35;
          }

          app.render();
          if (progress < 1) {
            animationFrame = requestAnimationFrame(render);
          } else {
            animationFrame = requestAnimationFrame(() => {
              if (!disposed) finish();
            });
          }
        };

        animationFrame = requestAnimationFrame(() => {
          animationFrame = requestAnimationFrame(render);
        });
      } catch {
        finish();
      }
    };

    void start();
    return () => {
      disposed = true;
      destroy();
    };
  }, [effect, onComplete, onReady]);

  const widthScale =
    (effect.width + EFFECT_PADDING * 2) / effect.width;
  const heightScale =
    (effect.height + EFFECT_PADDING * 2) / effect.height;

  return (
    <canvas
      ref={canvasRef}
      className="background-dissolve-canvas"
      data-background-dissolve
      data-renderer="pixi"
      width={effect.width + EFFECT_PADDING * 2}
      height={effect.height + EFFECT_PADDING * 2}
      style={{
        left: effect.centerX,
        top: effect.centerY,
        width: effect.displayWidth * widthScale,
        height: effect.displayHeight * heightScale,
        transform: `translate(-50%, -50%) rotate(${effect.rotation}deg)`,
      }}
      aria-hidden="true"
    />
  );
}
