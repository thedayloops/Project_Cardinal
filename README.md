# Project Cardinal

Project Cardinal is a **headless, deterministic simulation engine** for modeling large numbers of NPCs under real-world constraints, inspired by governed systems such as *SAO Alicization* — without sensory immersion, consciousness framing, or real-time embodiment.

The project is built around **vertical slices**, prioritizing stability, explainability, and observability over scale or spectacle.

---

## Core Principles

- **Headless-first** — no rendering or UI dependencies
- **Deterministic by seed** — every run is reproducible
- **Bounded agents** — NPCs are explicitly non-conscious
- **Explainable decisions** — no opaque black-box behavior
- **Governed evolution** — changes are tested before adoption

---

## Current Features (Slices 1–4)

### 🧩 Simulation Kernel
- Discrete tick-based loop
- Deterministic RNG
- Event logging and metrics aggregation
- World with threats and consumable resources

### 🤖 NPC Model
- Individual needs: hunger, fatigue
- Traits: boldness, caution, curiosity
- Mechanized emotions (currently fear)
- Per-tick perception and action selection

### 🎯 Action Selection
- Bounded-rational decision making (softmax)
- Fear biases risk and urgency
- Stochastic but explainable outcomes

### 🧭 Group Contracts (Slice 4)
NPCs may participate in structured coordination via contracts:
- **PATROL** — follow waypoint routes
- **HUNT** — converge on threats
- **ESCORT** — remain near a leader

Contracts influence behavior without overriding survival instincts.

### 🏛 Governor Scaffold (Slice 4)
A Cardinal-like governor can:
- Run baseline vs canary simulations
- Compare outcomes across seeds
- Propose bounded parameter interventions
- Accept or reject changes based on explicit criteria

The governor is intentionally conservative and explainable.

---

## Running the Project

### Install
```bash
npm install
