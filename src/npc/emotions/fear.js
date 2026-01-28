import { clamp01 } from "../../policy/selectors/softmax.js";

/**
 * Mechanized fear:
 * - value: 0..1
 * - rises with threat proximity + threat danger
 * - decays when safe
 *
 * This is explicitly NOT consciousness framing—just state variables affecting choice.
 */
export function makeFear() {
  return {
    value: 0,
    lastStimulus: 0
  };
}

export function updateFear({ fear, threatSignal, config }) {
  // threatSignal is 0..1-ish (already normalized)
  fear.lastStimulus = threatSignal;

  const gain = config.fear.gain;
  const decay = config.fear.decay;

  if (threatSignal > fear.value) {
    fear.value = clamp01(fear.value + gain * (threatSignal - fear.value));
  } else {
    fear.value = clamp01(fear.value - decay * (fear.value - threatSignal));
  }
}
