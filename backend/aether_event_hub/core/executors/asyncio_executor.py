import time
import inspect
from typing import Callable, Dict, Any
from backend.aether_event_hub.core.executors.base import BaseTaskExecutor, TaskResult

class AsyncioTaskExecutor(BaseTaskExecutor):
    """Concrete Asyncio-based Task Executor implementation."""

    def __init__(self):
        self._handlers: Dict[str, Callable] = {}

    def register_handler(self, name: str, handler: Callable):
        self._handlers[name] = handler

    async def execute(self, task_name: str, payload: Dict[str, Any]) -> TaskResult:
        if task_name not in self._handlers:
            return TaskResult(
                success=False,
                error_message=f"No handler registered for task: '{task_name}'"
            )

        handler = self._handlers[task_name]
        start_time = time.perf_counter()
        try:
            if inspect.iscoroutinefunction(handler):
                res = await handler(payload)
            else:
                res = handler(payload)
            duration = (time.perf_counter() - start_time) * 1000.0
            result_dict = res if isinstance(res, dict) else {"output": res}
            return TaskResult(success=True, result_data=result_dict, execution_time_ms=duration)
        except Exception as e:
            duration = (time.perf_counter() - start_time) * 1000.0
            return TaskResult(success=False, error_message=str(e), execution_time_ms=duration)
