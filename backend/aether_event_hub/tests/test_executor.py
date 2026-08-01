import pytest
from backend.aether_event_hub.core.executors.asyncio_executor import AsyncioTaskExecutor
from backend.aether_event_hub.core.executors.base import TaskResult

@pytest.mark.asyncio
async def test_asyncio_executor_success():
    executor = AsyncioTaskExecutor()
    
    async def sample_async_handler(payload):
        return {"greeting": f"Hello {payload.get('name')}"}
        
    executor.register_handler("say_hello", sample_async_handler)
    result = await executor.execute("say_hello", {"name": "Aether"})
    
    assert isinstance(result, TaskResult)
    assert result.success is True
    assert result.result_data == {"greeting": "Hello Aether"}
    assert result.execution_time_ms >= 0

@pytest.mark.asyncio
async def test_asyncio_executor_unregistered_handler():
    executor = AsyncioTaskExecutor()
    result = await executor.execute("unknown_task", {})
    assert result.success is False
    assert "No handler registered" in result.error_message

@pytest.mark.asyncio
async def test_asyncio_executor_handler_exception():
    executor = AsyncioTaskExecutor()
    
    def failing_handler(payload):
        raise ValueError("Simulated handler crash")
        
    executor.register_handler("crash_task", failing_handler)
    result = await executor.execute("crash_task", {})
    assert result.success is False
    assert "Simulated handler crash" in result.error_message
