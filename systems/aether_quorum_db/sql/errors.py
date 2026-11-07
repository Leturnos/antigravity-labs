"""SQL parsing and execution errors with source location tracking."""

from __future__ import annotations


class SqlError(Exception):
    """Base class for all SQL-related errors."""


class LexError(SqlError):
    """Error encountered during tokenization."""

    def __init__(self, message: str, line: int, column: int) -> None:
        super().__init__(f"Lexer error at line {line}, column {column}: {message}")
        self.message = message
        self.line = line
        self.column = column


class ParseError(SqlError):
    """Syntax error encountered during parsing."""

    def __init__(self, message: str, line: int, column: int) -> None:
        super().__init__(f"Syntax error at line {line}, column {column}: {message}")
        self.message = message
        self.line = line
        self.column = column
