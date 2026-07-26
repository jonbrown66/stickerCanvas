# AGENTS.md

## Project Context

This repository is a React, TypeScript, and Vite sticker-canvas application.

The product priorities are:

- Smooth dragging, resizing, rotating, and pointer-following effects.
- High-quality cutout, outline, Holo, dissolve, and PNG export results.
- Minimal UI with a refined paper-and-sticker visual style.
- Local-first image processing and responsive desktop/mobile behavior.

All user-facing communication must be in Chinese.

## Engineering Rules

- Read the relevant implementation and existing tests before editing.
- Make the smallest maintainable change that satisfies the request.
- Reuse existing components, utilities, CSS conventions, and state patterns.
- Do not introduce a dependency when the behavior can be implemented clearly
  with the existing stack.
- Do not weaken TypeScript types or remove tests.
- Preserve unrelated user changes in the working tree.
- Do not commit, push, change remotes, or deploy unless the user explicitly
  requests it.

## Performance Rules

- Pointer-move, drag, resize, rotate, and visual-follow interactions must not
  call React state setters on every frame.
- Prefer refs, CSS variables, compositor-friendly transforms, and a single
  `requestAnimationFrame` loop for high-frequency visual updates.
- Animate `transform` and `opacity` whenever possible.
- Load heavy optional rendering libraries only when their feature is needed.
- Clean up animation frames, object URLs, textures, workers, and event
  listeners.
- Keep control handles and toolbars responsive even when the sticker visual
  layer uses filters, WebGL, SVG, or 3D transforms.

## Visual and Export Rules

- Preserve source-image contrast and skin tones; effects should not become a
  uniform bright color wash.
- Holo effects should coordinate border spectrum, foil, glare, and 3D tilt
  from the same pointer input.
- Dynamic preview effects and downloaded PNG output are separate pipelines.
  Do not claim export parity unless the export pipeline implements the effect.
- Respect `prefers-reduced-motion`, while keeping direct user-controlled
  interactions functional.

## Model Routing

Use model routing only when the collaboration surface and higher-level
instructions allow delegation.

### Primary Agent

The primary agent is responsible for:

- Requirement interpretation and product decisions.
- Architecture and cross-module design.
- Ambiguous or repeated-failure debugging.
- Performance, security, persistence, and export correctness decisions.
- Resolving conflicts between delegated changes.
- Reviewing the final diff and reporting remaining risks.

Prefer `gpt-5.6-sol` for complex planning, difficult root-cause analysis,
cross-module changes, and final review. Use medium reasoning by default and
increase it only when the problem is genuinely complex.

### Execution Agents

After the plan and acceptance criteria are stable, delegate bounded execution
tasks to `gpt-5.6-terra`.

Use:

- `gpt-5.6-terra` with low reasoning for file discovery, mechanical edits,
  documentation, formatting, and routine validation.
- `gpt-5.6-terra` with medium reasoning for clearly specified component work,
  CSS implementation, tests, and isolated bug fixes.
- `gpt-5.6-terra` with high reasoning only for a bounded task that still needs
  non-trivial implementation judgment.

Do not delegate:

- Tiny edits where coordination costs more than implementation.
- An unresolved product or architecture decision.
- Security-sensitive or destructive work.
- The same files to multiple agents at the same time.
- A bug whose root cause is not yet established.

### Delegation Contract

Every delegated task must be self-contained and specify:

- The exact objective.
- Relevant files and boundaries.
- Existing behavior that must be preserved.
- Acceptance criteria.
- Validation commands.
- Actions that are explicitly out of scope.

When overriding the sub-agent model or reasoning effort, use a context fork
mode compatible with overrides and provide all required context in the task
message. Do not assume the sub-agent has the primary agent's full history.

The primary agent must inspect delegated changes before completion. A
sub-agent reporting success is not final verification.

## Validation

Run validation in proportion to the change:

- `npm run typecheck` for TypeScript changes.
- `npm run lint` for source and style changes.
- `node --test tests/*.test.mjs` for behavior covered by the current tests.
- `npm run build` for dependency, bundling, worker, WebGL, or production-path
  changes.

For visual interactions, verify the exact state transition when practical, but
do not replace the user's visual judgment with automated screenshots.

## Completion Report

Report:

### Summary

What changed and the resulting behavior.

### Files Changed

Which files changed and why.

### Validation

Which checks ran and their results.

### Risks

Known limitations, assumptions, and follow-up work.
