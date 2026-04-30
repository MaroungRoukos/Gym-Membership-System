import logging
import time

from django.conf import settings
from django.db import connection

logger = logging.getLogger("django.db.backends")


class SlowQueryLogMiddleware:
    """
    Temporary profiling middleware to log slow SQL queries.
    Enable by default in DEBUG and threshold can be tuned via env var.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.threshold_ms = float(getattr(settings, "SLOW_QUERY_THRESHOLD_MS", 100))

    def __call__(self, request):
        if not settings.DEBUG:
            return self.get_response(request)

        def wrapper(execute, sql, params, many, context):
            start = time.perf_counter()
            try:
                return execute(sql, params, many, context)
            finally:
                elapsed_ms = (time.perf_counter() - start) * 1000
                if elapsed_ms >= self.threshold_ms:
                    logger.warning(
                        "slow_query %.1fms %s",
                        elapsed_ms,
                        sql.replace("\n", " ")[:800],
                    )

        with connection.execute_wrapper(wrapper):
            return self.get_response(request)
