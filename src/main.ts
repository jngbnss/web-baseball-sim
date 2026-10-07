import './style.css';
import { Game, parsePitchList } from './core/Game';

async function boot(): Promise<void> {
  const container = document.getElementById('app')!;
  const loading = document.getElementById('loading')!;
  const params = new URLSearchParams(location.search);

  try {
    const game = await Game.create(container, {
      pitches: parsePitchList(params.get('pitches')),
      debug: params.has('debug'),
    });
    game.start();
    loading.classList.add('done');

    // Console handle for playtests / perf experiments:
    //   wbs.telemetry.download(), wbs.perf.snapshot()
    Object.assign(window, { wbs: { game, telemetry: game.telemetry, perf: game.perf } });
  } catch (err) {
    console.error(err);
    loading.classList.add('error');
    loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}\n(WebGL + WebAssembly are required — try the latest Chrome.)`;
  }
}

void boot();
