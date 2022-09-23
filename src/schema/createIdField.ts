import {ConstDirectiveNode, FieldDefinitionNode, Kind} from 'graphql';
import {ID_FIELD_NAME, ID_FIELD_TYPE} from './constants';

/**
 * Represents AST for the `id` field
 * ...
 *   id: ID!
 * ...
 *
 * @param {ConstDirectiveNode[]} directives - The directives to add to the field definition
 * @returns {FieldDefinitionNode} The `id` field definition
 */
export function createIdField(
  directives: ConstDirectiveNode[] = []
): FieldDefinitionNode {
  return {
    kind: Kind.FIELD_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: ID_FIELD_NAME,
    },
    type: {
      kind: Kind.NON_NULL_TYPE,
      type: {
        kind: Kind.NAMED_TYPE,
        name: {
          kind: Kind.NAME,
          value: ID_FIELD_TYPE,
        },
      },
    },
    directives,
  };
}
