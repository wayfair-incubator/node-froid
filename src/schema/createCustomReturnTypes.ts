import {
  Kind,
  specifiedScalarTypes,
  ScalarTypeDefinitionNode,
  DefinitionNode,
  EnumTypeDefinitionNode,
} from 'graphql';
import {extractFieldType} from './extractFieldType';
import {FederationVersion} from './generateFroidSchema';
import {ObjectTypeNode} from './types';

const scalarNames = specifiedScalarTypes.map((scalar) => scalar.name);

type SupportedFroidReturnTypes =
  | ScalarTypeDefinitionNode
  | EnumTypeDefinitionNode;

// Custom types that are supported when generating node relay service schema
const typeDefinitionKinds = [
  Kind.SCALAR_TYPE_DEFINITION,
  Kind.ENUM_TYPE_DEFINITION,
];

/**
 * Generates AST for custom scalars and enums used in the froid subgraph.
 *
 * Enum values with @inaccessible tags are stripped in Federation 2.
 *
 * Contract @tag directives are NOt applied when generating non-native scalar
 * return types in the Froid subgraph. Contract @tag directives are merged
 * during supergraph composition so Froid subgraph can rely on @tag directives
 * defined by the owning subgraph(s), UNLESS an enum value is marked @inaccessible,
 * which is only applicable in Federation 2 schemas.
 *
 * @param {ObjectTypeNode[]} froidNodes - All types defined in the froid subgraph
 * @param {DefinitionNode[]} allDefinitionNodes - All definition nodes across subgraphs
 * @param {FederationVersion} federationVersion - Subgraph federation version
 * @returns {DefinitionNode[]} The non-native scalar definitions needed to be definied in the froid subgraph
 */
export function createCustomReturnTypes(
  froidNodes: ObjectTypeNode[],
  allDefinitionNodes: DefinitionNode[],
  federationVersion: FederationVersion
): SupportedFroidReturnTypes[] {
  const froidNodeNames = froidNodes.map((obj) => obj.name.value);

  // Extract field return values that aren't native scalars (int, string, boolean, etc.)
  // and isn't a type that is already defined in the froid subgraph
  const nonNativeScalarDefinitionNames = new Set<string>();
  froidNodes.forEach((obj) => {
    obj?.fields?.forEach((field) => {
      const fieldReturnType = extractFieldType(field);
      if (
        !scalarNames.includes(fieldReturnType) &&
        !froidNodeNames.includes(fieldReturnType)
      ) {
        nonNativeScalarDefinitionNames.add(fieldReturnType);
      }
    });
  });

  // De-dupe non-native scalar return types. Any definitions of scalars and enums
  // will work since they can be gauranteed to be consistent across subgraphs
  const nonNativeScalarFieldTypes = new Map<
    string,
    SupportedFroidReturnTypes
  >();
  (
    allDefinitionNodes.filter((definitionNode) =>
      typeDefinitionKinds.includes(definitionNode.kind)
    ) as SupportedFroidReturnTypes[]
  ).filter((nonNativeScalarType) => {
    const returnTypeName = nonNativeScalarType.name.value;
    // Get only types that are returned in froid schema
    if (
      nonNativeScalarDefinitionNames.has(returnTypeName) &&
      !nonNativeScalarFieldTypes.has(returnTypeName)
    ) {
      if (nonNativeScalarType.kind === Kind.ENUM_TYPE_DEFINITION) {
        let enumValues = nonNativeScalarType.values;
        if (federationVersion === FederationVersion.V2) {
          enumValues = enumValues?.filter(
            (value) =>
              !value.directives?.some(
                (directive) => directive.name.value === 'inaccessible'
              )
          );
        }
        enumValues = enumValues?.map((enumValue) => ({
          ...enumValue,
          directives: [],
        }));
        nonNativeScalarFieldTypes.set(returnTypeName, {
          ...nonNativeScalarType,
          values: enumValues,
          directives: [],
          description: undefined,
        } as EnumTypeDefinitionNode);
      }
      if (nonNativeScalarType.kind === Kind.SCALAR_TYPE_DEFINITION) {
        nonNativeScalarFieldTypes.set(returnTypeName, {
          ...nonNativeScalarType,
          description: undefined,
          directives: [],
        } as ScalarTypeDefinitionNode);
      }
      // Enums and Scalars are the only non-native return type supported in @key fields.
    }
  });

  return [...nonNativeScalarFieldTypes.values()];
}
