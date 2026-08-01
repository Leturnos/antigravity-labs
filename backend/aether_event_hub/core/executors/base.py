from abc import ABC, abstractmethod
from typing import Any, Dict
from dataclasses import dataclass

@dataclass
class TaskResult:
    success: bool
    result_data: Dict[str, Any] | None = None
    error_message: str | None = None
    execution_time_ms: float = 0.0

class BaseTaskExecutor(ABC):
    """Abstract interface for task execution backends (Asyncio, Multiprocessing, Distributed)."""

    @abstractmethod
    async def execute(self, task_name: str, payload: Dict[str, Any]) -> TaskResult:
        """Executes a task handler given its registered name and payload dictionary."""
        pass
