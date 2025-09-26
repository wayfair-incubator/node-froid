import {ConstDirectiveNode, Kind, NamedTypeNode} from 'graphql';
import {EXTERNAL_DIRECTIVE, SHAREABLE_DIRECTIVE} from './constants';

/**
 * Represents AST for `implements Node`
 */
export const implementsNodeInterface: NamedTypeNode = {
  kind: Kind.NAMED_TYPE,
  name: {
    kind: Kind.NAME,
    value: 'Node',
  },
};

/**
 * Represents AST for `@external` directive
 */
export const externalDirective: ConstDirectiveNode = {
  kind: Kind.DIRECTIVE,
  name: {
    kind: Kind.NAME,
    value: EXTERNAL_DIRECTIVE,
  },
};

/**
 * Represents AST for `@shareable` directive
 */
export const shareableDirective: ConstDirectiveNode = {
  kind: Kind.DIRECTIVE,
  name: {
    kind: Kind.NAME,
    value: SHAREABLE_DIRECTIVE,
  },
};
