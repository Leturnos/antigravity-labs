"""Recursive-descent & Pratt parser for SQL statements and expressions."""

from __future__ import annotations

from enum import IntEnum

from .ast import (
    Between,
    BinaryOp,
    ColumnDef,
    ColumnRef,
    CreateIndex,
    CreateTable,
    Delete,
    DropTable,
    Explain,
    Expression,
    FunctionCall,
    InList,
    Insert,
    IsNull,
    JoinClause,
    Literal,
    OrderItem,
    Projection,
    Select,
    Star,
    Statement,
    TableRef,
    UnaryOp,
    Update,
)
from .errors import ParseError
from .lexer import Lexer
from .tokens import Token, TokenType


class Precedence(IntEnum):
    LOWEST = 0
    OR = 1
    AND = 2
    NOT = 3
    COMPARE = 4   # =, !=, <, <=, >, >=, IS, LIKE, IN, BETWEEN
    SUM = 5       # +, -
    PRODUCT = 6   # *, /, %
    PREFIX = 7    # unary +, -, NOT
    CALL = 8      # function call, dot .


PRECEDENCES: dict[TokenType, Precedence] = {
    TokenType.OR: Precedence.OR,
    TokenType.AND: Precedence.AND,
    TokenType.EQ: Precedence.COMPARE,
    TokenType.NEQ: Precedence.COMPARE,
    TokenType.LT: Precedence.COMPARE,
    TokenType.LTE: Precedence.COMPARE,
    TokenType.GT: Precedence.COMPARE,
    TokenType.GTE: Precedence.COMPARE,
    TokenType.IS: Precedence.COMPARE,
    TokenType.LIKE: Precedence.COMPARE,
    TokenType.IN: Precedence.COMPARE,
    TokenType.BETWEEN: Precedence.COMPARE,
    TokenType.PLUS: Precedence.SUM,
    TokenType.MINUS: Precedence.SUM,
    TokenType.STAR: Precedence.PRODUCT,
    TokenType.SLASH: Precedence.PRODUCT,
    TokenType.PERCENT: Precedence.PRODUCT,
}


class Parser:
    """Parses SQL query tokens into an AST representation."""

    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.pos = 0

    @classmethod
    def parse_sql(cls, sql: str) -> Statement:
        tokens = Lexer(sql).tokenize()
        return cls(tokens).parse()

    # ---- Token Stream Navigation -----------------------------------------

    def _curr(self) -> Token:
        return self.tokens[self.pos]

    def _peek(self, offset: int = 1) -> Token:
        idx = self.pos + offset
        return self.tokens[idx] if idx < len(self.tokens) else self.tokens[-1]

    def _match(self, *expected: TokenType) -> bool:
        if self._curr().type in expected:
            self._advance()
            return True
        return False

    def _expect(self, expected: TokenType, msg: str | None = None) -> Token:
        tok = self._curr()
        if tok.type != expected:
            err = msg or f"expected {expected.name}, found {tok.type.name} ('{tok.value}')"
            raise ParseError(err, tok.line, tok.column)
        self._advance()
        return tok

    def _advance(self) -> Token:
        tok = self.tokens[self.pos]
        if self.pos < len(self.tokens) - 1:
            self.pos += 1
        return tok

    # ---- Entry Point -----------------------------------------------------

    def parse(self) -> Statement:
        stmt = self._parse_statement()
        self._match(TokenType.SEMICOLON)
        if self._curr().type != TokenType.EOF:
            tok = self._curr()
            raise ParseError(f"unexpected token '{tok.value}' after statement", tok.line, tok.column)
        return stmt

    def _parse_statement(self) -> Statement:
        tok = self._curr()

        if tok.type == TokenType.EXPLAIN:
            self._advance()
            inner = self._parse_statement()
            return Explain(statement=inner)

        if tok.type == TokenType.CREATE:
            return self._parse_create()
        if tok.type == TokenType.DROP:
            return self._parse_drop()
        if tok.type == TokenType.INSERT:
            return self._parse_insert()
        if tok.type == TokenType.UPDATE:
            return self._parse_update()
        if tok.type == TokenType.DELETE:
            return self._parse_delete()
        if tok.type == TokenType.SELECT:
            return self._parse_select()

        raise ParseError(f"unexpected statement starting with '{tok.value}'", tok.line, tok.column)

    # ---- DDL Statements --------------------------------------------------

    def _parse_create(self) -> Statement:
        self._expect(TokenType.CREATE)
        is_unique = False
        if self._match(TokenType.UNIQUE):
            is_unique = True

        if self._match(TokenType.TABLE):
            if is_unique:
                tok = self._curr()
                raise ParseError("UNIQUE cannot be applied to TABLE", tok.line, tok.column)
            return self._parse_create_table()

        if self._match(TokenType.INDEX):
            return self._parse_create_index(unique=is_unique)

        tok = self._curr()
        raise ParseError(f"expected TABLE or INDEX after CREATE, found '{tok.value}'", tok.line, tok.column)

    def _parse_create_table(self) -> CreateTable:
        if_not_exists = False
        if self._match(TokenType.IF):
            self._expect(TokenType.NOT)
            self._expect(TokenType.EXISTS)
            if_not_exists = True

        table_ref = self._parse_table_name_only()
        self._expect(TokenType.LPAREN, "expected '(' after table name in CREATE TABLE")

        columns: list[ColumnDef] = []
        while True:
            col_name_tok = self._expect(TokenType.IDENTIFIER, "expected column name")
            data_type_tok = self._curr()
            if data_type_tok.type not in (
                TokenType.TYPE_INT,
                TokenType.TYPE_TEXT,
                TokenType.TYPE_BOOL,
                TokenType.TYPE_FLOAT,
                TokenType.IDENTIFIER,
            ):
                raise ParseError(
                    f"expected data type for column '{col_name_tok.value}', found '{data_type_tok.value}'",
                    data_type_tok.line,
                    data_type_tok.column,
                )
            self._advance()

            primary_key = False
            not_null = False
            default_val = None

            # Parse column constraints in any order
            while True:
                if self._match(TokenType.PRIMARY):
                    self._expect(TokenType.KEY)
                    primary_key = True
                    not_null = True
                elif self._match(TokenType.NOT):
                    self._expect(TokenType.NULL)
                    not_null = True
                elif self._match(TokenType.DEFAULT):
                    default_val = self._parse_expression()
                else:
                    break

            columns.append(
                ColumnDef(
                    name=col_name_tok.value,
                    data_type=str(data_type_tok.value).upper(),
                    primary_key=primary_key,
                    not_null=not_null,
                    default=default_val,
                )
            )

            if not self._match(TokenType.COMMA):
                break

        self._expect(TokenType.RPAREN, "expected ')' to close column definitions")
        return CreateTable(table=table_ref, columns=columns, if_not_exists=if_not_exists)

    def _parse_create_index(self, unique: bool) -> CreateIndex:
        if_not_exists = False
        if self._match(TokenType.IF):
            self._expect(TokenType.NOT)
            self._expect(TokenType.EXISTS)
            if_not_exists = True

        index_name_tok = self._expect(TokenType.IDENTIFIER, "expected index name")
        self._expect(TokenType.ON, "expected ON after index name")
        table_ref = self._parse_table_name_only()

        self._expect(TokenType.LPAREN, "expected '(' after table name in CREATE INDEX")
        col_tok = self._expect(TokenType.IDENTIFIER, "expected column name for index")
        self._expect(TokenType.RPAREN, "expected ')' after column name in CREATE INDEX")

        return CreateIndex(
            index_name=index_name_tok.value,
            table=table_ref,
            column_name=col_tok.value,
            unique=unique,
            if_not_exists=if_not_exists,
        )

    def _parse_drop(self) -> DropTable:
        self._expect(TokenType.DROP)
        self._expect(TokenType.TABLE)
        if_exists = False
        if self._match(TokenType.IF):
            self._expect(TokenType.EXISTS)
            if_exists = True

        table_ref = self._parse_table_name_only()
        return DropTable(table=table_ref, if_exists=if_exists)

    # ---- DML Statements --------------------------------------------------

    def _parse_insert(self) -> Insert:
        self._expect(TokenType.INSERT)
        self._expect(TokenType.INTO)
        table_ref = self._parse_table_name_only()

        columns: list[str] = []
        if self._match(TokenType.LPAREN):
            while True:
                col_tok = self._expect(TokenType.IDENTIFIER, "expected column name in INSERT column list")
                columns.append(col_tok.value)
                if not self._match(TokenType.COMMA):
                    break
            self._expect(TokenType.RPAREN, "expected ')' to close column list")

        self._expect(TokenType.VALUES, "expected VALUES in INSERT statement")

        values_list: list[list[Expression]] = []
        while True:
            self._expect(TokenType.LPAREN, "expected '(' before row values in VALUES")
            row: list[Expression] = []
            while True:
                row.append(self._parse_expression())
                if not self._match(TokenType.COMMA):
                    break
            self._expect(TokenType.RPAREN, "expected ')' after row values")
            values_list.append(row)

            if not self._match(TokenType.COMMA):
                break

        return Insert(table=table_ref, columns=columns, values=values_list)

    def _parse_update(self) -> Update:
        self._expect(TokenType.UPDATE)
        table_ref = self._parse_table_name_only()
        self._expect(TokenType.SET, "expected SET in UPDATE statement")

        assignments: dict[str, Expression] = {}
        while True:
            col_tok = self._expect(TokenType.IDENTIFIER, "expected column name in UPDATE SET")
            self._expect(TokenType.EQ, "expected '=' after column in UPDATE SET")
            expr = self._parse_expression()
            assignments[col_tok.value] = expr

            if not self._match(TokenType.COMMA):
                break

        where_expr = None
        if self._match(TokenType.WHERE):
            where_expr = self._parse_expression()

        return Update(table=table_ref, assignments=assignments, where=where_expr)

    def _parse_delete(self) -> Delete:
        self._expect(TokenType.DELETE)
        self._expect(TokenType.FROM)
        table_ref = self._parse_table_name_only()

        where_expr = None
        if self._match(TokenType.WHERE):
            where_expr = self._parse_expression()

        return Delete(table=table_ref, where=where_expr)

    # ---- Query Statement (SELECT) ----------------------------------------

    def _parse_select(self) -> Select:
        self._expect(TokenType.SELECT)

        # Projections
        projections: list[Projection] = []
        while True:
            expr = self._parse_expression()
            alias = None
            if self._match(TokenType.AS):
                alias_tok = self._expect(TokenType.IDENTIFIER, "expected alias after AS")
                alias = alias_tok.value
            elif self._curr().type == TokenType.IDENTIFIER and self._curr().type not in (
                TokenType.FROM,
                TokenType.WHERE,
                TokenType.JOIN,
                TokenType.INNER,
                TokenType.GROUP,
                TokenType.HAVING,
                TokenType.ORDER,
                TokenType.LIMIT,
                TokenType.OFFSET,
            ):
                # Bare alias without AS
                alias = self._advance().value

            projections.append(Projection(expr=expr, alias=alias))
            if not self._match(TokenType.COMMA):
                break

        # FROM clause
        from_table = None
        joins: list[JoinClause] = []
        if self._match(TokenType.FROM):
            from_table = self._parse_table_ref()

            # Optional JOINs
            while True:
                is_inner = False
                if self._match(TokenType.INNER):
                    self._expect(TokenType.JOIN)
                    is_inner = True
                elif self._match(TokenType.JOIN):
                    is_inner = True

                if not is_inner:
                    break

                join_table = self._parse_table_ref()
                on_condition = None
                if self._match(TokenType.ON):
                    on_condition = self._parse_expression()

                joins.append(JoinClause(join_type="INNER", table=join_table, on_condition=on_condition))

        # WHERE clause
        where_expr = None
        if self._match(TokenType.WHERE):
            where_expr = self._parse_expression()

        # GROUP BY clause
        group_by: list[Expression] = []
        if self._match(TokenType.GROUP):
            self._expect(TokenType.BY)
            while True:
                group_by.append(self._parse_expression())
                if not self._match(TokenType.COMMA):
                    break

        # HAVING clause
        having_expr = None
        if self._match(TokenType.HAVING):
            having_expr = self._parse_expression()

        # ORDER BY clause
        order_by: list[OrderItem] = []
        if self._match(TokenType.ORDER):
            self._expect(TokenType.BY)
            while True:
                expr = self._parse_expression()
                ascending = True
                if self._match(TokenType.DESC):
                    ascending = False
                else:
                    self._match(TokenType.ASC)
                order_by.append(OrderItem(expr=expr, ascending=ascending))
                if not self._match(TokenType.COMMA):
                    break

        # LIMIT clause
        limit_val = None
        if self._match(TokenType.LIMIT):
            lim_tok = self._expect(TokenType.INTEGER, "expected integer for LIMIT")
            limit_val = lim_tok.value

        # OFFSET clause
        offset_val = None
        if self._match(TokenType.OFFSET):
            off_tok = self._expect(TokenType.INTEGER, "expected integer for OFFSET")
            offset_val = off_tok.value

        return Select(
            projections=projections,
            from_table=from_table,
            joins=joins,
            where=where_expr,
            group_by=group_by,
            having=having_expr,
            order_by=order_by,
            limit=limit_val,
            offset=offset_val,
        )

    def _parse_table_ref(self) -> TableRef:
        tok = self._expect(TokenType.IDENTIFIER, "expected table name")
        alias = None
        if self._match(TokenType.AS):
            alias_tok = self._expect(TokenType.IDENTIFIER, "expected table alias after AS")
            alias = alias_tok.value
        elif self._curr().type == TokenType.IDENTIFIER and self._curr().type not in (
            TokenType.WHERE,
            TokenType.JOIN,
            TokenType.INNER,
            TokenType.ON,
            TokenType.GROUP,
            TokenType.HAVING,
            TokenType.ORDER,
            TokenType.LIMIT,
            TokenType.OFFSET,
            TokenType.SEMICOLON,
            TokenType.EOF,
        ):
            alias = self._advance().value

        return TableRef(name=tok.value, alias=alias)

    def _parse_table_name_only(self) -> TableRef:
        tok = self._expect(TokenType.IDENTIFIER, "expected table name")
        return TableRef(name=tok.value)

    # ---- Pratt Expression Parser -----------------------------------------

    def _parse_expression(self, precedence: Precedence = Precedence.LOWEST) -> Expression:
        left = self._parse_prefix()

        while True:
            curr_tok = self._curr()
            curr_prec = PRECEDENCES.get(curr_tok.type, Precedence.LOWEST)

            # Special case for "NOT BETWEEN" or "NOT IN"
            if curr_tok.type == TokenType.NOT:
                nxt = self._peek(1)
                if nxt.type in (TokenType.IN, TokenType.BETWEEN):
                    curr_prec = Precedence.COMPARE

            if precedence >= curr_prec:
                break

            left = self._parse_infix(left)

        return left

    def _parse_prefix(self) -> Expression:
        tok = self._curr()

        # Literals
        if tok.type in (TokenType.INTEGER, TokenType.FLOAT, TokenType.STRING, TokenType.BOOLEAN, TokenType.NULL):
            self._advance()
            return Literal(tok.value)

        # Unary operators
        if tok.type in (TokenType.PLUS, TokenType.MINUS, TokenType.NOT):
            self._advance()
            op = tok.value if tok.type != TokenType.NOT else "NOT"
            operand = self._parse_expression(Precedence.PREFIX)
            return UnaryOp(op=op, operand=operand)

        # Grouped expression: (expr)
        if tok.type == TokenType.LPAREN:
            self._advance()
            expr = self._parse_expression(Precedence.LOWEST)
            self._expect(TokenType.RPAREN, "expected ')' to close expression")
            return expr

        # Star: *
        if tok.type == TokenType.STAR:
            self._advance()
            return Star()

        # Identifier: column reference, table.column, or function call
        if tok.type == TokenType.IDENTIFIER:
            name = tok.value
            self._advance()

            # Qualified: table.column or table.*
            if self._match(TokenType.DOT):
                if self._match(TokenType.STAR):
                    return Star(table=name)
                col_tok = self._expect(TokenType.IDENTIFIER, f"expected column name after '{name}.'")
                return ColumnRef(name=col_tok.value, table=name)

            # Function call: name(...)
            if self._match(TokenType.LPAREN):
                func_name = name.upper()
                args: list[Expression] = []
                is_star = False
                if self._match(TokenType.STAR):
                    is_star = True
                elif self._curr().type != TokenType.RPAREN:
                    while True:
                        args.append(self._parse_expression(Precedence.LOWEST))
                        if not self._match(TokenType.COMMA):
                            break
                self._expect(TokenType.RPAREN, f"expected ')' to close arguments for function {func_name}")
                return FunctionCall(name=func_name, args=args, is_star=is_star)

            # Simple column reference
            return ColumnRef(name=name)

        raise ParseError(f"unexpected token '{tok.value}' in expression", tok.line, tok.column)

    def _parse_infix(self, left: Expression) -> Expression:
        tok = self._curr()

        # Binary operators (+, -, *, /, %, =, !=, <, <=, >, >=, AND, OR, LIKE)
        if tok.type in (
            TokenType.PLUS,
            TokenType.MINUS,
            TokenType.STAR,
            TokenType.SLASH,
            TokenType.PERCENT,
            TokenType.EQ,
            TokenType.NEQ,
            TokenType.LT,
            TokenType.LTE,
            TokenType.GT,
            TokenType.GTE,
            TokenType.AND,
            TokenType.OR,
            TokenType.LIKE,
        ):
            prec = PRECEDENCES[tok.type]
            op = tok.value
            self._advance()
            right = self._parse_expression(prec)
            return BinaryOp(op=op, left=left, right=right)

        # IS NULL / IS NOT NULL
        if tok.type == TokenType.IS:
            self._advance()
            negated = False
            if self._match(TokenType.NOT):
                negated = True
            self._expect(TokenType.NULL, "expected NULL after IS [NOT]")
            return IsNull(operand=left, negated=negated)

        # BETWEEN / NOT BETWEEN
        negated = False
        if tok.type == TokenType.NOT:
            self._advance()
            negated = True

        if self._match(TokenType.BETWEEN):
            low = self._parse_expression(Precedence.COMPARE)
            self._expect(TokenType.AND, "expected AND in BETWEEN clause")
            high = self._parse_expression(Precedence.COMPARE)
            return Between(expr=left, low=low, high=high, negated=negated)

        # IN / NOT IN
        if self._match(TokenType.IN):
            self._expect(TokenType.LPAREN, "expected '(' after IN")
            values: list[Expression] = []
            while True:
                values.append(self._parse_expression(Precedence.LOWEST))
                if not self._match(TokenType.COMMA):
                    break
            self._expect(TokenType.RPAREN, "expected ')' after IN values list")
            return InList(expr=left, values=values, negated=negated)

        raise ParseError(f"unexpected token '{tok.value}' as infix operator", tok.line, tok.column)
