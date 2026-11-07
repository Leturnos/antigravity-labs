"""SQL Lexer (Tokenizer) with precise source position tracking."""

from __future__ import annotations

from .errors import LexError
from .tokens import KEYWORDS, Token, TokenType


class Lexer:
    """Converts raw SQL query strings into a sequence of tokens."""

    def __init__(self, text: str) -> None:
        self.text = text
        self.pos = 0
        self.line = 1
        self.column = 1
        self.length = len(text)

    def tokenize(self) -> list[Token]:
        tokens: list[Token] = []
        while self.pos < self.length:
            self._skip_whitespace_and_comments()
            if self.pos >= self.length:
                break

            char = self.text[self.pos]
            start_line = self.line
            start_col = self.column

            # String literal
            if char == "'":
                token = self._lex_string(start_line, start_col)
                tokens.append(token)
                continue

            # Quoted identifier (backtick or double-quote)
            if char in ('"', '`'):
                token = self._lex_quoted_identifier(char, start_line, start_col)
                tokens.append(token)
                continue

            # Number
            if char.isdigit():
                token = self._lex_number(start_line, start_col)
                tokens.append(token)
                continue

            # Identifier or Keyword
            if char.isalpha() or char == "_":
                token = self._lex_identifier_or_keyword(start_line, start_col)
                tokens.append(token)
                continue

            # Punctuation & Operators
            token = self._lex_symbol(start_line, start_col)
            tokens.append(token)

        tokens.append(Token(TokenType.EOF, None, self.line, self.column))
        return tokens

    # ---- Helpers ---------------------------------------------------------

    def _peek(self, offset: int = 0) -> str:
        idx = self.pos + offset
        return self.text[idx] if idx < self.length else ""

    def _advance(self) -> str:
        if self.pos >= self.length:
            return ""
        ch = self.text[self.pos]
        self.pos += 1
        if ch == "\n":
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        return ch

    def _skip_whitespace_and_comments(self) -> None:
        while self.pos < self.length:
            ch = self._peek()

            # Whitespace
            if ch.isspace():
                self._advance()
                continue

            # Single-line comment: --
            if ch == "-" and self._peek(1) == "-":
                while self.pos < self.length and self._peek() != "\n":
                    self._advance()
                continue

            # Block comment: /* ... */
            if ch == "/" and self._peek(1) == "*":
                start_line, start_col = self.line, self.column
                self._advance()  # /
                self._advance()  # *
                closed = False
                while self.pos < self.length:
                    if self._peek() == "*" and self._peek(1) == "/":
                        self._advance()
                        self._advance()
                        closed = True
                        break
                    self._advance()
                if not closed:
                    raise LexError("unterminated block comment", start_line, start_col)
                continue

            break

    def _lex_string(self, start_line: int, start_col: int) -> Token:
        self._advance()  # opening quote
        chars: list[str] = []
        while self.pos < self.length:
            ch = self._advance()
            if ch == "'":
                if self._peek() == "'":
                    # Escaped single quote: ''
                    chars.append(self._advance())
                else:
                    return Token(TokenType.STRING, "".join(chars), start_line, start_col)
            else:
                chars.append(ch)
        raise LexError("unterminated string literal", start_line, start_col)

    def _lex_quoted_identifier(self, quote_char: str, start_line: int, start_col: int) -> Token:
        self._advance()  # opening quote
        chars: list[str] = []
        while self.pos < self.length:
            ch = self._advance()
            if ch == quote_char:
                return Token(TokenType.IDENTIFIER, "".join(chars), start_line, start_col)
            chars.append(ch)
        raise LexError(f"unterminated quoted identifier {quote_char}", start_line, start_col)

    def _lex_number(self, start_line: int, start_col: int) -> Token:
        start_pos = self.pos
        is_float = False
        while self.pos < self.length and self._peek().isdigit():
            self._advance()

        if self._peek() == "." and self._peek(1).isdigit():
            is_float = True
            self._advance()  # .
            while self.pos < self.length and self._peek().isdigit():
                self._advance()

        raw = self.text[start_pos : self.pos]
        val = float(raw) if is_float else int(raw)
        token_type = TokenType.FLOAT if is_float else TokenType.INTEGER
        return Token(token_type, val, start_line, start_col)

    def _lex_identifier_or_keyword(self, start_line: int, start_col: int) -> Token:
        start_pos = self.pos
        while self.pos < self.length and (self._peek().isalnum() or self._peek() == "_"):
            self._advance()
        raw = self.text[start_pos : self.pos]
        upper = raw.upper()

        if upper in KEYWORDS:
            ttype = KEYWORDS[upper]
            if ttype == TokenType.BOOLEAN:
                return Token(ttype, upper == "TRUE", start_line, start_col)
            if ttype == TokenType.NULL:
                return Token(ttype, None, start_line, start_col)
            return Token(ttype, upper, start_line, start_col)

        return Token(TokenType.IDENTIFIER, raw, start_line, start_col)

    def _lex_symbol(self, start_line: int, start_col: int) -> Token:
        ch = self._advance()

        # Multi-character operators
        if ch == "!":
            if self._peek() == "=":
                self._advance()
                return Token(TokenType.NEQ, "!=", start_line, start_col)
            raise LexError(f"unexpected character '{ch}', expected '!='", start_line, start_col)

        if ch == "<":
            if self._peek() == "=":
                self._advance()
                return Token(TokenType.LTE, "<=", start_line, start_col)
            if self._peek() == ">":
                self._advance()
                return Token(TokenType.NEQ, "<>", start_line, start_col)
            return Token(TokenType.LT, "<", start_line, start_col)

        if ch == ">":
            if self._peek() == "=":
                self._advance()
                return Token(TokenType.GTE, ">=", start_line, start_col)
            return Token(TokenType.GT, ">", start_line, start_col)

        # Single-character tokens
        mapping = {
            "=": TokenType.EQ,
            "+": TokenType.PLUS,
            "-": TokenType.MINUS,
            "*": TokenType.STAR,
            "/": TokenType.SLASH,
            "%": TokenType.PERCENT,
            ",": TokenType.COMMA,
            ";": TokenType.SEMICOLON,
            ".": TokenType.DOT,
            "(": TokenType.LPAREN,
            ")": TokenType.RPAREN,
        }

        if ch in mapping:
            return Token(mapping[ch], ch, start_line, start_col)

        raise LexError(f"unexpected character '{ch}'", start_line, start_col)
