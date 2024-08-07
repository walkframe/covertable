import type { FilterRowType, FilterType } from '../types';

type Token = {
  type: string;
  value: string;
}

type CacheType = {
  [key: string]: any;
};

export class PictConstraintsLexer {
  private tokens: Token[] = [];
  private cache: CacheType = {};
  public filters: (FilterType | null)[] = [];
  public errors: string[][] = [];

  constructor(private input: string, private debug=false) {
    this.input = input;
    this.debug = debug;
    this.tokenize();
    this.analyze();
  }
  private tokenize(): Token[] {
    const constraints = this.input;
    const tokens: Token[] = [];
    let buffer = '';
    let insideQuotes = false;
    let insideBraces = false;

    const addToken = (type: string, value: string) => {
      tokens.push({ type, value });
    };

    for (let i = 0; i < constraints.length; i++) {
      const char = constraints[i];

      if (char === '"') {
        insideQuotes = !insideQuotes;
        buffer += char;
        if (!insideQuotes) {
          addToken('STRING', buffer);
          buffer = '';
        }
      } else if (insideQuotes) {
        buffer += char;
      } else if (char === '[') {
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        buffer += char;
      } else if (char === ']') {
        buffer += char;
        tokens.push(classifyToken(buffer));
        buffer = '';
      } else if (char === '{') {
        insideBraces = true;
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        addToken('LBRACE', char);
      } else if (char === '}') {
        insideBraces = false;
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        addToken('RBRACE', char);
      } else if (char === ',' && insideBraces) {
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        addToken('COMMA', char);
      } else if ('[]=<>!();:'.includes(char) && !insideBraces) {
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
      } else if (isWhiteSpace(char) && !insideBraces) {
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        let whitespaceBuffer = char;
        while (i + 1 < constraints.length && isWhiteSpace(constraints[i + 1])) {
          whitespaceBuffer += constraints[++i];
        }
        addToken('WHITESPACE', whitespaceBuffer);
      } else if (isWhiteSpace(char) && insideBraces) {
        if (buffer.length > 0) {
          tokens.push(classifyToken(buffer));
          buffer = '';
        }
        addToken('WHITESPACE', char);
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
    let errorMessages: string[] = [];
    const errors: string[][] = [];
    const tokens = this.tokens;
    const filters: (FilterType | null)[] = [];

    const nextToken = () =>  {
      while (tokenIndex < tokens.length && tokens[tokenIndex].type === 'WHITESPACE') {
        tokenIndex++;
      }
      return tokenIndex < tokens.length ? tokens[tokenIndex++] : null;
    }

    const parseExpression: () => string = () => {
      let expr = parseTerm();
      let token = nextToken();
      while (token && token.type === 'OPERATOR' && token.value === 'OR') {
        const right = parseTerm();
        expr = `(${expr} || ${right})`;
        token = nextToken();
      }
      tokenIndex--; // Go back one token
      return expr;
    }

    const parseTerm: () => string = () => {
      let term = parseFactor();
      let token = nextToken();
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
      if (token && token.type === 'OPERATOR' && token.value === 'NOT') {
        const factor = parseFactor();
        return `!(${factor})`;
      } else if (token && token.type === 'LPAREN') {
        const expr = parseExpression();
        token = nextToken();
        if (!token || token.type !== 'RPAREN') {
          errorMessages.push('Expected closing parenthesis');
          return 'false';
        }
        return `(${expr})`;
      } else {
        tokenIndex--; // Go back one token
        return parseCondition();
      }
    }

    const parseCondition: () => string = () => {
      const left = parseOperand();
      const comparerToken = nextToken();
      if (!comparerToken || comparerToken.type !== 'COMPARER') {
        errorMessages.push('Expected comparer');
        return 'false';
      }
      const comparer = comparerToken.value;
      if (comparer === 'IN') {
        const right = parseSet();
        return `${right}.has(${left})`;
      }
      const right = parseOperand();
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
          errorMessages.push(`Unknown comparer: ${comparer}`);
          return 'false';
      }
    }

    const parseSet: () => string = () => {
      const elements: string[] = [];
      let token = nextToken();
      if (token && token.type === 'LBRACE') {
        token = nextToken();
        while (token && token.type !== 'RBRACE') {
          if (token.type === 'STRING') {
            elements.push(token.value.slice(1, -1)); // remove quotes
          } else if (token.type !== 'COMMA' && token.type !== 'WHITESPACE') {
            errorMessages.push(`Unexpected token: ${token.value}`);
          }
          token = nextToken();
        }
      } else {
        errorMessages.push(`Expected '{' but found ${token ? token.value : 'null'}`);
      }
      const setKey = `set_${setIndex++}`;
      if (!this.cache[setKey]) {
        this.cache[setKey] = new Set(elements);
      }
      return `this.cache['${setKey}']`;
    }

    const parseOperand: () => string = () => {
      const token = nextToken();
      if (token == null) {
        errorMessages.push('Unexpected end of input');
        return 'false';
      }
      if (token.type === 'REF') {
        const key = token.value.slice(1, -1); // remove [ and ]
        return `row["${key}"]`;
      } else if (token.type === 'STRING') {
        const value = token.value; // keep quotes for string literals
        return `${value}`;
      } else if (token.type === 'NUMBER') {
        return token.value;
      } else if (token.type === 'BOOLEAN') {
        return token.value === 'TRUE' ? 'true' : 'false';
      } else if (token.type === 'NULL') {
        return 'null';
      } else {
        errorMessages.push(`Unexpected token: ${token.value}`);
        return 'false';
      }
    }

    while (tokenIndex < tokens.length) {
      const token = nextToken();
      if (token == null) {
        break;
      }
      if (token.type === 'IF') {
        const condition = parseExpression();
        const thenToken = nextToken();
        if (!thenToken || thenToken.type !== 'THEN') {
          errorMessages.push('Expected THEN');
          break;
        }
        const action = parseExpression();
        let elseAction = 'false';
        const elseToken = nextToken();
        if (elseToken && elseToken.type === 'ELSE') {
          elseAction = parseExpression();
        } else {
          tokenIndex--; // Go back one token if ELSE is not found
        }

        const filterCode = `return (${condition} ? (${action}) : (${elseAction}));`;
        try {
          if (this.debug) {
            console.log(`code[${filters.length}]:`, filterCode);
          }
          const f = this.makeClosure(filterCode);
          filters.push(f as FilterType);
        } catch (e) {
          filters.push(null);
          // @ts-ignore
          errorMessages.push(e.message);
        }
        errors.push(errorMessages);
        errorMessages = [];
      } else if (token.type === 'SEMICOLON') {
        // do nothing
      } else {
        errorMessages.push(`Unexpected token: ${token.value}`);
        errors.push(errorMessages);
        break;
      }
    }
    this.filters = filters;
    this.errors = errors;
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

function classifyToken(token: string): Token {
  if (token.startsWith('[') && token.endsWith(']')) {
    return { type: 'REF', value: token };
  }
  if (token.startsWith('"') && token.endsWith('"')) {
    return { type: 'STRING', value: token };
  }
  if (!isNaN(parseFloat(token))) {
    return { type: 'NUMBER', value: token };
  }
  if (['TRUE', 'FALSE'].includes(token.toUpperCase())) {
    return { type: 'BOOLEAN', value: token.toUpperCase() };
  }
  if (token.toUpperCase() === 'NULL') {
    return { type: 'NULL', value: token.toUpperCase() };
  }
  if (['IF', 'ELSE', 'THEN'].includes(token.toUpperCase())) {
    return { type: token.toUpperCase(), value: token.toUpperCase() };
  }
  if (['=', '<>', '>', '<', '>=', '<=', 'IN', 'LIKE'].includes(token.toUpperCase())) {
    return { type: 'COMPARER', value: token.toUpperCase() };
  }
  if (['AND', 'OR', 'NOT'].includes(token.toUpperCase())) {
    return { type: 'OPERATOR', value: token.toUpperCase() };
  } else {
    switch (token) {
      case '(': return { type: 'LPAREN', value: token };
      case ')': return { type: 'RPAREN', value: token };
      case '{': return { type: 'LBRACE', value: token };
      case '}': return { type: 'RBRACE', value: token };
      case ',': return { type: 'COMMA', value: token };
      case ':': return { type: 'COLON', value: token };
      case ';': return { type: 'SEMICOLON', value: token };
      default: throw new Error(`Unknown token: ${token}`);
    }
  }
}

const isWhiteSpace = (char: string) => {
  return char === ' ' || char === '\n' || char === '\t';
};
