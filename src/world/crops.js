export const CropStates = Object.freeze({
  GROWING: "GROWING",
  RIPE: "RIPE"
});

export function makeCropPlot({
  id,
  x,
  y,
  growthRate,
  yieldAmount,
  ownerId = null
}) {
  return {
    id,
    x,
    y,
    growth: 0,
    growthRate,
    yieldAmount,
    state: CropStates.GROWING,
    ownerId
  };
}

export function tickCrop(crop) {
  if (crop.state === CropStates.RIPE) return;

  crop.growth += crop.growthRate;
  if (crop.growth >= 1) {
    crop.growth = 1;
    crop.state = CropStates.RIPE;
  }
}
