"""Score API routes for games — single source of truth for score persistence."""

import json
import os
import copy

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["scores"])

SCORE_FILE = os.path.join(os.path.dirname(__file__), "..", "scores_db.json")

DEFAULT_SCORES = {
    "chess": {"vitorias": 0, "derrotas": 0, "empates": 0},
    "minesweeper": {"vitorias": 0, "derrotas": 0, "tempo_recorde": 0},
    "tetris": {
        "classico": {
            "pontuacao_maxima": 0,
            "linhas_maximas": 0,
            "vitorias": 0,
            "derrotas": 0,
        },
        "contrarrelogio": {"tempo_recorde": 0},
    },
    "snake": {"pontuacao_maxima": 0, "comprimento_maximo": 0, "partidas_jogadas": 0},
    "tictactoe": {"vitorias": 0, "derrotas": 0, "empates": 0},
    "poker": {
        "cash": {"vitorias": 0, "derrotas": 0},
        "torneio": {"vitorias": 0, "derrotas": 0},
        "maior_stack": 0,
    },
}

NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


def _load_db() -> dict:
    if os.path.exists(SCORE_FILE):
        try:
            with open(SCORE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            for game, default_val in DEFAULT_SCORES.items():
                if game not in data:
                    data[game] = copy.deepcopy(default_val)
            return data
        except Exception:
            pass
    return copy.deepcopy(DEFAULT_SCORES)


def _save_db(data: dict) -> None:
    dir_name = os.path.dirname(SCORE_FILE)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    with open(SCORE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── GET /api/score ──────────────────────────────────────────────────────────

@router.get("/score")
async def get_score(game: str | None = None):
    db = _load_db()
    payload = db.get(game, db) if game else db
    return JSONResponse(content=payload, headers=NO_CACHE_HEADERS)


# ── POST /api/score ─────────────────────────────────────────────────────────

@router.post("/score")
async def post_score(game: str, request: Request):
    data = await request.json()
    db = _load_db()

    if game == "chess":
        result = data.get("result")
        if result == "win":
            db["chess"]["vitorias"] += 1
        elif result == "loss":
            db["chess"]["derrotas"] += 1
        elif result == "draw":
            db["chess"]["empates"] += 1
        _save_db(db)
        return {"success": True, "scores": db["chess"]}

    if game == "minesweeper":
        result = data.get("result")
        time_taken = data.get("time")
        if result == "win":
            db["minesweeper"]["vitorias"] += 1
            if time_taken is not None:
                current = db["minesweeper"].get("tempo_recorde", 0)
                if current == 0 or time_taken < current:
                    db["minesweeper"]["tempo_recorde"] = time_taken
        elif result == "loss":
            db["minesweeper"]["derrotas"] += 1
        _save_db(db)
        return {"success": True, "scores": db["minesweeper"]}

    if game == "tetris":
        mode = data.get("mode", "classico")
        result = data.get("result")
        if mode == "classico":
            score = data.get("score", 0)
            lines = data.get("lines", 0)
            if result == "win":
                db["tetris"]["classico"]["vitorias"] += 1
            elif result == "loss":
                db["tetris"]["classico"]["derrotas"] += 1
            if score > db["tetris"]["classico"].get("pontuacao_maxima", 0):
                db["tetris"]["classico"]["pontuacao_maxima"] = score
            if lines > db["tetris"]["classico"].get("linhas_maximas", 0):
                db["tetris"]["classico"]["linhas_maximas"] = lines
        elif mode == "contrarrelogio":
            time_taken = data.get("time", 0)
            if result == "win" and time_taken > 0:
                current = db["tetris"]["contrarrelogio"].get("tempo_recorde", 0)
                if current == 0 or time_taken < current:
                    db["tetris"]["contrarrelogio"]["tempo_recorde"] = time_taken
        _save_db(db)
        return {"success": True, "scores": db["tetris"]}

    if game == "snake":
        score = data.get("score", 0)
        length = data.get("length", 0)
        db["snake"]["partidas_jogadas"] += 1
        if score > db["snake"].get("pontuacao_maxima", 0):
            db["snake"]["pontuacao_maxima"] = score
        if length > db["snake"].get("comprimento_maximo", 0):
            db["snake"]["comprimento_maximo"] = length
        _save_db(db)
        return {"success": True, "scores": db["snake"]}

    if game == "tictactoe":
        result = data.get("result")
        if result == "win":
            db["tictactoe"]["vitorias"] += 1
        elif result == "loss":
            db["tictactoe"]["derrotas"] += 1
        elif result == "draw":
            db["tictactoe"]["empates"] += 1
        _save_db(db)
        return {"success": True, "scores": db["tictactoe"]}

    if game == "poker":
        mode = data.get("mode")
        result = data.get("result")
        stack = data.get("stack", 0)
        if mode == "cash":
            if result == "win":
                db["poker"]["cash"]["vitorias"] += 1
            elif result == "loss":
                db["poker"]["cash"]["derrotas"] += 1
        elif mode in ("torneio", "tournament"):
            if result == "win":
                db["poker"]["torneio"]["vitorias"] += 1
            elif result == "loss":
                db["poker"]["torneio"]["derrotas"] += 1
        if stack > db["poker"].get("maior_stack", 0):
            db["poker"]["maior_stack"] = stack
        _save_db(db)
        return {"success": True, "scores": db["poker"]}

    raise HTTPException(status_code=400, detail="Invalid or missing game query parameter.")


# ── DELETE /api/score ────────────────────────────────────────────────────────

@router.delete("/score")
async def delete_score(game: str):
    db = _load_db()
    if game not in db:
        raise HTTPException(status_code=400, detail="Invalid or missing game query parameter.")
    db[game] = copy.deepcopy(DEFAULT_SCORES[game])
    _save_db(db)
    return {"success": True, "scores": db[game]}
