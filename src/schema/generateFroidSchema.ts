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
  FED2_DEFAULT_VERSION,
  ID_FIELD_NAME,
  EXTENDS_DIRECTIVE,
  KEY_DIRECTIVE,
  TAG_DIRECTIVE,
  FED1_VERSION,
  FED2_VERSION_PREFIX,
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

type KeySorter = (keys: string[], node: ObjectTypeNode) => string[];

const isEntity = (nodes: ObjectTypeNode[]): boolean =>
  nodes.some((node) =>
    node?.directives?.some(
      (directive) => directive.name.value === KEY_DIRECTIVE
    )
  );

const defaultKeySorter: KeySorter = (keys: string[]): string[] => {
  return keys.sort((a, b) => a.indexOf('{') - b.indexOf('{'));
};

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
 * @param keySorter
 * @returns {ValidKeyDirective} The matching directive to use for generating the Global Object Identifier
 */
function selectValidKeyDirective(
  node: ObjectTypeDefinitionNode,
  keySorter: KeySorter
): ValidKeyDirective | undefined {
  const keyDirectives = node.directives?.filter(
    (directive) => directive.name.value === KEY_DIRECTIVE
  );

  if (!keyDirectives || keyDirectives.length === 0) {
    return;
  }

  // Prep the key directives for selection
  const keys = keyDirectives
    .map((directive) => directive.arguments)
    .flat()
    .map((arg) => arg?.value as StringValueNode)
    .filter(Boolean)
    .map((strNode) => strNode.value)
    // Protect against people using the `id` field as an entity key
    .filter((keys) => keys !== ID_FIELD_NAME);

  // get field names that are @key to the entity
  const firstValidKeyDirectiveFields = keySorter(keys, node).find((f) => f);

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
 * @param {ObjectTypeDefinitionNode[]} nodes - The node to decorate
 * @param {KeyMappingRecord} keyMappingRecord - The list of key fields for the node
 * @param {FederationVersion} federationVersion - The version of federation to generate schema for
 * @returns {FieldDefinitionNode[]} A list field definitions
 */
function getKeyFields(
  nodes: ObjectTypeNode[],
  keyMappingRecord: KeyMappingRecord,
  federationVersion: FederationVersion
): FieldDefinitionNode[] {
  const nodeIsEntity = isEntity(nodes);
  const keyFieldNames = Object.keys(keyMappingRecord);
  const allfields = nodes.flatMap((node) => node.fields || []);
  return (keyFieldNames
    .map((keyFieldName) => {
      const matchingField = allfields.find(
        (field) => field.name.value === keyFieldName
      );
      return {
        ...matchingField,
        description: undefined,
        directives:
          federationVersion === FederationVersion.V1 && nodeIsEntity
            ? [externalDirective]
            : [],
      };
    })
    .filter(Boolean) || []) as FieldDefinitionNode[];
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
      const currentNodes =
        definitionNodes.filter((node) => node.name.value === fieldType) || [];
      const currentNode = currentNodes[0];

      if (!currentNodes.length) {
        return;
      }

      const nodeIsEntity = isEntity(currentNodes);
      const existingNode = objectTypes[fieldType];
      const existingFields = existingNode?.fields || [];
      const existingDirectives = existingNode?.directives
        ? {directives: existingNode.directives}
        : {};
      const existingInterfaces = existingNode?.interfaces
        ? {interfaces: existingNode.interfaces}
        : {};

      const subKeyFields = getKeyFields(
        currentNodes,
        keyMapping[key] || {},
        federationVersion
      ).filter((field) =>
        existingFields.every(
          (existingField) => existingField.name.value !== field.name.value
        )
      );

      objectTypes[fieldType] = {
        kind:
          federationVersion === FederationVersion.V1 && nodeIsEntity
            ? Kind.OBJECT_TYPE_EXTENSION
            : Kind.OBJECT_TYPE_DEFINITION,
        name: currentNode.name,
        fields: [...existingFields, ...subKeyFields],
        ...existingDirectives,
        ...existingInterfaces,
      };

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
  federationVersion?: string;
  typeExceptions?: string[];
  nodeQualifier?: (
    node: DefinitionNode,
    objectTypes: Record<string, ObjectTypeNode>
  ) => boolean;
  keySorter?: KeySorter;
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
  const explicitFederationVersion =
    options?.federationVersion ?? FED2_DEFAULT_VERSION;

  if (
    explicitFederationVersion !== FED1_VERSION &&
    explicitFederationVersion.indexOf(FED2_VERSION_PREFIX) === -1
  ) {
    throw new Error(
      `Federation version must be either '${FED1_VERSION}' or a valid '${FED2_VERSION_PREFIX}x' version. Examples: v1, v2.0, v2.3`
    );
  }
  const federationVersion =
    explicitFederationVersion === FED1_VERSION
      ? FederationVersion.V1
      : FederationVersion.V2;
  const typeExceptions = options?.typeExceptions || [];
  const keySorter = options?.keySorter || defaultKeySorter;
  const nodeQualifier = options?.nodeQualifier || (() => true);
  const allTagDirectives: ConstDirectiveNode[] =
    options?.contractTags?.sort().map((tag) => createTagDirective(tag)) || [];

  const currentSchemaMap = new Map<string, string>(subgraphSchemaMap);
  // Must remove self from map of subgraphs before regenerating schema
  currentSchemaMap.delete(froidSubgraphName);

  // convert to a flat map of document nodes
  const subgraphs = [...currentSchemaMap.values()].map((sdl) => parse(sdl));

  // extract all definition nodes for federated schema
  const allDefinitionNodes = subgraphs.reduce<DefinitionNode[]>(
    (accumulator, value) => accumulator.concat(value.definitions),
    []
  );

  const filteredDefinitionNodes = removeInterfaceObjects(allDefinitionNodes);

  const extensionAndDefinitionNodes = getNonRootObjectTypes(
    filteredDefinitionNodes
  );
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
        const passesNodeQualifier = Boolean(nodeQualifier(node, objectTypes));

        if (isException || !passesNodeQualifier) {
          return objectTypes;
        }

        const validKeyDirective = selectValidKeyDirective(node, keySorter);

        if (!validKeyDirective) {
          return objectTypes;
        }

        const {keyMappingRecord, keyDirective} = validKeyDirective;

        const keyFields = getKeyFields(
          [node],
          keyMappingRecord,
          federationVersion
        );

        const idTagDirectives = getTagDirectivesForIdField(
          node,
          extensionAndDefinitionNodes
        );

        const nodeIsEntity = isEntity([node]);
        const existingNode = objectTypes[node.name.value];
        const existingFields = (existingNode?.fields || []).filter(
          (field) => field.name.value !== ID_FIELD_NAME
        );
        const dedupedKeyFields = keyFields.filter((field) =>
          existingFields.every(
            (existingField) => existingField.name.value !== field.name.value
          )
        );

        objectTypes[node.name.value] = {
          kind:
            federationVersion === FederationVersion.V1 && nodeIsEntity
              ? Kind.OBJECT_TYPE_EXTENSION
              : Kind.OBJECT_TYPE_DEFINITION,
          name: node.name,
          interfaces: existingNode?.interfaces || [implementsNodeInterface],
          directives: existingNode?.directives || [keyDirective],
          fields: [
            createIdField(idTagDirectives),
            ...existingFields,
            ...dedupedKeyFields,
          ],
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
      : createLinkSchemaExtension(
          ['@key', '@tag'],
          explicitFederationVersion as string
        );

  // build schema
  return {
    kind: Kind.DOCUMENT,
    definitions: [
      tagDefinition,
      ...createCustomReturnTypes(
        Object.values(relayObjectTypes),
        filteredDefinitionNodes,
        federationVersion
      ),
      createQueryDefinition(allTagDirectives),
      createNodeInterface(allTagDirectives),
      ...Object.values(relayObjectTypes),
    ],
  } as DocumentNode;
}
