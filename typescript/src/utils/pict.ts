import type { FilterRowType, FilterType } from '../types';

type Token = {
  type: TokenType;
  value: string;
}

type CacheType = {
  [key: string]: any;
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
  WHITESPACE = 'WHITESPACE',
  UNKNOWN = 'UNKNOWN',
}

function classifyToken(token: string): Token {
  if (token.startsWith('[') && token.endsWith(']')) {
    return { type: TokenType.REF, value: token };
  }
  if (token.startsWith('"') && token.endsWith('"')) {
    return { type: TokenType.STRING, value: token };
  }
  if (!isNaN(parseFloat(token))) {
    return { type: TokenType.NUMBER, value: token };
  }
  if (['TRUE', 'FALSE'].includes(token.toUpperCase())) {
    return { type: TokenType.BOOLEAN, value: token.toUpperCase() };
  }
  if (token.toUpperCase() === TokenType.NULL) {
    return { type: TokenType.NULL, value: token.toUpperCase() };
  }
  if ([TokenType.IF, TokenType.ELSE, TokenType.THEN].includes(token.toUpperCase() as TokenType)) {
    return { type: token.toUpperCase() as TokenType, value: token.toUpperCase() };
  }
  if (['=', '<>', '>', '<', '>=', '<=', 'IN', 'LIKE'].includes(token.toUpperCase())) {
    return { type: TokenType.COMPARER, value: token.toUpperCase() };
  }
  if (['AND', 'OR', 'NOT'].includes(token.toUpperCase())) {
    return { type: TokenType.OPERATOR, value: token.toUpperCase() };
  }
  switch (token) {
    case '(': return { type: TokenType.LPAREN, value: token };
    case ')': return { type: TokenType.RPAREN, value: token };
    case '{': return { type: TokenType.LBRACE, value: token };
    case '}': return { type: TokenType.RBRACE, value: token };
    case ',': return { type: TokenType.COMMA, value: token };
    case ':': return { type: TokenType.COLON, value: token };
    case ';': return { type: TokenType.SEMICOLON, value: token };
    default: return { type: TokenType.UNKNOWN, value: token };
  }
}

const isWhiteSpace = (char: string) => {
  return char === ' ' || char === '\n' || char === '\t';
};

export class PictConstraintsLexer {
  private tokens: Token[] = [];
  private cache: CacheType = {};
  public filters: (FilterType | null)[] = [];
  public errors: (string | null)[] = [];

  constructor(private input: string, private debug=false) {
    this.tokenize();
    this.analyze();
  }
  private tokenize(): Token[] {
    const constraints = this.input;
    const tokens: Token[] = [];
    let buffer = '';
    let insideQuotes = false;
    let insideBraces = false;
    let insideBrackets = false;

    const addToken = (type: TokenType, value: string) => {
      tokens.push({ type, value });
    };

    for (let i = 0; i < constraints.length; i++) {
      const char = constraints[i];

      if (char === '"') {
        insideQuotes = !insideQuotes;
        buffer += char;
        if (!insideQuotes) {
          addToken(TokenType.STRING, buffer);
          buffer = '';
        }
      } else if (insideQuotes) {
        buffer += char;
      } else if (char === '[') {
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        insideBrackets = true;
        buffer += char;
      } else if (char === ']' && insideBrackets) {
        buffer += char;
        tokens.push(classifyToken(buffer));
        insideBrackets = false;
        buffer = '';
      } else if (char === '{') {
        insideBraces = true;
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        addToken(TokenType.LBRACE, char);
      } else if (char === '}') {
        insideBraces = false;
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        addToken(TokenType.RBRACE, char);
      } else if (char === ',' && insideBraces) {
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        addToken(TokenType.COMMA, char);
      } else if ('[]=<>!();:'.includes(char) && !insideBraces && !insideBrackets) {
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        if (char === '<' || char === '>' || char === '!' || char === '=') {
          const nextChar = constraints[i + 1];
          if (nextChar === '=') {
            tokens.push(classifyToken(char + '='));
            i++;
          } else if (char === '<' && nextChar === '>') {
            tokens.push(classifyToken('<>'));
            i++;
          } else {
            tokens.push(classifyToken(char));
          }
        } else {
          tokens.push(classifyToken(char));
        }
      } else if (isWhiteSpace(char) && !insideBraces && !insideBrackets) {
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        let whitespaceBuffer = char;
        while (i + 1 < constraints.length && isWhiteSpace(constraints[i + 1])) {
          whitespaceBuffer += constraints[++i];
        }
        addToken(TokenType.WHITESPACE, whitespaceBuffer);
      } else if (isWhiteSpace(char) && (insideBraces || insideBrackets)) {
        buffer += char;
      } else {
        buffer += char;
      }
    }

    if (buffer.length > 0) {
        tokens.push(classifyToken(buffer));
    }
    this.tokens = tokens;
    return tokens;
  }

  private analyze() {
    let tokenIndex = 0;
    let setIndex = 0;
    let regexIndex = 0;
    const tokens = this.tokens;

    const nextToken = () =>  {
      while (tokenIndex < tokens.length && tokens[tokenIndex].type === 'WHITESPACE') {
        tokenIndex++;
      }
      return tokenIndex < tokens.length ? tokens[tokenIndex++] : null;
    }

    const parseExpression: () => string = () => {
      let expr = parseTerm();
      let token = nextToken();
      if (token?.type === TokenType.UNKNOWN) {
        throw new Error(`Unexpected token: ${token.value}`);
      }
      while (token && token.type === 'OPERATOR' && token.value === 'OR') {
        const right = parseTerm();
        expr = `(${expr} || ${right})`;
        token = nextToken();
      }
      tokenIndex--; // Go back one token
      return expr || 'true';
    }

    const parseTerm: () => string = () => {
      let term = parseFactor();

      let token = nextToken();
      if (token?.type === TokenType.UNKNOWN) {
        throw new Error(`Unexpected token: ${token.value}`);
      }
      while (token && token.type === 'OPERATOR' && token.value === 'AND') {
        const right = parseFactor();
        term = `(${term} && ${right})`;
        token = nextToken();
      }
      tokenIndex--; // Go back one token
      return term;
    }

    const parseFactor: () => string = () => {
      let token = nextToken();
      if (token != null) {
        if (token.type === 'OPERATOR' && token.value === 'NOT') {
          const factor = parseFactor();
          return `!(${factor})`;
        }
        if (token.type === TokenType.LPAREN) {
          const expr = parseExpression();
          token = nextToken();
          if (!token || token.type !== TokenType.RPAREN) {
            throw new Error('Expected closing parenthesis');
          }
          return `(${expr})`;
        }
        if (token.type === TokenType.BOOLEAN) {
          return token.value.toUpperCase() === 'TRUE' ? 'true' : 'false';
        }
        if (token.type === TokenType.UNKNOWN) {
          throw new Error(`Unexpected token: ${token.value}`);
        }
      }
      tokenIndex--; // Go back one token
      return parseCondition();
    }

    const parseCondition: () => string = () => {
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

      const comparer = comparerToken?.value;
      
      if (comparer === 'IN') {
        const right = parseSet();
        return `${right}.has(${left})`;
      }
      const right = parseOperand();
      if (right == null) {
        throw new Error('Expected field or value');
      }
      switch (comparer) {
        case '=':
          return `${left} === ${right}`;
        case '<>':
          return `${left} !== ${right}`;
        case '>':
          return `${left} > ${right}`;
        case '<':
          return `${left} < ${right}`;
        case '>=':
          return `${left} >= ${right}`;
        case '<=':
          return `${left} <= ${right}`;
        case 'LIKE':
          const regexPattern = right.slice(1, -1).replace(/\*/g, '.*').replace(/\?/g, '.'); // remove quotes and replace wildcards
          const regexKey = `re_${regexIndex++}`;
          if (!this.cache[regexKey]) {
            this.cache[regexKey] = new RegExp('^' + regexPattern + '$');
          }
          return `this.cache['${regexKey}'].test(${left})`;
        default:
          throw new Error(`Unknown comparison operator: ${comparer}`);
      }
    }

    const parseSet: () => string = () => {
      const elements: string[] = [];
      let token = nextToken();
      if (token && token.type === TokenType.LBRACE) {
        token = nextToken();
        while (token && token.type !== TokenType.RBRACE) {
          if (token.type === TokenType.STRING) {
            elements.push(token.value.slice(1, -1)); // remove quotes
          } else if (token.type !== TokenType.COMMA && token.type !== TokenType.WHITESPACE) {
            throw new Error(`Unexpected token in array: ${token.value}`);
          }
          token = nextToken();
        }
      } else {
        throw new Error(`Expected '{' but found ${token ? token.value : TokenType.NULL}`);
      }
      const setKey = `set_${setIndex++}`;
      if (!this.cache[setKey]) {
        this.cache[setKey] = new Set(elements);
      }
      return `this.cache['${setKey}']`;
    }

    const parseOperand: () => string | null = () => {
      const token = nextToken();
      if (token == null) {
        return null;
      }
      if (token.type === TokenType.REF) {
        const key = token.value.slice(1, -1); // remove [ and ]
        return `row["${key}"]`;
      } else if (token.type === TokenType.STRING) {
        const value = token.value; // keep quotes for string literals
        return `${value}`;
      } else if (token.type === TokenType.NUMBER) {
        return token.value;
      } else if (token.type === TokenType.BOOLEAN) {
        return token.value === 'TRUE' ? 'true' : 'false';
      } else if (token.type === TokenType.NULL) {
        return TokenType.NULL;
      } else {
        return null;
      }
    }

    const abandon = () => {
      while (tokenIndex < tokens.length && tokens[tokenIndex].type !== TokenType.SEMICOLON) {
        tokenIndex++;
      }
    }

    const close = (code: string | null, error: string | null) => {
      // Invariably, one of the two will be null.
      if (code == null) {
        if (this.debug) {
          console.error(`Error[${this.errors.length}]:`, error);
        }
        this.filters.push(null);
        this.errors.push(error);
      } else {
        if (this.debug) {
          console.debug(`Code[${this.filters.length}]:`, code);
        }
        try {
          const f = this.makeClosure(code);
          this.filters.push(f);
          this.errors.push(null);
        } catch (e) {
          console.error(e);
          this.filters.push(null);
          // @ts-ignore
          this.errors.push(`RuntimeError[${this.errors.length}]:`, e.message);
        }

      }
    }

    const read = () => {
      try {
        const expr = parseExpression();
        return expr;
      } catch (e) {
        // @ts-ignore
        close(null, e.message);
      }
      // If the conditional expression ends with “ELSE”, 
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
      if (token.type === TokenType.IF) {
        const action = read();
        if (action == null) {
          continue;
        }
        const thenToken = nextToken();
        if (!thenToken || thenToken.type !== TokenType.THEN) {
          abandon()
          continue;
        }
        const thenAction = read();
        if (thenAction == null) {
          continue;
        }
        
        const elseToken = nextToken();
        let elseAction: string | null = 'true';
        if (elseToken && elseToken.type === TokenType.ELSE) {
          elseAction = read();
          if (elseAction == null) {
            continue;
          }
        } else {
          tokenIndex--; // Go back one token if ELSE is not found
        }
        const code = `return (${action} ? (${thenAction}) : (${elseAction}));`;
        close(code, null);
      } else if (token.type === TokenType.SEMICOLON) {
        // do nothing
      } else {
        if (token.type === TokenType.UNKNOWN) {
          close(null, `Unknown token: ${token.value}`);
        } else {
          close(null, `The leading "IF" is missing, found ${token.value}`);
        }
        abandon();
      }
    }
  }

  private makeClosure (code: string) {
    return new Function('row', code).bind(this) as FilterType;
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

