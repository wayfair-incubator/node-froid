import {ConstDirectiveNode, Kind} from 'graphql';

const CONTRACT_DIRECTIVE_NAME = 'tag';

/**
 * Generates an @tag directive node
 *
 * @param {string} name - The name of the tag
 * @returns {ConstDirectiveNode} A directive AST node for @tag
 */
export function createTagDirective(name: string): ConstDirectiveNode {
  return {
    kind: Kind.DIRECTIVE,
    name: {kind: Kind.NAME, value: CONTRACT_DIRECTIVE_NAME},
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: {kind: Kind.NAME, value: 'name'},
        value: {
          kind: Kind.STRING,
          value: name,
        },
      },
    ],
  };
}
