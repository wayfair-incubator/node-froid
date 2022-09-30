import {
  Kind,
  specifiedScalarTypes,
  ScalarTypeDefinitionNode,
  ConstDirectiveNode,
} from 'graphql';
import {extractFieldType} from './extractFieldType';
import {ObjectTypeNode} from './types';

const scalarNames = specifiedScalarTypes.map((scalar) => scalar.name);

/**
 * Generates AST for custom scalars used in the froid subgraph.
 *
 * @param {ObjectTypeNode[]} objectNodes - All types defined in the froid subgraph
 * @param {ConstDirectiveNode[]} allTagDirectives - The full list of supported contract tags
 * @returns {ScalarTypeDefinitionNode[]} The custom scalars needed to be definied in the froid subgraph
 */
export function createCustomScalars(
  objectNodes: ObjectTypeNode[],
  allTagDirectives: ConstDirectiveNode[]
): ScalarTypeDefinitionNode[] {
  const objectNames = objectNodes.map((obj) => obj.name.value);
  const scalars = new Set<string>();

  objectNodes.forEach((obj) => {
    obj?.fields?.forEach((field) => {
      const scalar = extractFieldType(field);

      if (!scalarNames.includes(scalar) && !objectNames.includes(scalar)) {
        scalars.add(scalar);
      }
    });
  });

  return [...scalars].map((scalar) => ({
    kind: Kind.SCALAR_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: scalar,
    },
    directives: allTagDirectives,
  }));
}
