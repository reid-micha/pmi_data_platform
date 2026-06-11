# pmi-demo (fixtures only — container retired)

This directory used to be Step C of P0 bootstrap (a throwaway `Dockerfile` +
`run.py` exposed via `just demo-stub` / `just demo-llm`). That container was
never finished, so as of SHIP-4.1 we've **retired the placeholder** rather
than ship a broken target.

The fixtures are still load-bearing and stay here:

- `./fixtures/markets.json` — synthetic Polymarket markets covering war +
  US 2026 senate/house seats. Mounted read-only into `pmi-core` at
  `/app/fixtures` so `just pmi-seed` has something to load when `pmi-ingest`
  hasn't run yet, and consumed in-process by `pmi-core dry-run`.

The "throwaway end-to-end demo" use case is now covered by **`just dry-run`**
(no docker, no postgres, no LLM) — see
[`pmi-core/pmi_core/engine/dry_run.py`](../pmi-core/pmi_core/engine/dry_run.py)
and the SHIP-3.1 entry (done; recorded in git history — the themed TODO files were consolidated into `../TODO.md` on 2026-06-11).
