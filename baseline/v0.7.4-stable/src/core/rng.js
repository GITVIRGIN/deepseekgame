const MOD = 2 ** 32;

export function nextSeed(seed) {
  return (seed * 1664525 + 1013904223) >>> 0;
}

export function random(run) {
  run.seed = nextSeed(run.seed);
  return run.seed / MOD;
}

export function randomInt(run, min, max) {
  return Math.floor(random(run) * (max - min + 1)) + min;
}

export function choice(run, list) {
  return list[Math.floor(random(run) * list.length)];
}

export function shuffle(run, list) {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random(run) * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function weightedChoice(run, items, weightOf) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = random(run) * total;

  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) {
      return item;
    }
  }

  return items.at(-1);
}
