import {
  ASTNode,
  ConstArgumentNode,
  ConstDirectiveNode,
  DefinitionNode,
  DocumentNode,
  EnumTypeDefinitionNode,
  EnumValueDefinitionNode,
  FieldDefinitionNode,
  InterfaceTypeDefinitionNode,
  Kind,
  ObjectTypeDefinitionNode,
  ScalarTypeDefinitionNode,
  SchemaExtensionNode,
  parse,
  print,
  specifiedScalarTypes,
} from 'graphql';
import {ObjectTypeNode} from './types';
import {
  CONTRACT_DIRECTIVE_NAME,
  DEFAULT_FEDERATION_LINK_IMPORTS,
  DirectiveName,
  FED2_OPT_IN_URL,
  FED2_VERSION_PREFIX,
  ID_FIELD_NAME,
  ID_FIELD_TYPE,
} from './constants';
import assert from 'assert';
import {Key} from './Key';
import {KeyField} from './KeyField';
import {ObjectType} from './ObjectType';
import {sortDocumentAst} from './sortDocumentAst';

type SupportedFroidReturnTypes =
  | ScalarTypeDefinitionNode
  | EnumTypeDefinitionNode;

export type KeySorter = (keys: Key[], node: ObjectTypeNode) => Key[];
export type NodeQualifier = (
  node: ASTNode,
  qualifiedNodes: ASTNode[]
) => boolean;
export type OmittedEntityQualifier = (
  omittedEntity: ObjectTypeDefinitionNode,
  includedEntities: ObjectTypeDefinitionNode[]
) => boolean;

export type FroidSchemaOptions = {
  contractTags?: string[];
  keySorter?: KeySorter;
  nodeQualifier?: NodeQualifier;
  omittedEntityQualifier?: OmittedEntityQualifier;
  typeExceptions?: string[];
};

/**
 * The default key sorter
 * This is used to sort keys in preparation for selecting the FROID key.
 * This sorter defaults to _no sorting whatsoever_.
 *
 * @param {Key[]} keys - The keys
 * @returns {Key[]} the keys in the order provided
 */
const defaultKeySorter: KeySorter = (keys: Key[]): Key[] => keys;

const defaultNodeQualifier: NodeQualifier = () => true;

const defaultOmittedEntityQualifier: NodeQualifier = () => false;

const scalarNames = specifiedScalarTypes.map((scalar) => scalar.name);

// Custom types that are supported when generating node relay service schema
const typeDefinitionKinds = [
  Kind.SCALAR_TYPE_DEFINITION,
  Kind.ENUM_TYPE_DEFINITION,
];

/**
 * A factory for creating FROID schema AST
 */
export class FroidSchema {
  /**
   * The contract tags that will be applied to FROID schema.
   */
  private readonly contractTags: ConstDirectiveNode[];
  /**
   * The Apollo Federation version that will be applied to the FROID schema.
   */
  private readonly federationVersion: string;
  /**
   * The key sorting function.
   */
  private readonly keySorter: KeySorter;
  /**
   * The node qualifier function.
   */
  private readonly nodeQualifier: NodeQualifier;
  /**
   * The omitted entity qualifier function.
   */
  private readonly omittedEntityQualifier: OmittedEntityQualifier;
  /**
   * the list of types that should be omitted from the FROID schema.
   */
  private readonly typeExceptions: string[];
  /**
   * Definition nodes from across the source schemas after eliminating nodes that should be ignored.
   */
  private readonly filteredDefinitionNodes: DefinitionNode[];
  /**
   * Object type extension and definition nodes from across all the source schemas.
   */
  private readonly extensionAndDefinitionNodes: ObjectTypeNode[];
  /**
   * Object type definitions from across the source schemas.
   */
  private readonly objectTypes: ObjectTypeDefinitionNode[];
  /**
   * The object types that should be included in the FROID schema.
   */
  private froidObjectTypes: Record<string, ObjectType> = {};
  /**
   * The final FROID AST.
   */
  private froidAst: DocumentNode;

  /**
   * Creates the FROID schema.
   *
   * @param {string} name - The name of the subgraph that serves the FROID schema.
   * @param {string} federationVersion - The Apollo Federation version to use for the FROID schema.
   * @param {Map<string, string>} schemas - The source schemas from which the FROID schema will be generated.
   * @param {FroidSchemaOptions} options - The options for FROID schema generation.
   */
  constructor(
    name: string,
    federationVersion: string,
    schemas: Map<string, string>,
    options: FroidSchemaOptions
  ) {
    this.federationVersion = federationVersion;

    assert(
      this.federationVersion.startsWith(FED2_VERSION_PREFIX),
      `Federation version must be a valid '${FED2_VERSION_PREFIX}x' version. Examples: v2.0, v2.3`
    );

    this.typeExceptions = options?.typeExceptions ?? [];
    this.keySorter = options?.keySorter ?? defaultKeySorter;
    this.nodeQualifier = options?.nodeQualifier ?? defaultNodeQualifier;
    this.omittedEntityQualifier =
      options?.omittedEntityQualifier ?? defaultOmittedEntityQualifier;
    this.contractTags =
      options?.contractTags
        ?.sort()
        .map<ConstDirectiveNode>((tag) =>
          FroidSchema.createTagDirective(tag)
        ) || [];

    const currentSchemaMap = new Map<string, string>(schemas);
    // Must remove self from map of subgraphs before regenerating schema
    currentSchemaMap.delete(name);

    // convert to a flat map of document nodes
    const subgraphs = [...currentSchemaMap.values()].map((sdl) =>
      FroidSchema.parseSchema(sdl)
    );

    // extract all definition nodes for federated schema
    const allDefinitionNodes = subgraphs.reduce<DefinitionNode[]>(
      (accumulator, value) => accumulator.concat(value.definitions),
      []
    );

    this.filteredDefinitionNodes =
      FroidSchema.removeInterfaceObjects(allDefinitionNodes);

    this.extensionAndDefinitionNodes = this.getNonRootObjectTypes();

    this.objectTypes = this.getObjectDefinitions();

    this.findFroidObjectTypes();
    this.generateFroidDependencies();

    // build schema
    this.froidAst = sortDocumentAst({
      kind: Kind.DOCUMENT,
      definitions: [
        this.createLinkSchemaExtension(),
        this.createQueryDefinition(),
        this.createNodeInterface(),
        ...this.createCustomReturnTypes(),
        ...this.createObjectTypesAST(),
      ],
    } as DocumentNode);
  }

  /**
   * Creates the AST for the object types that should be included in the FROID schema.
   *
   * @returns {ObjectTypeDefinitionNode[]} The generated object types.
   */
  private createObjectTypesAST(): ObjectTypeDefinitionNode[] {
    return Object.values(this.froidObjectTypes).map((froidObject) =>
      froidObject.toAst()
    );
  }

  /**
   * Retrieve the FROID schema AST.
   *
   * @returns {DocumentNode} The FROID AST.
   */
  public toAst(): DocumentNode {
    return this.froidAst;
  }

  /**
   * Retrieve the FROID schema string.
   *
   * @returns {string} The FROID schema string.
   */
  public toString(): string {
    return print(this.froidAst);
  }

  /**
   * Finds the object types that should be included in the FROID schema.
   */
  private findFroidObjectTypes() {
    const omittedEntities: ObjectTypeDefinitionNode[] = [];
    this.objectTypes.forEach((node: ObjectTypeDefinitionNode) => {
      const isException = this.typeExceptions.some(
        (exception) => node.name.value === exception
      );

      const passesNodeQualifier = Boolean(
        this.nodeQualifier(
          node,
          Object.values(this.froidObjectTypes).map((obj) => obj.node)
        )
      );

      if (isException || !FroidSchema.isEntity(node)) {
        return;
      }

      if (!passesNodeQualifier) {
        omittedEntities.push(node);
        return;
      }

      this.createFroidObjectType(node);
    });

    // After all FROID objects are identified, ensure there aren't
    // any omitted FROID objects we want to include
    omittedEntities.forEach((entity) => {
      if (this.froidObjectTypes[entity.name.value]) {
        // Skip any objects that are already included
        return;
      }
      const qualifies = this.omittedEntityQualifier(
        entity,
        Object.values(this.froidObjectTypes).map((obj) => obj.node)
      );
      if (!qualifies) {
        // Skip any omitted objects that we don't want to include
        return;
      }

      // Add any omitted objects that we do want to include
      this.createFroidObjectType(entity);
    });
  }

  /**
   * Creates a froid object type.
   *
   * @param {ObjectTypeDefinitionNode} node - The node the object type will be generated from.
   */
  private createFroidObjectType(node: ObjectTypeDefinitionNode) {
    const nodeInfo = new ObjectType(
      node,
      this.froidObjectTypes,
      this.objectTypes,
      this.extensionAndDefinitionNodes,
      this.keySorter,
      this.nodeQualifier
    );

    this.froidObjectTypes[node.name.value] = nodeInfo;
  }

  /**
   * Generates FROID object types for the dependencies of other FROID object types.
   */
  private generateFroidDependencies() {
    Object.values(this.froidObjectTypes).forEach(
      ({selectedKey, allKeyFields}) => {
        if (!selectedKey) {
          return;
        }
        this.generateFroidDependency(selectedKey.fields, allKeyFields);
      }
    );
  }

  /**
   * Generates a FROID object type's dependency.
   *
   * @param {KeyField[]} keyFields - The key fields of a FROID object type
   * @param {FieldDefinitionNode[]} fields - The fields of a FROID object type
   */
  private generateFroidDependency(
    keyFields: KeyField[],
    fields: FieldDefinitionNode[]
  ) {
    keyFields.forEach((keyField) => {
      if (!keyField.selections.length) {
        return;
      }
      const currentField = fields.find(
        (field) => field.name.value === keyField.name
      );

      if (!currentField) {
        return;
      }

      const fieldType = FroidSchema.extractFieldType(currentField);
      const matchingDefinitionNodes =
        this.objectTypes.filter((node) => node.name.value === fieldType) || [];

      if (!matchingDefinitionNodes.length) {
        return;
      }

      let existingNode = this.froidObjectTypes[fieldType];

      if (!existingNode) {
        this.createFroidObjectType(matchingDefinitionNodes[0]);
        existingNode = this.froidObjectTypes[fieldType];
      }

      existingNode.addExternallySelectedFields(keyField.selections);
      existingNode.addExternalKeySelections(keyField.selections);

      this.generateFroidDependency(keyField.selections, existingNode.allFields);
    });
  }

  /**
   * Returns all non-root types and extended types
   *
   * @returns {ObjectTypeNode[]} Only ObjectTypeDefinition + ObjectExtensionDefinition nodes that aren't root types
   */
  private getNonRootObjectTypes(): ObjectTypeNode[] {
    return this.filteredDefinitionNodes.filter(
      (node) =>
        (node.kind === Kind.OBJECT_TYPE_DEFINITION ||
          node.kind === Kind.OBJECT_TYPE_EXTENSION) &&
        !FroidSchema.isRootType(node.name.value)
    ) as ObjectTypeNode[];
  }

  /**
   * Creates the Apollo Federation @link directive.
   *
   * @param {string[]} imports - The imports to include in the @link directive.
   * @returns {SchemaExtensionNode} A schema extension node that includes the @link directive.
   */
  private createLinkSchemaExtension(
    imports: string[] = DEFAULT_FEDERATION_LINK_IMPORTS
  ): SchemaExtensionNode {
    if (!imports.length) {
      throw new Error('At least one import must be provided.');
    }

    const directiveArguments: readonly ConstArgumentNode[] = [
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'url',
        },
        value: {
          kind: Kind.STRING,
          value: FED2_OPT_IN_URL + this.federationVersion,
        },
      },
      {
        kind: Kind.ARGUMENT,
        name: {
          kind: Kind.NAME,
          value: 'import',
        },
        value: {
          kind: Kind.LIST,
          values: imports.map((value) => ({
            kind: Kind.STRING,
            value: value[0] === '@' ? value : `@${value}`,
          })),
        },
      },
    ];

    return {
      kind: Kind.SCHEMA_EXTENSION,
      directives: [
        {
          kind: Kind.DIRECTIVE,
          name: {
            kind: Kind.NAME,
            value: 'link',
          },
          arguments: directiveArguments,
        },
      ],
    };
  }

  /**
   * Generates AST for custom scalars and enums used in the froid subgraph.
   *
   * Enum values with @inaccessible tags are stripped in Federation 2.
   *
   * Contract @tag directives are NOT applied when generating non-native scalar
   * return types in the Froid subgraph. Contract @tag directives are merged
   * during supergraph composition so Froid subgraph can rely on @tag directives
   * defined by the owning subgraph(s), UNLESS an enum value is marked @inaccessible,
   * which is only applicable in Federation 2 schemas.
   *
   * @returns {DefinitionNode[]} The non-native scalar definitions needed to be definied in the froid subgraph
   */
  private createCustomReturnTypes(): SupportedFroidReturnTypes[] {
    const froidNodes = Object.values(this.froidObjectTypes);
    const froidNodeNames = froidNodes.map((obj) => obj.node.name.value);

    // Extract field return values that aren't native scalars (int, string, boolean, etc.)
    // and isn't a type that is already defined in the froid subgraph
    const nonNativeScalarDefinitionNames = new Set<string>();
    froidNodes.forEach((obj) => {
      obj.selectedFields.forEach((field) => {
        const fieldReturnType = FroidSchema.extractFieldType(field);
        if (
          !scalarNames.includes(fieldReturnType) &&
          !froidNodeNames.includes(fieldReturnType)
        ) {
          nonNativeScalarDefinitionNames.add(fieldReturnType);
        }
      });
    });

    // De-dupe non-native scalar return types.
    //
    // Any definitions of scalars and enums will work since they are
    // consistent across subgraphs.
    //
    // Enums must be combined across all subgraphs since they can deviate.
    const nonNativeScalarFieldTypes = new Map<
      string,
      SupportedFroidReturnTypes
    >();
    (
      this.filteredDefinitionNodes.filter((definitionNode) =>
        typeDefinitionKinds.includes(definitionNode.kind)
      ) as SupportedFroidReturnTypes[]
    ).forEach((nonNativeScalarType) => {
      const returnTypeName = nonNativeScalarType.name.value;
      if (!nonNativeScalarDefinitionNames.has(returnTypeName)) {
        // Don't get types that are not returned in froid schema
        return;
      }

      if (nonNativeScalarType.kind === Kind.ENUM_TYPE_DEFINITION) {
        let finalEnumValues: readonly EnumValueDefinitionNode[] = [];

        // Collect the enum values from the enum that is currently being inspected,
        // omitting all applied directives.
        const enumValues = nonNativeScalarType.values?.map((enumValue) => ({
          ...enumValue,
          directives: [],
        }));

        // Get the enum definition we've created so far if one exists
        const existingEnum = nonNativeScalarFieldTypes.get(
          returnTypeName
        ) as EnumTypeDefinitionNode;

        // If there are existing enum values, use them for the final enum
        if (existingEnum?.values) {
          finalEnumValues = existingEnum.values;
        }

        // If there are enum values associated with the enum definition
        // we're currently inspecting, include them in the final list of
        // enum values
        if (enumValues) {
          // Deduplicate enum values
          const dedupedEnumValues = enumValues.filter(
            (value) =>
              !finalEnumValues.some(
                (existingValue) => existingValue.name.value === value.name.value
              )
          );
          // Update the final enum value list
          finalEnumValues = [...finalEnumValues, ...dedupedEnumValues];
        }

        nonNativeScalarFieldTypes.set(returnTypeName, {
          ...nonNativeScalarType,
          values: finalEnumValues.length ? finalEnumValues : undefined,
          directives: [],
          description: undefined,
        } as EnumTypeDefinitionNode);
        return;
      }

      if (nonNativeScalarFieldTypes.has(returnTypeName)) {
        // Don't duplicate scalars
        return;
      }

      nonNativeScalarFieldTypes.set(returnTypeName, {
        ...nonNativeScalarType,
        description: undefined,
        directives: [],
      } as ScalarTypeDefinitionNode);
    });

    return [...nonNativeScalarFieldTypes.values()];
  }

  /**
   * Generates AST for the following type:
   * type Query {
   *   node(id: ID!): RelayNodeEntity
   * }
   *
   * @returns {ObjectTypeDefinitionNode} The Query definition for the Relay Object Identification schema
   */
  private createQueryDefinition(): ObjectTypeDefinitionNode {
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
          description: {
            kind: Kind.STRING,
            value: 'Fetches an entity by its globally unique identifier.',
          },
          name: {
            kind: Kind.NAME,
            value: 'node',
          },
          arguments: [
            {
              kind: Kind.INPUT_VALUE_DEFINITION,
              description: {
                kind: Kind.STRING,
                value: 'A globally unique entity identifier.',
              },
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
              value: 'Node',
            },
          },
          directives: this.contractTags,
        },
      ],
    };
  }

  /**
   * Represents AST for Node type
   * interface Node {
   *   id: ID!
   * }
   *
   * @returns {InterfaceTypeDefinitionNode} The Node interface definition for the Relay Object Identification schema
   */
  private createNodeInterface(): InterfaceTypeDefinitionNode {
    return {
      kind: Kind.INTERFACE_TYPE_DEFINITION,
      description: {
        kind: Kind.STRING,
        value:
          'The global identification interface implemented by all entities.',
      },
      name: {
        kind: Kind.NAME,
        value: 'Node',
      },
      fields: [FroidSchema.createIdField()],
      directives: this.contractTags,
    };
  }

  /**
   * Generates an @tag directive node
   *
   * @param {string} name - The name of the tag
   * @returns {ConstDirectiveNode} A directive AST node for @tag
   */
  public static createTagDirective(name: string): ConstDirectiveNode {
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

  /**
   * Extract type from a field definition node
   *
   * @param {any} node - The node we want to extract a field type from
   * @returns {string} The name of the type used to define a field
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public static extractFieldType(node: any): string {
    if (node.hasOwnProperty('type')) {
      return FroidSchema.extractFieldType(node.type);
    }
    return node?.name?.value;
  }

  /**
   * Represents AST for the `id` field
   * ...
   *   id: ID!
   * ...
   *
   * @param {ConstDirectiveNode[]} directives - The directives to add to the field definition
   * @returns {FieldDefinitionNode} The `id` field definition
   */
  public static createIdField(
    directives: ConstDirectiveNode[] = []
  ): FieldDefinitionNode {
    return {
      kind: Kind.FIELD_DEFINITION,
      description: {
        kind: Kind.STRING,
        value: `The globally unique identifier.`,
      },
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

  /**
   * @param {string} nodeNameValue - The node name
   * @returns {boolean} Whether or not the node is a root type
   */
  private static isRootType(nodeNameValue: string): boolean {
    return ['Query', 'Mutation', 'Subscription'].includes(nodeNameValue);
  }

  /**
   * Returns all non-extended types with explicit ownership to a single subgraph
   *
   * @returns {ObjectTypeNode[]} Only ObjectTypeDefinition + ObjectExtensionDefinition nodes that aren't root types
   */
  private getObjectDefinitions(): ObjectTypeDefinitionNode[] {
    return this.extensionAndDefinitionNodes.filter(
      (node) =>
        // only type definitions
        node.kind === Kind.OBJECT_TYPE_DEFINITION &&
        // No entities with `id` fields
        !node.fields?.some((field) => field.name.value === ID_FIELD_NAME) &&
        !node.directives?.some(
          (directive) =>
            // exclude @extends directive
            directive.name.value === DirectiveName.Extends ||
            // exclude  entity references, i.e. @key(fields: "...", resolvable: false)
            directive.arguments?.some(
              (argument) =>
                argument.name.value === 'resolvable' &&
                argument.value.kind === Kind.BOOLEAN &&
                !argument.value.value
            )
        )
    ) as ObjectTypeDefinitionNode[];
  }

  /**
   * Checks if given node is an ObjectTypeDefinition without an @extends directive.
   *
   * @param {DefinitionNode} node - Node to check
   * @returns {boolean} True if node is an ObjectTypeDefinition without an @extends directive, false otherwise.
   */
  private static isObjectTypeExtension(node: DefinitionNode): boolean {
    return !!(
      node.kind === Kind.OBJECT_TYPE_EXTENSION ||
      (node.kind === Kind.OBJECT_TYPE_DEFINITION &&
        node.directives?.some(
          (directive) => directive.name.value === DirectiveName.Extends
        ))
    );
  }

  /**
   * Removes nodes from the list that have @interfaceObject directive or their name is in extensionsWithInterfaceObject.
   *
   * @param {DefinitionNode[]} nodes - Array of nodes to filter
   * @param {string[]} extensionsWithInterfaceObject - Array of names to exclude
   * @returns {DefinitionNode[]} DefinitionNode[] - Filtered array of nodes.
   */
  private static removeInterfaceObjectsFromNodes(
    nodes: DefinitionNode[],
    extensionsWithInterfaceObject: string[]
  ): DefinitionNode[] {
    return nodes.filter(
      (node) =>
        !(
          ('directives' in node &&
            node.directives?.some(
              (directive) =>
                directive.name.value === DirectiveName.InterfaceObject
            )) ||
          ('name' in node &&
            node.name &&
            extensionsWithInterfaceObject.includes(node.name.value))
        )
    );
  }

  /**
   * Checks if given node is an ObjectTypeExtension and has @interfaceObject directive.
   * Checks for both `extend type Foo` and Java-style `type Foo @extends` syntax
   *
   * @param {DefinitionNode} node - Node to check
   * @returns {boolean} True if node is ObjectTypeExtension and has @interfaceObject directive, false otherwise.
   */
  private static getObjectTypeExtensionsWithInterfaceObject(
    node: DefinitionNode
  ): boolean {
    return !!(
      FroidSchema.isObjectTypeExtension(node) &&
      'directives' in node &&
      node.directives?.some(
        (directive) => directive.name.value === 'interfaceObject'
      )
    );
  }

  /**
   * Removes all ObjectTypeDefinition and ObjectTypeExtension nodes with @interfaceObject
   * directive.
   *
   * This is done because otherwise there is a type conflict in composition between
   * node-relay subgraph and subgraphs implementing the types with @interfaceObject
   *
   * Concrete implementers of the interface are entities themselves, so corresponding
   * node-relay subgraph types will still be generated for those.
   *
   * See https://www.apollographql.com/docs/federation/federated-types/interfaces/
   * for more info on the use of @interfaceObject (requires Federation Spec v2.3 or
   * higher)
   *
   * @param {DefinitionNode[]} nodes - Schema AST nodes
   * @returns {DefinitionNode[]} Only nodes that are not using @interfaceObject
   */
  private static removeInterfaceObjects(
    nodes: DefinitionNode[]
  ): DefinitionNode[] {
    const objectTypeExtensionsWithInterfaceObject = nodes
      .filter(FroidSchema.getObjectTypeExtensionsWithInterfaceObject)
      .flatMap((node) =>
        'name' in node && node.name?.value ? node.name.value : []
      );

    return FroidSchema.removeInterfaceObjectsFromNodes(
      nodes,
      objectTypeExtensionsWithInterfaceObject
    );
  }

  /**
   * Check whether or not a list of nodes contains an entity.
   *
   * @param {ObjectTypeNode[]} nodes - The nodes to check
   * @returns {boolean} Whether or not any nodes are entities
   */
  public static isEntity(nodes: ObjectTypeNode[]): boolean;
  /**
   * Check whether or not a node is an entity.
   *
   * @param {ObjectTypeNode} node - A node to check
   * @returns {boolean} Whether or not the node is an entity
   */
  public static isEntity(node: ObjectTypeNode): boolean;
  /**
   * Check whether or not one of more nodes is an entity.
   *
   * @param {ObjectTypeNode | ObjectTypeNode[]} node - One or more nodes to collectively check
   * @returns {boolean} Whether or not any nodes are entities
   */
  public static isEntity(node: ObjectTypeNode | ObjectTypeNode[]): boolean {
    const nodesToCheck = Array.isArray(node) ? node : [node];
    return nodesToCheck.some((node) =>
      node?.directives?.some(
        (directive) => directive.name.value === DirectiveName.Key
      )
    );
  }

  /**
   * Parse a schema string to AST.
   *
   * @param {string} schema - The schema string.
   * @returns {DocumentNode} AST
   */
  private static parseSchema(schema: string): DocumentNode {
    return parse(schema, {noLocation: true});
  }
}
