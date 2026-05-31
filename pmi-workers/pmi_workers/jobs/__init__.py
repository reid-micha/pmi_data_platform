"""Job package — importing it triggers @register side-effects.

Every job module must import `from pmi_workers.registry import register` and
decorate at least one coroutine. Add new modules below to enroll them at
process start.
"""

from __future__ import annotations

from pmi_workers.jobs import (  # noqa: F401  registration side-effects
    daily,
    hourly,
    score,
    score_all,
)
