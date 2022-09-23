import {
  ConstDirectiveNode,
  Kind,
  NameNode,
  UnionTypeDefinitionNode,
} from 'graphql';
import {UNION_TYPE_NAME} from './constants';

/**
 * Generate final union type definition
 *
 * @param {NameNode[]} types - The types that make up the RelayNodeEntity
 * @param {ConstDirectiveNode[]} allTagDirectives = The full list of supported contract tags
 * @returns {UnionTypeDefinitionNode} The Union tupe definition for the RelayNodeEntity
 */
export function createRelayUnionDefinition(
  types: NameNode[],
  allTagDirectives: ConstDirectiveNode[]
): UnionTypeDefinitionNode {
  return {
    kind: Kind.UNION_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: UNION_TYPE_NAME,
    },
    directives: allTagDirectives,
    types: types.map((name) => ({
      kind: Kind.NAMED_TYPE,
      name,
    })),
  };
}
