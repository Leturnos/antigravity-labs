"""Token definitions and keywords for SQL lexical analysis."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from typing import Any


class TokenType(Enum):
    # Literals
    INTEGER = auto()
    FLOAT = auto()
    STRING = auto()
    BOOLEAN = auto()
    NULL = auto()

    # Identifiers
    IDENTIFIER = auto()

    # Keywords - DDL
    CREATE = auto()
    TABLE = auto()
    INDEX = auto()
    DROP = auto()
    IF = auto()
    EXISTS = auto()
    PRIMARY = auto()
    KEY = auto()
    NOT = auto()
    DEFAULT = auto()
    UNIQUE = auto()
    ON = auto()

    # Types
    TYPE_INT = auto()
    TYPE_TEXT = auto()
    TYPE_BOOL = auto()
    TYPE_FLOAT = auto()

    # Keywords - DML
    INSERT = auto()
    INTO = auto()
    VALUES = auto()
    UPDATE = auto()
    SET = auto()
    DELETE = auto()
    FROM = auto()

    # Keywords - Queries
    SELECT = auto()
    AS = auto()
    JOIN = auto()
    INNER = auto()
    WHERE = auto()
    GROUP = auto()
    BY = auto()
    HAVING = auto()
    ORDER = auto()
    ASC = auto()
    DESC = auto()
    LIMIT = auto()
    OFFSET = auto()

    # Keywords - Operators / Predicates
    AND = auto()
    OR = auto()
    IS = auto()
    LIKE = auto()
    IN = auto()
    BETWEEN = auto()

    # Utility
    EXPLAIN = auto()

    # Delimiters
    COMMA = auto()
    SEMICOLON = auto()
    DOT = auto()
    STAR = auto()
    LPAREN = auto()
    RPAREN = auto()

    # Operators
    EQ = auto()
    NEQ = auto()
    LT = auto()
    LTE = auto()
    GT = auto()
    GTE = auto()
    PLUS = auto()
    MINUS = auto()
    SLASH = auto()
    PERCENT = auto()

    EOF = auto()


KEYWORDS: dict[str, TokenType] = {
    "CREATE": TokenType.CREATE,
    "TABLE": TokenType.TABLE,
    "INDEX": TokenType.INDEX,
    "DROP": TokenType.DROP,
    "IF": TokenType.IF,
    "EXISTS": TokenType.EXISTS,
    "PRIMARY": TokenType.PRIMARY,
    "KEY": TokenType.KEY,
    "NOT": TokenType.NOT,
    "DEFAULT": TokenType.DEFAULT,
    "UNIQUE": TokenType.UNIQUE,
    "ON": TokenType.ON,
    "INT": TokenType.TYPE_INT,
    "INTEGER": TokenType.TYPE_INT,
    "TEXT": TokenType.TYPE_TEXT,
    "VARCHAR": TokenType.TYPE_TEXT,
    "STRING": TokenType.TYPE_TEXT,
    "BOOL": TokenType.TYPE_BOOL,
    "BOOLEAN": TokenType.TYPE_BOOL,
    "FLOAT": TokenType.TYPE_FLOAT,
    "DOUBLE": TokenType.TYPE_FLOAT,
    "REAL": TokenType.TYPE_FLOAT,
    "INSERT": TokenType.INSERT,
    "INTO": TokenType.INTO,
    "VALUES": TokenType.VALUES,
    "UPDATE": TokenType.UPDATE,
    "SET": TokenType.SET,
    "DELETE": TokenType.DELETE,
    "FROM": TokenType.FROM,
    "SELECT": TokenType.SELECT,
    "AS": TokenType.AS,
    "JOIN": TokenType.JOIN,
    "INNER": TokenType.INNER,
    "WHERE": TokenType.WHERE,
    "GROUP": TokenType.GROUP,
    "BY": TokenType.BY,
    "HAVING": TokenType.HAVING,
    "ORDER": TokenType.ORDER,
    "ASC": TokenType.ASC,
    "DESC": TokenType.DESC,
    "LIMIT": TokenType.LIMIT,
    "OFFSET": TokenType.OFFSET,
    "AND": TokenType.AND,
    "OR": TokenType.OR,
    "IS": TokenType.IS,
    "LIKE": TokenType.LIKE,
    "IN": TokenType.IN,
    "BETWEEN": TokenType.BETWEEN,
    "TRUE": TokenType.BOOLEAN,
    "FALSE": TokenType.BOOLEAN,
    "NULL": TokenType.NULL,
    "EXPLAIN": TokenType.EXPLAIN,
}


@dataclass(frozen=True)
class Token:
    type: TokenType
    value: Any
    line: int
    column: int
