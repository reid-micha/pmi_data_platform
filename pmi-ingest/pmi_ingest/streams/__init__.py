"""Long-lived streaming consumers (vs. one-shot pollers in `pollers/`).

The distinction:
* `pollers/` — `run_once()` returns; CLI / cron / Arq invoke on a cadence.
* `streams/` — `run_forever()` holds the connection; the process IS the loop.

The two write into the same `audit_source_health` / `ts_*` tables so
observability is uniform. Streams emit a synthetic heartbeat poll-log row
every `heartbeat_sec` so a dead WS still trips the `consecutive_failures`
alert in §3.3.
"""
