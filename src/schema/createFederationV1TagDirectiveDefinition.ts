import {DirectiveDefinitionNode, Kind} from 'graphql';

/**
 * Creates a valid Fed v1fed1 `@tag` directive definition
 *
 * @returns {DirectiveDefinitionNode} The `@tag` directive definition
 */
export function createFederationV1TagDirectiveDefinition(): DirectiveDefinitionNode {
  return {
    kind: Kind.DIRECTIVE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: 'tag',
    },
    arguments: [
      {
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: {kind: Kind.NAME, value: 'name'},
        type: {
          kind: Kind.NON_NULL_TYPE,
          type: {
            kind: Kind.NAMED_TYPE,
            name: {kind: Kind.NAME, value: 'String'},
          },
        },
      },
    ],
    locations: [
      {kind: Kind.NAME, value: 'FIELD_DEFINITION'},
      {kind: Kind.NAME, value: 'OBJECT'},
      {kind: Kind.NAME, value: 'INTERFACE'},
      {kind: Kind.NAME, value: 'UNION'},
      {kind: Kind.NAME, value: 'ARGUMENT_DEFINITION'},
      {kind: Kind.NAME, value: 'SCALAR'},
      {kind: Kind.NAME, value: 'ENUM'},
      {kind: Kind.NAME, value: 'ENUM_VALUE'},
      {kind: Kind.NAME, value: 'INPUT_OBJECT'},
      {kind: Kind.NAME, value: 'INPUT_FIELD_DEFINITION'},
    ],
    repeatable: true,
  };
}
