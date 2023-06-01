import {
  ConstDirectiveNode,
  DefinitionNode,
  DocumentNode,
  FieldDefinitionNode,
  Kind,
  ObjectTypeDefinitionNode,
  OperationDefinitionNode,
  StringValueNode,
  parse,
} from 'graphql';
import {
  ID_FIELD_NAME,
  EXTENDS_DIRECTIVE,
  KEY_DIRECTIVE,
  TAG_DIRECTIVE,
} from './constants';
import {implementsNodeInterface, externalDirective} from './astDefinitions';
import {isRootType} from './isRootType';
import {createNodeInterface} from './createNodeInterface';
import {createCustomReturnTypes} from './createCustomReturnTypes';
import {createTagDirective} from './createTagDirective';
import {createQueryDefinition} from './createQueryDefinition';
import {extractFieldType} from './extractFieldType';
import {createIdField} from './createIdField';
import {createLinkSchemaExtension} from './createLinkSchemaExtension';
import {createFederationV1TagDirectiveDefinition} from './createFederationV1TagDirectiveDefinition';
import {ObjectTypeNode, KeyMappingRecord, ValidKeyDirective} from './types';
import {removeInterfaceObjects} from './removeInterfaceObjects';

/**
 * Returns all non-root types and extended types
 *
 * @param {DefinitionNode[]} nodes - Root schema AST nodes
 * @returns {ObjectTypeNode[]} Only ObjectTypeDefinition + ObjectExtensionDefinition nodes that aren't root types
 */
function getNonRootObjectTypes(nodes: DefinitionNode[]): ObjectTypeNode[] {
  return nodes.filter(
    (node) =>
      (node.kind === Kind.OBJECT_TYPE_DEFINITION ||
        node.kind === Kind.OBJECT_TYPE_EXTENSION) &&
      !isRootType(node.name.value)
  ) as ObjectTypeNode[];
}

/**
 * Returns all non-extended types with explicit ownership to a single subgraph
 *
 * @param {DefinitionNode[]} nodes - Schema AST Nodes
 * @returns {ObjectTypeNode[]} Only ObjectTypeDefinition + ObjectExtensionDefinition nodes that aren't root types
 */
function getObjectDefinitions(
  nodes: ObjectTypeNode[]
): ObjectTypeDefinitionNode[] {
  return nodes.filter(
    (node) =>
      node.kind === Kind.OBJECT_TYPE_DEFINITION && // only type definitions
      !node.directives?.some(
        (directive) =>
          directive.name.value === EXTENDS_DIRECTIVE || // no @extends directive
          directive.arguments?.some(
            (argument) =>
              argument.name.value === 'resolvable' &&
              argument.value.kind === Kind.BOOLEAN &&
              !argument.value.value
          ) // no entity references, i.e. @key(fields: "...", resolvable: false)
      )
  ) as ObjectTypeDefinitionNode[];
}

/**
 * Returns all non-extended types with explicit ownership to a single subgraph
 *
 * @param {ObjectTypeDefinitionNode} node - The node to process `@key` directives for
 * @returns {ValidKeyDirective} The matching directive to use for generating the Global Object Identifier
 */
function selectValidKeyDirective(
  node: ObjectTypeDefinitionNode
): ValidKeyDirective | undefined {
  const keyDirectives = node.directives?.filter(
    (directive) => directive.name.value === KEY_DIRECTIVE
  );

  if (!keyDirectives || keyDirectives.length === 0) {
    return;
  }

  // get field names that are @key to the entity
  const firstValidKeyDirectiveFields = keyDirectives
    .map((directive) => directive.arguments)
    .flat()
    .map((arg) => arg?.value as StringValueNode)
    .filter(Boolean)
    .map((strNode) => strNode.value)
    // Protect against people using the `id` field as an entity key
    .filter((keys) => keys !== ID_FIELD_NAME)
    .sort((a, b) => a.indexOf('{') - b.indexOf('{'))
    .find((f) => f);

  if (!firstValidKeyDirectiveFields) {
    return;
  }

  // Wrap in a query in order to generate valid AST to crawl
  const keyDirectiveFields = parse(`query {${firstValidKeyDirectiveFields}}`);

  const mapChildFields = (fields, result) => {
    fields.map((field) => {
      if (field.selectionSet) {
        result[field.name.value] = {};
        mapChildFields(field.selectionSet.selections, result[field.name.value]);
      } else {
        result[field.name.value] = null;
      }
    });
  };

  const operationDefinition = keyDirectiveFields
    .definitions[0] as OperationDefinitionNode;
  const keyMappingRecord: KeyMappingRecord = {};
  mapChildFields(operationDefinition.selectionSet.selections, keyMappingRecord);

  const keyDirective = keyDirectives.find(
    (directive) =>
      (directive?.arguments?.[0]?.value as StringValueNode).value ===
      firstValidKeyDirectiveFields
  );

  if (!keyDirective) {
    throw new Error("Valid @key directive can't be found");
  }

  return {keyDirective, keyMappingRecord};
}

/**
 * Returns all non-extended types with explicit ownership to a single subgraph
 *
 * @param {ObjectTypeDefinitionNode} node - The node to process `@key` directives for
 * @param {ObjectTypeNode[]} objectNodes - The node to process `@key` directives for
 * @returns {ConstDirectiveNode[]} A list of `@tag` directives to use for the given `id` field
 */
function getTagDirectivesForIdField(
  node: ObjectTypeDefinitionNode,
  objectNodes: ObjectTypeNode[]
): ConstDirectiveNode[] {
  const tagDirectiveNames = objectNodes
    .filter((obj) => obj.name.value === node.name.value)
    .flatMap((obj) =>
      obj.fields?.flatMap((field) =>
        field.directives
          ?.filter((directive) => directive.name.value === TAG_DIRECTIVE)
          .map(
            (directive) =>
              (directive?.arguments?.[0].value as StringValueNode).value
          )
      )
    )
    .filter(Boolean)
    .sort() as string[];

  const tagDirectives: ConstDirectiveNode[] = [];
  const uniqueTagDirectivesNames = [...new Set(tagDirectiveNames || [])];

  uniqueTagDirectivesNames.forEach((tagName) => {
    tagDirectives.push(createTagDirective(tagName));
  });

  return tagDirectives;
}

/**
 * Generates key field nodes
 * Includes `@external` directive for Federation V1 generation
 *
 * @param {ObjectTypeDefinitionNode} node - The node to decorate
 * @param {KeyMappingRecord} keyMappingRecord - The list of key fields for the node
 * @param {FederationVersion} federationVersion - The version of federation to generate schema for
 * @returns {FieldDefinitionNode[]} A list field definitions
 */
function getKeyFields(
  node: ObjectTypeNode,
  keyMappingRecord: KeyMappingRecord,
  federationVersion: FederationVersion
): FieldDefinitionNode[] {
  const keyFieldNames = Object.keys(keyMappingRecord);

  return (
    node.fields
      // take only @key fields and add @external directive to each of these
      ?.filter((field) => keyFieldNames.includes(field.name.value))
      .map(
        (field): FieldDefinitionNode => ({
          ...field,
          description: undefined,
          directives:
            federationVersion === FederationVersion.V1
              ? [externalDirective]
              : [],
        })
      ) || []
  );
}

/**
 * Generates object types required to support complex nested keys
 * Includes `@external` directive for Federation V1 generation
 *
 * @param {ObjectTypeDefinitionNode[]} definitionNodes - All definition nodes in the schema
 * @param {FederationVersion} federationVersion - The version of federation to generate schema for
 * @param {Record<string, ObjectTypeNode>} objectTypes - The generated relay entities
 * @param {FieldDefinitionNode[]} fields - The fields
 * @param {KeyMappingRecord} keyMapping - The list of key fields for the node
 * @returns {FieldDefinitionNode[]} A list field definitions
 */
function generateComplexKeyObjectTypes(
  definitionNodes: ObjectTypeDefinitionNode[],
  federationVersion: FederationVersion,
  objectTypes: Record<string, ObjectTypeNode>,
  fields: FieldDefinitionNode[],
  keyMapping: KeyMappingRecord
) {
  return Object.keys(keyMapping).flatMap((key) => {
    if (keyMapping[key]) {
      const currentField = fields.find((field) => field.name.value === key);
      const fieldType = extractFieldType(currentField);
      const currentNode = definitionNodes.find(
        (node) => node.name.value === fieldType
      );

      if (!currentNode) {
        return;
      }

      const subKeyFields = getKeyFields(
        currentNode,
        keyMapping[key] || {},
        federationVersion
      );

      if (!objectTypes.hasOwnProperty(fieldType)) {
        objectTypes[fieldType] = {
          kind:
            federationVersion === FederationVersion.V1
              ? Kind.OBJECT_TYPE_EXTENSION
              : Kind.OBJECT_TYPE_DEFINITION,
          name: currentNode.name,
          fields: subKeyFields,
        };
      }

      generateComplexKeyObjectTypes(
        definitionNodes,
        federationVersion,
        objectTypes,
        subKeyFields,
        keyMapping[key] || {}
      );
    }
  });
}

export enum FederationVersion {
  V1,
  V2,
}

export type GenerateRelayServiceSchemaOptions = {
  contractTags?: string[];
  federationVersion?: FederationVersion;
  typeExceptions?: string[];
};

/**
 * Generates the schema for the Relay Object Identification service
 *
 * @param {Map<string, string>} subgraphSchemaMap - A subgraphName -> subgraphSDL mapping used to generate the relay schema
 * @param {string} froidSubgraphName - The name of the relay subgraph service
 * @param {object} options - Additional configuration options for generating relay-complaint schemas
 * @param {string[]} options.contractTags - A list of supported contract tags
 * @param {FederationVersion} options.federationVersion - The version of federation to generate schema for
 * @param {string[]} options.typeExceptions - Types to exclude from `id` field generation
 * @returns {DocumentNode[]} The Relay Object Identification schema
 */
export function generateFroidSchema(
  subgraphSchemaMap: Map<string, string>,
  froidSubgraphName: string,
  options: GenerateRelayServiceSchemaOptions = {}
): DocumentNode {
  // defaults
  const federationVersion = options?.federationVersion ?? FederationVersion.V2;
  const typeExceptions = options?.typeExceptions || [];
  const allTagDirectives: ConstDirectiveNode[] =
    options?.contractTags?.sort().map((tag) => createTagDirective(tag)) || [];

  const currentSchemaMap = new Map<string, string>(subgraphSchemaMap);
  // Must remove self from map of subgraphs before regenerating schema
  currentSchemaMap.delete(froidSubgraphName);

  // convert to a flat map of document nodes
  const subgraphs = [...currentSchemaMap.values()].map((sdl) => parse(sdl));

  // extract all definition nodes for federated schema
  let allDefinitionNodes = subgraphs.reduce<DefinitionNode[]>(
    (accumulator, value) => accumulator.concat(value.definitions),
    []
  );

  allDefinitionNodes = removeInterfaceObjects(allDefinitionNodes);

  const extensionAndDefinitionNodes = getNonRootObjectTypes(allDefinitionNodes);
  const definitionNodes = getObjectDefinitions(extensionAndDefinitionNodes);

  // generate list of object types we need to generate the relay schema
  const relayObjectTypes: Record<string, ObjectTypeNode> =
    definitionNodes.reduce(
      (
        objectTypes: Record<string, ObjectTypeNode>,
        node: ObjectTypeDefinitionNode
      ) => {
        const isException = typeExceptions.some(
          (exception) => node.name.value === exception
        );

        if (isException) {
          return objectTypes;
        }

        const validKeyDirective = selectValidKeyDirective(node);

        if (!validKeyDirective) {
          return objectTypes;
        }

        const {keyMappingRecord, keyDirective} = validKeyDirective;

        const keyFields = getKeyFields(
          node,
          keyMappingRecord,
          federationVersion
        );

        const idTagDirectives = getTagDirectivesForIdField(
          node,
          extensionAndDefinitionNodes
        );

        objectTypes[node.name.value] = {
          kind:
            federationVersion === FederationVersion.V1
              ? Kind.OBJECT_TYPE_EXTENSION
              : Kind.OBJECT_TYPE_DEFINITION,
          name: node.name,
          interfaces: [implementsNodeInterface],
          directives: [keyDirective],
          fields: [createIdField(idTagDirectives), ...keyFields],
        };

        generateComplexKeyObjectTypes(
          definitionNodes,
          federationVersion,
          objectTypes,
          keyFields,
          keyMappingRecord
        );

        return objectTypes;
      },
      {}
    );

  const tagDefinition =
    federationVersion === FederationVersion.V1
      ? createFederationV1TagDirectiveDefinition()
      : createLinkSchemaExtension(['@key', '@tag']);

  // build schema
  return {
    kind: Kind.DOCUMENT,
    definitions: [
      tagDefinition,
      ...createCustomReturnTypes(
        Object.values(relayObjectTypes),
        allDefinitionNodes,
        federationVersion
      ),
      createQueryDefinition(allTagDirectives),
      createNodeInterface(allTagDirectives),
      ...Object.values(relayObjectTypes),
    ],
  } as DocumentNode;
}
