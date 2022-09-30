import {ConstDirectiveNode, InterfaceTypeDefinitionNode, Kind} from 'graphql';
import {createIdField} from './createIdField';

/**
 * Represents AST for Node type
 * interface Node {
 *   id: ID!
 * }
 *
 * @param {ConstDirectiveNode[]} allTagDirectives - The full list of supported contract tags
 * @returns {InterfaceTypeDefinitionNode} The Node interface definition for the Relay Object Identification schema
 */
export function createNodeInterface(
  allTagDirectives: ConstDirectiveNode[]
): InterfaceTypeDefinitionNode {
  return {
    kind: Kind.INTERFACE_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: 'Node',
    },
    fields: [createIdField()],
    directives: allTagDirectives,
  };
}
