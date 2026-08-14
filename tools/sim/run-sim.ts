/**
 * Headless balance harness.
 *
 * Runs a population of bot flights per character and prints the distribution
 * that the balance pass is tuned against. Run with:
 *   npm run sim -- --runs 400 --skill 0.7
 */
import { runBot } from '@/sim/bot';
import { CHARACTER_ORDER, type CharacterId } from '@/data/characters';
import type { RunStats } from '@/sim/types';

interface Args {
  runs: number;
  skill: number;
  seed: number;
  characters: CharacterId[];
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const chars = get('--character');
  return {
    runs: Number(get('--runs') ?? 300),
    skill: Number(get('--skill') ?? 0.7),
    seed: Number(get('--seed') ?? 1337),
    characters: chars
      ? (chars.split(',') as CharacterId[])
      : CHARACTER_ORDER.filter((c) => c !== 'eithan'),
    json: argv.includes('--json'),
  };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

export interface CharacterReport {
  character: CharacterId;
  runs: number;
  median: number;
  p10: number;
  p90: number;
  max: number;
  mean: number;
  medianScore: number;
  meanBeasts: number;
  deathRate: number;
  deaths: Record<string, number>;
  hits: Record<string, number>;
  meanFlightSeconds: number;
  /** Share of runs reaching 300 m — the first-run comprehension target. */
  reach300: number;
  reach1km: number;
}

export function simulateCharacter(
  character: CharacterId,
  runs: number,
  skill: number,
  seed: number,
): CharacterReport {
  const distances: number[] = [];
  const scores: number[] = [];
  const deaths: Record<string, number> = {};
  const hits: Record<string, number> = {};
  let beasts = 0;
  let died = 0;
  let flight = 0;

  for (let i = 0; i < runs; i++) {
    const stats: RunStats = runBot({ character, seed: seed + i * 7919, skill });
    distances.push(stats.distance);
    scores.push(stats.score);
    beasts += stats.beasts;
    flight += stats.flightTime;
    if (stats.deathCause) {
      died++;
      deaths[stats.deathCause] = (deaths[stats.deathCause] ?? 0) + 1;
    }
    for (const [k, v] of Object.entries(stats.hits)) {
      if (k.startsWith('death.')) continue;
      hits[k] = (hits[k] ?? 0) + v;
    }
  }

  distances.sort((a, b) => a - b);
  scores.sort((a, b) => a - b);

  return {
    character,
    runs,
    median: percentile(distances, 0.5),
    p10: percentile(distances, 0.1),
    p90: percentile(distances, 0.9),
    max: distances[distances.length - 1] ?? 0,
    mean: distances.reduce((a, b) => a + b, 0) / runs,
    medianScore: percentile(scores, 0.5),
    meanBeasts: beasts / runs,
    deathRate: died / runs,
    deaths,
    hits: Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, +(v / runs).toFixed(2)])),
    meanFlightSeconds: flight / runs,
    reach300: distances.filter((d) => d >= 300).length / runs,
    reach1km: distances.filter((d) => d >= 1000).length / runs,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reports = args.characters.map((c) =>
    simulateCharacter(c, args.runs, args.skill, args.seed),
  );

  if (args.json) {
    process.stdout.write(JSON.stringify(reports, null, 2) + '\n');
    return;
  }

  const pad = (s: string | number, n: number) => String(s).padStart(n);
  console.log(`\nBalance report — ${args.runs} runs/character, skill ${args.skill}\n`);
  console.log(
    `${'char'.padEnd(8)}${pad('p10', 8)}${pad('median', 9)}${pad('p90', 9)}${pad('max', 9)}` +
      `${pad('score', 9)}${pad('beasts', 8)}${pad('death%', 8)}${pad('300m%', 8)}${pad('1km%', 7)}${pad('secs', 7)}`,
  );
  for (const r of reports) {
    console.log(
      `${r.character.padEnd(8)}${pad(r.p10.toFixed(0), 8)}${pad(r.median.toFixed(0), 9)}` +
        `${pad(r.p90.toFixed(0), 9)}${pad(r.max.toFixed(0), 9)}${pad(r.medianScore.toFixed(0), 9)}` +
        `${pad(r.meanBeasts.toFixed(1), 8)}${pad((r.deathRate * 100).toFixed(0), 8)}` +
        `${pad((r.reach300 * 100).toFixed(0), 8)}${pad((r.reach1km * 100).toFixed(0), 7)}` +
        `${pad(r.meanFlightSeconds.toFixed(1), 7)}`,
    );
  }

  const medians = reports.map((r) => r.median);
  const lo = Math.min(...medians);
  const hi = Math.max(...medians);
  console.log(`\nmedian spread: ${(((hi - lo) / hi) * 100).toFixed(1)}% (parity target <= 15%)`);

  console.log('\ndeaths by cause:');
  for (const r of reports) {
    const causes = Object.entries(r.deaths)
      .map(([k, v]) => `${k} ${((v / r.runs) * 100).toFixed(0)}%`)
      .join('  ');
    console.log(`  ${r.character.padEnd(8)} ${causes || 'none'}`);
  }

  console.log('\nmean hits per run:');
  for (const r of reports) {
    const list = Object.entries(r.hits)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join('  ');
    console.log(`  ${r.character.padEnd(8)} ${list}`);
  }
  console.log('');
}

main();
