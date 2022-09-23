import {ConstDirectiveNode, Kind, ObjectTypeDefinitionNode} from 'graphql';
import {ID_FIELD_NAME, ID_FIELD_TYPE, UNION_TYPE_NAME} from './constants';

/**
 * Generates AST for the following type:
 * type Query {
 *   node(id: ID!): RelayNodeEntity
 * }
 *
 * @param {ConstDirectiveNode[]} allTagDirectives = The full list of supported contract tags
 * @returns {ObjectTypeDefinitionNode} The Query definition for the Relay Object Identification schema
 */
export function createQueryDefinition(
  allTagDirectives: ConstDirectiveNode[]
): ObjectTypeDefinitionNode {
  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: 'Query',
    },
    interfaces: [],
    directives: [],
    fields: [
      {
        kind: Kind.FIELD_DEFINITION,
        name: {
          kind: Kind.NAME,
          value: 'node',
        },
        arguments: [
          {
            kind: Kind.INPUT_VALUE_DEFINITION,
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
            directives: [],
          },
        ],
        type: {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: UNION_TYPE_NAME,
          },
        },
        directives: allTagDirectives,
      },
    ],
  };
}
