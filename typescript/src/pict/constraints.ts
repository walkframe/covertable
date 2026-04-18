import type { FilterRowType } from '../types';

type FilterType = (row: FilterRowType) => boolean;

type Token = {
  type: TokenType;
  value: string;
  line: number; // 1-based line number where this token starts
};

enum TokenType {
  REF = 'REF',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  NULL = 'NULL',
  IF = 'IF',
  ELSE = 'ELSE',
  THEN = 'THEN',
  COMPARER = 'COMPARER',
  OPERATOR = 'OPERATOR',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  COMMA = 'COMMA',
  COLON = 'COLON',
  SEMICOLON = 'SEMICOLON',
  ARITHMETIC = 'ARITHMETIC',
  WHITESPACE = 'WHITESPACE',
  UNKNOWN = 'UNKNOWN',
}

type Evaluator = (row: FilterRowType) => any;

function classifyToken(token: string, line: number): Token {
  if (token.startsWith('[') && token.endsWith(']')) {
    return { type: TokenType.REF, value: token, line };
  }
  if (token.startsWith('"') && token.endsWith('"')) {
    return { type: TokenType.STRING, value: token, line };
  }
  if (!isNaN(parseFloat(token))) {
    return { type: TokenType.NUMBER, value: token, line };
  }
  if (['TRUE', 'FALSE'].includes(token.toUpperCase())) {
    return { type: TokenType.BOOLEAN, value: token.toUpperCase(), line };
  }
  if (token.toUpperCase() === TokenType.NULL) {
    return { type: TokenType.NULL, value: token.toUpperCase(), line };
  }
  if ([TokenType.IF, TokenType.ELSE, TokenType.THEN].includes(token.toUpperCase() as TokenType)) {
    return { type: token.toUpperCase() as TokenType, value: token.toUpperCase(), line };
  }
  if (['=', '<>', '>', '<', '>=', '<=', 'IN', 'LIKE'].includes(token.toUpperCase())) {
    return { type: TokenType.COMPARER, value: token.toUpperCase(), line };
  }
  if (['AND', 'OR', 'NOT'].includes(token.toUpperCase())) {
    return { type: TokenType.OPERATOR, value: token.toUpperCase(), line };
  }
  if (['+', '-', '*', '/', '%', '^'].includes(token)) {
    return { type: TokenType.ARITHMETIC, value: token, line };
  }
  if (token === '**') {
    return { type: TokenType.ARITHMETIC, value: '^', line };
  }
  switch (token) {
    case '(': return { type: TokenType.LPAREN, value: token, line };
    case ')': return { type: TokenType.RPAREN, value: token, line };
    case '{': return { type: TokenType.LBRACE, value: token, line };
    case '}': return { type: TokenType.RBRACE, value: token, line };
    case ',': return { type: TokenType.COMMA, value: token, line };
    case ':': return { type: TokenType.COLON, value: token, line };
    case ';': return { type: TokenType.SEMICOLON, value: token, line };
    default:
      return { type: TokenType.UNKNOWN, value: token, line };
  }
}

const isWhiteSpace = (char: string) => {
  return char === ' ' || char === '\n' || char === '\t';
};

export class PictConstraintsLexer {
  private tokens: Token[] = [];
  public filters: (FilterType | null)[] = [];
  public errors: (string | null)[] = [];
  // Line number where each filter/error originated (1-based, in the original input).
  public filterLines: number[] = [];
  // Set of factor keys each filter depends on. Same length as `filters`.
  // Empty set entries correspond to errors / null filters.
  public filterKeys: Set<string>[] = [];

  constructor(
    private input: string,
    private debug = false,
    private aliases: Map<string, string> = new Map(),
    private caseInsensitive: boolean = false,
    private startLine: number = 1,
  ) {
    try {
      this.tokenize();
    } catch (e: any) {
      if (this.debug) {
        console.error(`Tokenize error:`, e.message);
      }
      this.errors.push(e.message);
      this.filterLines.push(this.startLine);
      return;
    }
    this.analyze();
  }
  private tokenize(): Token[] {
    const constraints = this.input;
    const tokens: Token[] = [];
    let buffer = '';
    let bufferLine = this.startLine;
    let currentLine = this.startLine;
    let insideQuotes = false;
    let insideBraces = false;
    let insideBrackets = false;

    const addToken = (type: TokenType, value: string, line: number) => {
      tokens.push({ type, value, line });
    };

    const flushBuffer = () => {
      if (buffer.length > 0) {
        tokens.push(classifyToken(buffer, bufferLine));
        buffer = '';
      }
    };

    const startBuffer = (ch: string) => {
      if (buffer.length === 0) bufferLine = currentLine;
      buffer += ch;
    };

    for (let i = 0; i < constraints.length; i++) {
      const char = constraints[i];

      if (char === '"') {
        insideQuotes = !insideQuotes;
        startBuffer(char);
        if (!insideQuotes) {
          addToken(TokenType.STRING, buffer, bufferLine);
          buffer = '';
        }
      } else if (insideQuotes) {
        startBuffer(char);
      } else if (char === '[') {
        flushBuffer();
        insideBrackets = true;
        startBuffer(char);
      } else if (char === ']' && insideBrackets) {
        startBuffer(char);
        tokens.push(classifyToken(buffer, bufferLine));
        insideBrackets = false;
        buffer = '';
      } else if (char === '{') {
        insideBraces = true;
        flushBuffer();
        addToken(TokenType.LBRACE, char, currentLine);
      } else if (char === '}') {
        insideBraces = false;
        flushBuffer();
        addToken(TokenType.RBRACE, char, currentLine);
      } else if (char === ',' && insideBraces) {
        flushBuffer();
        addToken(TokenType.COMMA, char, currentLine);
      } else if ('+-*/%^'.includes(char) && !insideBraces && !insideBrackets) {
        flushBuffer();
        if (char === '*' && constraints[i + 1] === '*') {
          tokens.push(classifyToken('**', currentLine));
          i++;
        } else {
          tokens.push(classifyToken(char, currentLine));
        }
      } else if ('[]=<>!();:'.includes(char) && !insideBraces && !insideBrackets) {
        flushBuffer();
        if (char === '<' || char === '>' || char === '!' || char === '=') {
          const nextChar = constraints[i + 1];
          if (nextChar === '=') {
            tokens.push(classifyToken(char + '=', currentLine));
            i++;
          } else if (char === '<' && nextChar === '>') {
            tokens.push(classifyToken('<>', currentLine));
            i++;
          } else {
            tokens.push(classifyToken(char, currentLine));
          }
        } else {
          tokens.push(classifyToken(char, currentLine));
        }
      } else if (isWhiteSpace(char) && !insideBraces && !insideBrackets) {
        flushBuffer();
        let whitespaceBuffer = char;
        if (char === '\n') currentLine++;
        while (i + 1 < constraints.length && isWhiteSpace(constraints[i + 1])) {
          i++;
          whitespaceBuffer += constraints[i];
          if (constraints[i] === '\n') currentLine++;
        }
        addToken(TokenType.WHITESPACE, whitespaceBuffer, currentLine);
      } else if (isWhiteSpace(char) && (insideBraces || insideBrackets)) {
        if (char === '\n') currentLine++;
        startBuffer(char);
      } else {
        startBuffer(char);
      }
    }

    if (insideQuotes) {
      throw new Error(`Unterminated string literal: ${buffer}`);
    }
    if (insideBrackets) {
      throw new Error(`Unterminated field reference: ${buffer}`);
    }
    if (insideBraces) {
      throw new Error(`Unterminated set (missing closing "}")`);
    }
    if (buffer.length > 0) {
      tokens.push(classifyToken(buffer, bufferLine));
    }
    this.tokens = tokens;
    return tokens;
  }

  private analyze() {
    let tokenIndex = 0;
    const tokens = this.tokens;
    const ci = this.caseInsensitive;

    // Normalize a value for comparison: lowercase strings if case-insensitive
    const norm = (v: any) => (ci && typeof v === 'string') ? v.toLowerCase() : v;

    // Collects every factor key referenced while parsing the *current*
    // statement. `close()` snapshots and resets it.
    let currentKeys = new Set<string>();

    const nextToken = () =>  {
      while (tokenIndex < tokens.length && tokens[tokenIndex].type === 'WHITESPACE') {
        tokenIndex++;
      }
      return tokenIndex < tokens.length ? tokens[tokenIndex++] : null;
    }

    const parseExpression: () => Evaluator = () => {
      let left = parseTerm();
      let token = nextToken();
      if (token?.type === TokenType.UNKNOWN) {
        throw new Error(`Unexpected token: ${token.value}`);
      }
      while (token && token.type === 'OPERATOR' && token.value === 'OR') {
        const l = left, r = parseTerm();
        left = (row) => l(row) || r(row);
        token = nextToken();
      }
      tokenIndex--;
      return left;
    }

    const parseTerm: () => Evaluator = () => {
      let left = parseFactor();

      let token = nextToken();
      if (token?.type === TokenType.UNKNOWN) {
        throw new Error(`Unexpected token: ${token.value}`);
      }
      while (token && token.type === 'OPERATOR' && token.value === 'AND') {
        const l = left, r = parseFactor();
        left = (row) => l(row) && r(row);
        token = nextToken();
      }
      tokenIndex--;
      return left;
    }

    const isLogicalParen = (): boolean => {
      const saved = tokenIndex;
      let depth = 1;
      let found = false;
      while (tokenIndex < tokens.length) {
        const t = tokens[tokenIndex++];
        if (t.type === TokenType.WHITESPACE) continue;
        if (t.type === TokenType.LPAREN) depth++;
        else if (t.type === TokenType.RPAREN) { depth--; if (depth === 0) break; }
        else if (depth === 1 && t.type === TokenType.COMPARER) { found = true; break; }
      }
      tokenIndex = saved;
      return found;
    };

    const parseFactor: () => Evaluator = () => {
      let token = nextToken();
      if (token != null) {
        if (token.type === 'OPERATOR' && token.value === 'NOT') {
          const operand = parseFactor();
          return (row) => !operand(row);
        }
        if (token.type === TokenType.LPAREN) {
          if (isLogicalParen()) {
            const expr = parseExpression();
            token = nextToken();
            if (!token || token.type !== TokenType.RPAREN) {
              throw new Error('Expected closing parenthesis');
            }
            return expr;
          } else {
            tokenIndex--;
            return parseCondition();
          }
        }
        if (token.type === TokenType.BOOLEAN) {
          const val = token.value.toUpperCase() === 'TRUE';
          return () => val;
        }
        if (token.type === TokenType.UNKNOWN) {
          throw new Error(`Unexpected token: ${token.value}`);
        }
      }
      tokenIndex--;
      return parseCondition();
    }

    const parseCondition: () => Evaluator = () => {
      const left = parseOperand();
      if (left == null) {
        throw new Error('Expected field or value after "IF", "THEN", "ELSE"');
      }
      const comparerToken = nextToken();
      if ([TokenType.NUMBER, TokenType.STRING, TokenType.BOOLEAN, TokenType.NULL].includes(comparerToken?.type!)) {
        throw new Error(`Expected comparison operator but found value: ${comparerToken?.value}`);
      }
      if (comparerToken?.type === TokenType.THEN) {
        throw new Error('A comparison operator and value are required after the field.');
      }
      if (comparerToken?.type === 'OPERATOR') {
        throw new Error(`Expected comparison operator but found operator: ${comparerToken.value}`);
      }

      if (!comparerToken || comparerToken.type !== TokenType.COMPARER) {
        if (comparerToken?.value === '!=') {
          throw new Error(`"!=" is not supported. Use "<>" for inequality comparison`);
        }
        throw new Error(`Unknown comparison operator: ${comparerToken?.value}`);
      }
      const comparer = comparerToken.value;

      if (comparer === 'IN') {
        const values = parseSet();
        return (row) => values.has(norm(left(row)));
      }
      if (comparer === 'LIKE') {
        const right = parseOperand();
        if (right == null) {
          throw new Error('Expected string pattern after LIKE');
        }
        // Evaluate pattern once at parse time (it must be a literal)
        const patternStr = right({} as FilterRowType);
        if (typeof patternStr !== 'string') {
          throw new Error('Expected string pattern after LIKE');
        }
        const regexPattern = patternStr.replace(/\*/g, '.*').replace(/\?/g, '.');
        const regex = new RegExp('^' + regexPattern + '$', ci ? 'i' : '');
        return (row) => regex.test(left(row));
      }
      const right = parseOperand();
      if (right == null) {
        throw new Error('Expected field or value');
      }
      switch (comparer) {
        case '=':
          return (row) => norm(left(row)) === norm(right(row));
        case '<>':
          return (row) => norm(left(row)) !== norm(right(row));
        case '>':
          return (row) => left(row) > right(row);
        case '<':
          return (row) => left(row) < right(row);
        case '>=':
          return (row) => left(row) >= right(row);
        case '<=':
          return (row) => left(row) <= right(row);
        default:
          throw new Error(`Unknown comparison operator: ${comparer}`);
      }
    }

    const parseSet: () => Set<string> = () => {
      const elements: string[] = [];
      let token = nextToken();
      if (token && token.type === TokenType.LBRACE) {
        token = nextToken();
        while (token && token.type !== TokenType.RBRACE) {
          if (token.type === TokenType.STRING) {
            const raw = token.value.slice(1, -1); // remove quotes
            const lookup = ci ? raw.toLowerCase() : raw;
            const resolved = this.aliases.get(lookup) ?? raw;
            elements.push(norm(resolved));
          } else if (token.type !== TokenType.COMMA && token.type !== TokenType.WHITESPACE) {
            throw new Error(`Unexpected token in array: ${token.value}`);
          }
          token = nextToken();
        }
      } else {
        throw new Error(`Expected '{' but found ${token ? token.value : TokenType.NULL}`);
      }
      if (elements.length === 0) {
        throw new Error('Empty set in IN clause');
      }
      return new Set(elements);
    }

    const ARITHMETIC_MAP: Record<string, (a: number, b: number) => number> = {
      '+': (a, b) => a + b,
      '-': (a, b) => a - b,
      '*': (a, b) => a * b,
      '/': (a, b) => a / b,
      '%': (a, b) => a % b,
      '^': (a, b) => a ** b,
    };

    const parsePrimaryOperand: () => Evaluator | null = () => {
      const token = nextToken();
      if (token == null) {
        return null;
      }
      if (token.type === TokenType.LPAREN) {
        // Parenthesized arithmetic expression
        const inner = parseOperand();
        if (inner == null) {
          throw new Error('Expected expression after "("');
        }
        const closeParen = nextToken();
        if (!closeParen || closeParen.type !== TokenType.RPAREN) {
          throw new Error('Expected closing ")" in arithmetic expression');
        }
        return inner;
      } else if (token.type === TokenType.REF) {
        const key = token.value.slice(1, -1); // remove [ and ]
        currentKeys.add(key);
        return (row) => row[key];
      } else if (token.type === TokenType.STRING) {
        const raw = token.value.slice(1, -1); // remove quotes
        const lookup = ci ? raw.toLowerCase() : raw;
        const value = this.aliases.get(lookup) ?? raw;
        return () => value;
      } else if (token.type === TokenType.NUMBER) {
        const value = parseFloat(token.value);
        return () => value;
      } else if (token.type === TokenType.BOOLEAN) {
        const value = token.value === 'TRUE';
        return () => value;
      } else if (token.type === TokenType.NULL) {
        return () => null;
      } else {
        return null;
      }
    }

    // Power: ^ or ** (highest arithmetic precedence, right-associative)
    const parsePowOperand: () => Evaluator | null = () => {
      let left = parsePrimaryOperand();
      if (left == null) return null;
      const saved = tokenIndex;
      const tok = nextToken();
      if (tok && tok.type === TokenType.ARITHMETIC && tok.value === '^') {
        const right = parsePowOperand(); // right-associative
        if (right == null) {
          throw new Error("Expected operand after '^'");
        }
        const l = left, r = right;
        left = ((l, r) => (row: FilterRowType) => l(row) ** r(row))(l, r);
      } else {
        tokenIndex = saved;
      }
      return left;
    }

    // Multiplicative: *, /, % (higher precedence)
    const parseMulOperand: () => Evaluator | null = () => {
      let left = parsePowOperand();
      if (left == null) return null;
      while (true) {
        const saved = tokenIndex;
        const tok = nextToken();
        if (tok && tok.type === TokenType.ARITHMETIC && '*/%'.includes(tok.value)) {
          const fn = ARITHMETIC_MAP[tok.value];
          const right = parsePowOperand();
          if (right == null) {
            throw new Error(`Expected operand after '${tok.value}'`);
          }
          const l = left, r = right;
          left = ((l, r, fn) => (row: FilterRowType) => fn(l(row), r(row)))(l, r, fn);
        } else {
          tokenIndex = saved;
          break;
        }
      }
      return left;
    }

    // Additive: +, - (lower precedence)
    const parseOperand: () => Evaluator | null = () => {
      let left = parseMulOperand();
      if (left == null) return null;
      while (true) {
        const saved = tokenIndex;
        const tok = nextToken();
        if (tok && tok.type === TokenType.ARITHMETIC && '+-'.includes(tok.value)) {
          const fn = ARITHMETIC_MAP[tok.value];
          const right = parseMulOperand();
          if (right == null) {
            throw new Error(`Expected operand after '${tok.value}'`);
          }
          const l = left, r = right;
          left = ((l, r, fn) => (row: FilterRowType) => fn(l(row), r(row)))(l, r, fn);
        } else {
          tokenIndex = saved;
          break;
        }
      }
      return left;
    }

    const abandon = () => {
      while (tokenIndex < tokens.length && tokens[tokenIndex].type !== TokenType.SEMICOLON) {
        tokenIndex++;
      }
    }

    // The line number where the current statement started; updated by the
    // outer loop each time it begins reading a new constraint.
    let currentStatementLine = this.startLine;

    const close = (evaluator: Evaluator | null, error: string | null) => {
      if (evaluator == null) {
        if (this.debug) {
          console.error(`Error[${this.errors.length}]:`, error);
        }
        this.filters.push(null);
        this.errors.push(error);
      } else {
        if (this.debug) {
          console.debug(`Filter[${this.filters.length}]: compiled`);
        }
        this.filters.push(evaluator as FilterType);
        this.errors.push(null);
      }
      this.filterLines.push(currentStatementLine);
      this.filterKeys.push(currentKeys);
      // Start a fresh dependency set for the next statement.
      currentKeys = new Set<string>();
    }

    const read = () => {
      try {
        const expr = parseExpression();
        return expr;
      } catch (e) {
        // @ts-ignore
        close(null, e.message);
      }
      // If the conditional expression ends with "ELSE",
      //  the current index reaches a semicolon, and the next expression is skipped by the abandon function.
      // Therefore, the index is reset to the previous one.
      tokenIndex--;
      abandon();
      return null;
    };

    while (tokens[tokenIndex] != null) {
      const token = nextToken();
      if (token == null) {
        break;
      }
      currentStatementLine = token.line;
      if (token.type === TokenType.IF) {
        const condition = read();
        if (condition == null) {
          continue;
        }
        const thenToken = nextToken();
        if (!thenToken || thenToken.type !== TokenType.THEN) {
          close(null, `Expected "THEN" but found ${thenToken ? thenToken.value : 'end of input'}`);
          abandon()
          continue;
        }
        const thenEval = read();
        if (thenEval == null) {
          continue;
        }

        const elseToken = nextToken();
        let elseEval: Evaluator = () => true;
        if (elseToken && elseToken.type === TokenType.ELSE) {
          const parsed = read();
          if (parsed == null) {
            continue;
          }
          elseEval = parsed;
        } else {
          tokenIndex--; // Go back one token if ELSE is not found
        }
        close((row) => condition(row) ? thenEval(row) : elseEval(row), null);
      } else if (token.type === TokenType.SEMICOLON) {
        // do nothing
      } else if (token.type === TokenType.UNKNOWN) {
        close(null, `Unknown token: ${token.value}`);
        abandon();
      } else {
        // Unconditional constraint: e.g. [A] <> [B] AND [C] = "x";
        tokenIndex--;
        const expr = read();
        if (expr != null) {
          close(expr, null);
        }
      }
    }
  }

  filter = (row: FilterRowType, ...additionalFilters: FilterType[]) => {
    for (const f of this.filters) {
      if (f == null) {
        continue;
      }
      if (!f(row)) {
        return false;
      }
    }
    for (const f of additionalFilters) {
      if (!f(row)) {
        return false;
      }
    }
    return true;
  }
}
