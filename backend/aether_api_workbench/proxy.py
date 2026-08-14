"""HTTP and WebSocket proxy endpoints with latency calculation and history logging for Aether API Workbench."""

import asyncio
import json
import time
import urllib.parse
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.responses import JSONResponse
import httpx
from sqlalchemy.orm import Session
import websockets
import websockets.exceptions

from .database import get_db
from .models import HistoryLog
from .schemas import ProxyRequestPayload, ProxyResponseOut

proxy_router = APIRouter()


async def measure_dns_time(url: str) -> float:
    """Measure DNS resolution timing in milliseconds for the given URL."""
    try:
        parsed = urllib.parse.urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return 0.0

        port = parsed.port
        if not port:
            port = 443 if parsed.scheme == "https" else 80

        t0 = time.perf_counter()
        loop = asyncio.get_running_loop()
        await loop.getaddrinfo(hostname, port)
        dns_ms = (time.perf_counter() - t0) * 1000.0
        return round(dns_ms, 2)
    except Exception:
        return 0.0


@proxy_router.post("", response_model=ProxyResponseOut)
@proxy_router.post("/", response_model=ProxyResponseOut)
async def http_proxy(payload: ProxyRequestPayload, db: Session = Depends(get_db)):
    """Execute an HTTP request on behalf of the client, measuring DNS, TTFB, and total latency."""
    method = payload.method.upper()
    url = payload.url.strip()

    if not url:
        raise HTTPException(status_code=400, detail="Target URL cannot be empty.")

    # Measure DNS lookup timing
    dns_time_ms = await measure_dns_time(url)

    # Sanitize request headers
    headers: Dict[str, str] = {}
    if payload.headers:
        for k, v in payload.headers.items():
            if k.lower() != "host":
                headers[k] = str(v)

    # Prepare request body
    content: Optional[bytes] = None
    json_data: Any = None

    if payload.body is not None:
        if isinstance(payload.body, (dict, list)):
            json_data = payload.body
        elif isinstance(payload.body, str):
            content = payload.body.encode("utf-8")
        else:
            content = str(payload.body).encode("utf-8")

    t_start = time.perf_counter()
    ttfb_ms: float = 0.0

    async def on_response(response: httpx.Response):
        nonlocal ttfb_ms
        ttfb_ms = (time.perf_counter() - t_start) * 1000.0

    timeout = httpx.Timeout(payload.timeout_seconds)

    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            event_hooks={"response": [on_response]},
        ) as client:
            res = await client.request(
                method=method,
                url=url,
                headers=headers,
                params=payload.params,
                content=content,
                json=json_data,
            )

        total_time_ms = (time.perf_counter() - t_start) * 1000.0
        execution_time_ms = int(total_time_ms)
        ttfb_ms_rounded = round(ttfb_ms, 2)
        total_time_ms_rounded = round(total_time_ms, 2)

        # Build response headers dictionary
        res_headers = {k: v for k, v in res.headers.items()}

        # Log execution in HistoryLog table
        req_body_str: Optional[str] = None
        if payload.body is not None:
            if isinstance(payload.body, (dict, list)):
                req_body_str = json.dumps(payload.body)
            else:
                req_body_str = str(payload.body)

        history_entry = HistoryLog(
            request_method=method,
            request_url=url,
            request_headers=json.dumps(headers) if headers else "{}",
            request_body=req_body_str,
            response_status=res.status_code,
            response_headers=json.dumps(res_headers),
            response_body=res.text,
            execution_time_ms=execution_time_ms,
            is_mock=False,
        )
        db.add(history_entry)
        db.commit()

        timing_info = {
            "dns_ms": dns_time_ms,
            "ttfb_ms": ttfb_ms_rounded,
            "total_ms": total_time_ms_rounded,
        }

        return ProxyResponseOut(
            status_code=res.status_code,
            headers=res_headers,
            body=res.text,
            execution_time_ms=execution_time_ms,
            is_mock=False,
            dns_time_ms=dns_time_ms,
            ttfb_ms=ttfb_ms_rounded,
            total_time_ms=total_time_ms_rounded,
            timing=timing_info,
        )

    except httpx.TimeoutException as e:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Request to '{url}' timed out after {payload.timeout_seconds} seconds.",
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Proxy error connecting to '{url}': {str(e)}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal proxy error: {str(e)}",
        ) from e


@proxy_router.websocket("/ws")
@proxy_router.websocket("/ws/")
async def websocket_proxy(websocket: WebSocket, target_url: Optional[str] = None):
    """Real-time WebSocket proxy endpoint with frame relay and latency calculation."""
    await websocket.accept()

    # Extract target_url from query params if not explicitly passed
    if not target_url:
        target_url = (
            websocket.query_params.get("target_url")
            or websocket.query_params.get("url")
            or websocket.query_params.get("target")
        )

    if not target_url:
        try:
            initial_raw = await websocket.receive_text()
            initial_data = json.loads(initial_raw)
            target_url = (
                initial_data.get("target_url")
                or initial_data.get("url")
                or initial_data.get("target")
            )
        except Exception:
            pass

    if not target_url:
        await websocket.send_json(
            {"error": "Missing target_url parameter or initial config frame"}
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        async with websockets.connect(target_url) as target_ws:
            last_sent_time: Optional[float] = None

            async def forward_client_to_target():
                nonlocal last_sent_time
                try:
                    while True:
                        msg = await websocket.receive()
                        if "text" in msg and msg["text"] is not None:
                            last_sent_time = time.perf_counter()
                            await target_ws.send(msg["text"])
                        elif "bytes" in msg and msg["bytes"] is not None:
                            last_sent_time = time.perf_counter()
                            await target_ws.send(msg["bytes"])
                        elif msg.get("type") == "websocket.disconnect":
                            break
                except (WebSocketDisconnect, websockets.exceptions.ConnectionClosed):
                    pass

            async def forward_target_to_client():
                nonlocal last_sent_time
                try:
                    async for frame in target_ws:
                        recv_time = time.perf_counter()
                        latency_ms: Optional[float] = None
                        if last_sent_time is not None:
                            latency_ms = round((recv_time - last_sent_time) * 1000.0, 2)

                        if isinstance(frame, str):
                            try:
                                parsed = json.loads(frame)
                                if isinstance(parsed, dict):
                                    parsed["_latency_ms"] = latency_ms
                                    await websocket.send_text(json.dumps(parsed))
                                else:
                                    await websocket.send_text(frame)
                            except Exception:
                                await websocket.send_text(frame)
                        elif isinstance(frame, bytes):
                            await websocket.send_bytes(frame)
                except (WebSocketDisconnect, websockets.exceptions.ConnectionClosed):
                    pass

            task_client = asyncio.create_task(forward_client_to_target())
            task_target = asyncio.create_task(forward_target_to_client())

            done, pending = await asyncio.wait(
                [task_client, task_target], return_when=asyncio.FIRST_COMPLETED
            )
            for t in pending:
                t.cancel()

    except Exception as e:
        try:
            await websocket.send_json(
                {"error": f"Failed to connect to target websocket: {str(e)}"}
            )
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except Exception:
            pass
