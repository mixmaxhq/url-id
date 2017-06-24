const SKIP = Object.create(null);

const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const hasOwn = Object.prototype.hasOwnProperty;

class LocalEncoder {
  constructor(encode) {
    this.encode = encode;
  }

  assert(condition) {
    if (!condition) {
      throw SKIP;
    }
    return this;
  }

  // url-safe base64
  base64(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('base64 requires a buffer');
    }
    return this.normalizeBase64(buffer.toString('base64'));
  }

  normalizeBase64(string) {
    const lookup = {'=': '', '+': '-', '/': '_'};
    return string.replace(/[/+=]/g, (m) => lookup[m]);
  }

  word(value, width=1) {
    if (value >= (1 << (((width << 1) + width) << 1))) {
      throw new Error('cannot encode ${value} in ${width} base64 characters');
    }
    let encoded = '';
    for (let i = 0; i < width; ++i) {
      encoded = base64chars[value & 0x3f] + encoded;
      value >>= 6;
    }
    return encoded;
  }

  blob(buffer, width=2) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('base64 requires a buffer');
    }
    return this.word(buffer.length, width) + this.base64(buffer);
  }

  string(string, encoding, width=2) {
    return this.blob(Buffer.from(string, encoding), width);
  }
}

class LocalDecoder {
  constructor(decode, input) {
    this._decode = decode;
    this._input = input;
    this._index = 0;
  }

  _check(length) {
    if (this._input.length < this._index + length) {
      throw new Error('incomplete data');
    }
  }

  _slice(length) {
    this._check(length);
    return this._input.slice(this._index, this._index += length);
  }

  _normalizeBase64(string) {
    const pad = (3 - string.length % 3) % 3;
    return string.replace(/[_-]/g, (m) => m === '_' ? '/' : '+') + '='.repeat(pad);
  }

  _fromBase64(string) {
    return Buffer.from(this._normalizeBase64(string), 'base64');
  }

  word(width=1) {
    this._check(width);
    let value = 0;
    for (let i = 0; i < width; ++i) {
      value = (value << 6) | base64chars.indexOf(this._input[this._index + i]);
    }
    this._index += width;
    return value;
  }

  char() {
    this._check(1);
    return this._input[this._index++];
  }

  bytes(bytes, encoding=null) {
    return this.chars(Math.ceil(bytes * 4 / 3), encoding);
  }

  chars(chars, encoding=null) {
    const buf = this._fromBase64(this._slice(chars));
    if (!encoding || encoding === 'buffer') {
      return buf;
    }
    return buf.toString(encoding);
  }

  blob(width=2) {
    return this.bytes(this.word(width));
  }

  string(encoding, width=2) {
    return this.blob(width).toString(encoding);
  }

  base64(chars, safe=true) {
    const data = this._slice(chars);
    if (safe) return data;
    return this._normalizeBase64(data);
  }

  decode(context, count=null) {
    if (!count) {
      return this._decode(context);
    }

    const array = new Array(count);
    for (let i = 0; i < array.length; ++i) {
      array[i] = this._decode(context);
    }
    return array;
  }
}

class Encoder {
  constructor(initialContext) {
    this._initialContext = initialContext;
    this._contexts = new Map();

    this._localEncoder = new LocalEncoder(this._encode.bind(this));
  }

  define(context, definition) {
    if (typeof context !== 'string') {
      throw new TypeError('expected string context');
    }

    if (!definition || typeof definition !== 'object') {
      throw new TypeError('expected object definition');
    }

    let type;
    if (!definition.match) {
      type = null;
    } else if (typeof definition.match === 'string') {
      type = 'exact';
    } else if (definition.match instanceof RegExp) {
      type = 'regex';
    } else if (typeof definition.match === 'function') {
      type = 'function';
    } else {
      throw new Error(`unsupported match type for ${context}`);
    }

    if (definition.token && (typeof definition.token !== 'string' || definition.token.length !== 1)) {
      throw new Error('unsupported token format');
    }

    const ctxObj = {
      type,
      definition
    };

    // TODO: merge consecutive exact string matches.
    let ctx = this._contexts.get(context);
    if (!ctx) {
      ctx = {
        array: [],
        map: new Map()
      };
    }

    const decode = definition.decode;

    const defineDecode = (token, decoder) => {
      if (token && (typeof token !== 'string' || token.length !== 1)) {
        throw new Error('unsupported token format');
      }
      if (ctx.map.has(token)) {
        throw new Error(`decode already defined for token ${token}`);
      }
      ctx.map.set(token, decoder);
    };

    if (typeof decode === 'function') {
      defineDecode(definition.token, decode);
    } else if (decode instanceof Map) {
      if (!decode.size) {
        throw new Error('no decoders specified');
      }

      for (let [token, decoder] of decode) {
        defineDecode(token, decoder);
      }
    } else if (decode && typeof decode === 'object') {
      let any = false;
      for (let token in decode) {
        if (hasOwn.call(decode, token)) {
          defineDecode(token, decode[token]);
          any = true;
        }
      }

      if (!any) {
        throw new Error('no decoders specified');
      }
    } else if (definition.token && type === 'exact') {
      const value = definition.match;
      defineDecode(definition.token, () => value);
    } else {
      throw new Error('incomplete decode definition');
    }
    ctx.array.push(ctxObj);
    if (!this._contexts.has(context)) {
      this._contexts.set(context, ctx);
    }
    return this;
  }

  use(context, definitions) {
    if (typeof context !== 'string') {
      throw new TypeError('expected string context');
    }

    if (!Array.isArray(definitions)) {
      throw new TypeError('expected array definitions');
    }

    for (let definition of definitions) {
      this.define(context, definition);
    }
    return this;
  }

  encode(context, data) {
    if (arguments.length === 1 || data === undefined) {
      data = context;
      context = this._initialContext;
    }

    return this._encode(context, data);
  }

  _encode(context, data) {
    const ctx = this._contexts.get(context);
    if (!ctx) {
      throw new Error(`unknown context ${context}`);
    }

    for (let {type, definition} of ctx.array) {
      const encodeArgs = [data];
      switch (type) {
      case 'exact':
        if (data !== definition.match) continue;
        break;
      case 'regex':
        const match = definition.match.exec(data);
        if (!match) continue;
        encodeArgs.push(match);
        break;
      case 'function':
        if (!definition.match.call(undefined, data)) continue;
        break;
      // default fallthrough
      }
      let value;
      if (!definition.encode) {
        value = '';
      } else {
        try {
          value = definition.encode.apply(this._localEncoder, encodeArgs);
        } catch (err) {
          if (err === SKIP) {
            continue;
          }
          throw err;
        }
      }
      if (typeof value === 'string') {
        if (definition.token) {
          value = definition.token + value;
        }
        return value;
      }
    }

    throw new Error(`no matching definition in ${context}`);
  }

  decode(context, string) {
    if (arguments.length === 1 || string === undefined) {
      string = context;
      context = this._initialContext;
    }

    const _decode = (context) => {
      const ctx = this._contexts.get(context);
      if (!ctx) {
        throw new Error(`unknown context ${context}`);
      }

      const token = decoder.char();
      if (!ctx.map.has(token)) {
        throw new Error(`unknown token ${token} for context ${context}`);
      }

      return ctx.map.get(token).call(decoder);
    };

    const decoder = new LocalDecoder(_decode, string);

    return _decode(context);
  }
}

module.exports = Encoder;
