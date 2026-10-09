import Tokenizer from '@core/tokenizer';
import Formatter from '@core/formatter';
import { Config, Options } from '@types';
import tokenTypes from '@constants/token-types';
import { presets, formatters } from '@constants';

const getConfiguration = (opt: Options): Config => {
  const identifier = opt.sql;
  return {
    reservedWords: presets['reservedWords'][identifier],
    reservedTopLevelWords: presets['reservedTopLevelWords'][identifier],
    reservedNewLineWords: presets['reservedNewLineWords'][identifier],
    stringTypes: presets['stringTypes'][identifier],
    openParens: presets['openParens'][identifier],
    closeParens: presets['closeParens'][identifier],
    indexedPlaceholderTypes: presets['indexedPlaceholderTypes'][identifier],
    namedPlaceholderTypes: presets['namedPlaceholderTypes'][identifier],
    lineCommentTypes: presets['lineCommentTypes'][identifier],
    specialWordChars: presets['specialWordChars'][identifier],
  };
};

const WORD_LIKE: string[] = [tokenTypes.WORD, tokenTypes.NUMBER];

/**
 * A `{% ... %}` tag written directly against a word (`a{% if x %}_b{% endif %}`) can't be re-indented without
 * changing what the template renders, so such queries are returned untouched.
 */
const hasTagGlue = (tokens: ReturnType<Tokenizer['tokenize']>): boolean => {
  for (const node of tokens.items()) {
    const { type, value } = node.item;
    if (
      type === tokenTypes.DBT_START_TEMPLATE &&
      value.charAt(0) === '{' &&
      node.previous &&
      WORD_LIKE.includes(node.previous.item.type)
    ) {
      return true;
    }
    if (type === tokenTypes.DBT_END_TEMPLATE && node.next && WORD_LIKE.includes(node.next.item.type)) {
      return true;
    }
  }
  return false;
};

/**
 * Formats the sql string.
 *
 * @param {String} query
 * @param {Options} opt
 * @return {String}
 */
const format = (query: string, opt: Options = { sql: 'default', indent: 2 }): string => {
  if (!formatters.includes(opt.sql)) {
    throw Error(`Unsupported SQL dialect: ${opt.sql}`);
  }

  const config = getConfiguration(opt);
  const tokens = new Tokenizer(config).tokenize(query);
  if (hasTagGlue(tokens)) {
    return query;
  }
  return new Formatter(opt).format(tokens);
};

export default format;
