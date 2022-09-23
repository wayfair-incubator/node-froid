import {
  ConstDirectiveNode,
  InterfaceTypeDefinitionNode,
  Kind,
  NamedTypeNode,
} from 'graphql';
import {EXTERNAL_DIRECTIVE} from './constants';
import {createIdField} from './createIdField';

/**
 * Represents AST for Node type
 * interface Node {
 *   id: ID!
 * }
 */
export const nodeInterface: InterfaceTypeDefinitionNode = {
  kind: Kind.INTERFACE_TYPE_DEFINITION,
  name: {
    kind: Kind.NAME,
    value: 'Node',
  },
  fields: [createIdField()],
};

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
