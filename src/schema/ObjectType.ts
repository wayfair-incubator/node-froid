import {
  ConstDirectiveNode,
  FieldDefinitionNode,
  NamedTypeNode,
  ObjectTypeDefinitionNode,
  StringValueNode,
} from 'graphql';
import {Key} from './Key';
import {DirectiveName, EXTERNAL_DIRECTIVE_AST} from './constants';
import {ObjectTypeNode} from './types';
import {FroidSchema, KeySorter, NodeQualifier} from './FroidSchema';
import {KeyField} from './KeyField';
import {implementsNodeInterface} from './astDefinitions';

const FINAL_KEY_MAX_DEPTH = 100;

/**
 * Collates information about an object type definition node.
 */
export class ObjectType {
  /**
   * The name of the object type.
   */
  public readonly typename: string;
  /**
   * All occurrences of the node across all subgraph schemas.
   */
  public readonly occurrences: ObjectTypeNode[];
  /**
   * All keys applied to all occurrences of the node.
   */
  public readonly keys: Key[];
  /**
   * All the child fields from all occurrences of the node as records.
   */
  public readonly allFieldRecords: Record<string, FieldDefinitionNode>;
  /**
   * All the child fields from all occurrences of the node as a list.
   */
  public readonly allFields: FieldDefinitionNode[];
  /**
   * The names of all the fields that appear in the keys of the node.
   */
  public readonly allKeyFieldsList: string[];
  /**
   * All the fields that appear in the keys of the node.
   */
  public readonly allKeyFields: FieldDefinitionNode[];
  /**
   * Whether or not the object is an entity.
   */
  public readonly isEntity: boolean;
  /**
   * Fields belonging to this object type that were selected for
   * use in the keys of other object types.
   */
  private _externallySelectedFields: string[] = [];
  /**
   * Key selections belonging to this object type that were selected
   * for use in the keys of other object types.
   */
  private _externalKeySelections: KeyField[] = [];
  /**
   * The key selected for use in the FROID schema.
   */
  private _selectedKey: Key | undefined;
  /**
   * The list of child objects that appear in the selected key.
   * Each record is made up of the field referencing a child object
   * and the object it is referencing.
   *
   * Example schema:
   * type Book @key(fields: "theBookAuthor { name }") {
   *   theBookAuthor: Author!
   * }
   * type Author {
   *   name
   * }
   *
   * Example record:
   * { "theBookAuthor": "Author" }
   */
  private childObjectsInSelectedKey: Record<string, string>;
  /**
   * The names of the fields that are being used by the node itself.
   *
   * Example schema:
   * type Book @key(fields: "author { name }") {
   *   author: Author!
   * }
   * type Author @key(fields: "authorId") {
   *   authorId: Int!
   *   name: String!
   * }
   *
   * Example value:
   * ['authorId']
   */
  private directlySelectedFields: string[];

  /**
   *
   * @param {ObjectTypeDefinitionNode} node - The node for which information is being collated
   * @param {Record<string, ObjectType>} froidObjectTypes - Information about the object types collected to be included in the FROID schema
   * @param {ObjectTypeDefinitionNode[]} objectTypes - The object type definitions from across the source schemas
   * @param {ObjectTypeNode[]} extensionAndDefinitionNodes - The object type definition and extension nodes from across the source schemas
   * @param {KeySorter} keySorter - A function for sorting object keys prior to selection
   * @param {NodeQualifier} nodeQualifier - A function for qualifying whether a node should be used for populating the FROID schema or not
   */
  constructor(
    public readonly node: ObjectTypeDefinitionNode,
    private readonly froidObjectTypes: Record<string, ObjectType>,
    private readonly objectTypes: ObjectTypeDefinitionNode[],
    private readonly extensionAndDefinitionNodes: ObjectTypeNode[],
    private readonly keySorter: KeySorter,
    private readonly nodeQualifier: NodeQualifier
  ) {
    this.typename = this.node.name.value;
    this.occurrences = this.getOccurrences();
    this.keys = this.getKeys();
    this.allFieldRecords = this.getAllFieldRecords();
    this.allFields = this.getAllFields();
    this.allKeyFieldsList = this.getAllKeyFieldsList();
    this.allKeyFields = this.getAllKeyFields();
    this._selectedKey = this.getSelectedKey();
    this.childObjectsInSelectedKey = this.getChildObjectsInSelectedKey();
    this.directlySelectedFields = this.getDirectlySelectedFields();
    this.isEntity = FroidSchema.isEntity(this.occurrences);
  }

  /**
   * Get all occurrences of the node across all subgraph schemas.
   *
   * @returns {ObjectTypeNode[]} The list of occurrences
   */
  private getOccurrences(): ObjectTypeNode[] {
    return this.extensionAndDefinitionNodes.filter(
      (searchNode) => searchNode.name.value === this.typename
    );
  }

  /**
   * Get all keys applied to all occurrences of the node.
   *
   * @returns {Key[]} The list of keys
   */
  private getKeys(): Key[] {
    return this.occurrences.flatMap(
      (occurrence) =>
        occurrence.directives
          ?.filter((directive) => directive.name.value === DirectiveName.Key)
          .map((key) => new Key(this.typename, key)) || []
    );
  }

  /**
   * Get all the child fields from all occurrences of the node as records.
   *
   * @returns {Record<string, FieldDefinitionNode>} The of field records
   */
  private getAllFieldRecords(): Record<string, FieldDefinitionNode> {
    const fields: Record<string, FieldDefinitionNode | null> = {};
    this.occurrences.forEach((occurrence) =>
      occurrence?.fields?.forEach((field) => {
        if (!fields[field.name.value]) {
          fields[field.name.value] = null;
        }
        this.addQualifiedField(field, fields);
      })
    );
    Object.entries(fields)
      .filter(([, field]) => field === null)
      .forEach(([fieldName]) => {
        this.occurrences.some((occurrence) => {
          occurrence?.fields?.forEach((field) => {
            if (field.name.value !== fieldName) {
              return false;
            }
            this.addQualifiedField(field, fields, false);
            return true;
          });
        });
      });
    return Object.fromEntries(
      Object.entries(fields).filter(([, def]) => Boolean(def)) as [
        string,
        FieldDefinitionNode
      ][]
    );
  }

  /**
   * Get all the child fields from all occurrences of the node.
   *
   * @returns {FieldDefinitionNode[]} The list of fields
   */
  private getAllFields(): FieldDefinitionNode[] {
    return Object.values(this.allFieldRecords);
  }

  /**
   * Add a qualified field to the list of fields.
   *
   * @param {FieldDefinitionNode} field - The field to add.
   * @param {FieldDefinitionNode[]} fields - The current list of collected fields.
   * @param {boolean} applyNodeQualifier - Whether or not to usethe nodeQualifier when selecting the node. Defaults to 'true'.
   */
  private addQualifiedField(
    field: FieldDefinitionNode,
    fields: Record<string, FieldDefinitionNode | null>,
    applyNodeQualifier = true
  ): void {
    if (
      fields[field.name.value] !== null ||
      (applyNodeQualifier && !this.nodeQualifier(field, this.objectTypes))
    ) {
      // If the field is already in the list
      // of if the field must pass the node qualifier and fails to
      // don't add it again
      return;
    }
    // Add the node
    fields[field.name.value] = field;
  }

  /**
   * Get the names of all the fields that appear in the keys of the node.
   *
   * @returns {string[]} The list of key field names
   */
  private getAllKeyFieldsList(): string[] {
    return [...new Set(this.keys.flatMap((key) => key.fieldsList))];
  }

  /**
   * Get all the fields that appear in the keys of the node.
   *
   * @returns {FieldDefinitionNode[]} The list of key fields
   */
  public getAllKeyFields(): FieldDefinitionNode[] {
    return this.allFields.filter((field) =>
      this.allKeyFieldsList.includes(field.name.value)
    );
  }

  /**
   * Get the key selected for use in the FROID schema.
   *
   * @returns {Key|undefined} The selected key
   */
  private getSelectedKey(): Key | undefined {
    return this.keySorter(this.keys, this.node)[0];
  }

  /**
   * The list of child objects that appear in the selected key.
   * Each record is made up of the field referencing a child object
   * and the object it is referencing.
   *
   * @returns {Record<string, string>} The list of fields that reference a child object and the object the field is referencing
   */
  public getChildObjectsInSelectedKey(): Record<string, string> {
    const children: Record<string, string> = {};
    if (!this._selectedKey) {
      return children;
    }
    this._selectedKey.fieldsList.forEach((keyField) => {
      const field = this.allFieldRecords[keyField];
      const fieldType = FroidSchema.extractFieldType(field);
      if (
        !this.objectTypes.find(
          (searchType) => searchType.name.value === fieldType
        )
      ) {
        return;
      }
      children[field.name.value] = fieldType;
    });
    return children;
  }

  /**
   * Get the names of the fields that are being used by the node itself.
   *
   * @returns {string[]} The list of field names
   */
  public getDirectlySelectedFields(): string[] {
    return (
      this._selectedKey?.fieldsList?.filter((keyField) =>
        Boolean(this.allFieldRecords[keyField])
      ) || []
    );
  }

  /**
   * The names of the fields that are referenced in another entity's key.
   *
   * Example schema:
   * type Book @key(fields: "author { name }") {
   *   author: Author!
   * }
   * type Author {
   *   name: String!
   * }
   *
   * Example value:
   * ['name']
   *
   * @returns {string[]} The list of field names
   */
  public get externallySelectedFields(): string[] {
    return this._externallySelectedFields;
  }

  /**
   * The key selections that are referenced in another entity's key.
   *
   * @returns {KeyField[]} The list of key field selections
   */
  public get externalKeySelections(): KeyField[] {
    return this._externalKeySelections;
  }

  /**
   * The list of all fields referenced in the node key and by other entities.
   *
   * @returns {FieldDefinitionNode} The list of fields
   */
  public get selectedFields(): FieldDefinitionNode[] {
    return [
      ...new Set([
        ...this.directlySelectedFields,
        ...this.externallySelectedFields,
      ]),
    ]
      .map((keyField) => {
        const field = this.allFieldRecords[keyField];
        if (field) {
          return field;
        }
      })
      .filter(Boolean) as FieldDefinitionNode[];
  }

  /**
   * The key selected for use in the FROID schema.
   *
   * @returns {Key | undefined} The selected key
   */
  public get selectedKey(): Key | undefined {
    return this._selectedKey;
  }

  /**
   * The node's key after all key fields used by other entities are added.
   *
   * @returns {Key|undefined} The final key. Undefined if the node is not an entity.
   */
  public get finalKey(): Key | undefined {
    return this.getFinalKey();
  }

  /**
   * Generates the final key for the node based on all descendant types and their keys (if they have keys).
   *
   * @param {number} depth - The current nesting depth of the key. Defaults to 0.
   * @param {string[]} ancestors - The type name of ancestors that have been traversed up to the current key depth.
   * @returns {Key|undefined} The final key or undefined if the node has no key.
   */
  private getFinalKey(depth = 0, ancestors: string[] = []): Key | undefined {
    if (!this._selectedKey) {
      this.setSelectedKeyFromExternalSelections();
    }

    if (!this._selectedKey) {
      return;
    }

    if (depth > FINAL_KEY_MAX_DEPTH) {
      console.error(
        `Encountered max entity key depth on type '${
          this.typename
        }'. Depth: ${depth}; Ancestors: "${ancestors.join('", "')}"`
      );
      return;
    }

    const usedKeys = this.getUsedKeys();
    const updatedSelectedKey = usedKeys.shift();

    if (!updatedSelectedKey) {
      return;
    }

    // Update the selected key in case a different key was selected
    this.setSelectedKey(updatedSelectedKey);

    const mergedKey = new Key(this.typename, this._selectedKey.toString());
    const selectedKeyFields = [
      ...usedKeys.flatMap((key) => key.toString()),
    ].join(' ');

    if (selectedKeyFields) {
      const keyFromSelections = new Key(this.typename, selectedKeyFields);
      mergedKey.merge(keyFromSelections);
    }
    Object.entries(this.childObjectsInSelectedKey).forEach(
      ([dependentField, dependencyType]) => {
        if (ancestors.includes(dependencyType)) {
          console.error(
            `Encountered node FROID final key recursion on type "${dependencyType}". Ancestors: "${ancestors.join(
              '", "'
            )}"`
          );
          return;
        }
        const dependency = this.froidObjectTypes[dependencyType];
        const dependencyFinalKey = dependency.getFinalKey(depth + 1, [
          ...ancestors,
          this.typename,
        ]);
        if (!dependencyFinalKey) {
          return;
        }
        const keyToMerge = new Key(
          this.typename,
          `${dependentField} { ${dependencyFinalKey.toString()} }`
        );
        mergedKey.merge(keyToMerge);
      }
    );
    return mergedKey;
  }

  /**
   * Assigns a new selected key.
   *
   * @param {Key} key - The key
   */
  private setSelectedKey(key: Key) {
    this._selectedKey = key;
    this.childObjectsInSelectedKey = this.getChildObjectsInSelectedKey();
    this.directlySelectedFields = this.getDirectlySelectedFields();
  }

  /**
   * Assigns a new selected key based on key selections from
   * another entity's key.
   *
   * This is used to generate a selected key for _value types_.
   */
  private setSelectedKeyFromExternalSelections(): void {
    if (this.isEntity) {
      // This method is only meant to be used when the
      // object is a value type. It the object is an entity,
      // don't proceed
      return;
    }
    let selectedKey: Key | undefined;
    this._externalKeySelections.forEach((selections) => {
      if (selectedKey) {
        selectedKey.merge(new Key(this.typename, selections.toString()));
      } else {
        selectedKey = new Key(this.typename, selections.toString());
      }
    });

    if (!selectedKey) {
      return;
    }

    this.setSelectedKey(selectedKey);
  }

  /**
   * Gets the keys used either by default or in other entity keys.
   *
   * @returns {Key[]} The used keys
   */
  private getUsedKeys(): Key[] {
    if (!this.isEntity) {
      this.setSelectedKeyFromExternalSelections();
    }

    if (!this._selectedKey) {
      return [];
    }

    const usedExternalKeys = this.keys.filter((key) =>
      key.fieldsList.some((field) =>
        this._externallySelectedFields.includes(field)
      )
    );
    if (!usedExternalKeys.length) {
      return [this._selectedKey];
    }
    return usedExternalKeys.sort((aKey, bKey) => {
      if (aKey === this._selectedKey) {
        return -1;
      }
      if (bKey === this._selectedKey) {
        return 1;
      }
      return 0;
    });
  }

  /**
   * Gets the final fields for the object.
   *
   * @param {key|undefined} finalKey - The final key of the object
   * @returns {FieldDefinitionNode[]} The final fields
   */
  private getFinalFields(finalKey: Key | undefined): FieldDefinitionNode[] {
    const fieldsList = [
      ...new Set([
        ...(finalKey?.fieldsList || []),
        ...this._externallySelectedFields,
      ]),
    ];
    const fields = fieldsList
      .map((fieldName) => {
        const fieldDef = this.allFieldRecords[fieldName];
        if (!fieldDef) {
          return;
        }
        const isExternalEntityField =
          !this.isEntity || this.allKeyFieldsList.includes(fieldName);
        return {
          ...fieldDef,
          description: undefined,
          directives: isExternalEntityField
            ? undefined
            : [EXTERNAL_DIRECTIVE_AST],
        };
      })
      .filter(Boolean) as FieldDefinitionNode[];
    return fields;
  }

  /**
   * Get contract @tag directives for an ID field. Returns all occurrences of unique @tag
   * directives used across all fields included in the node's @key directive
   *
   * @returns {ConstDirectiveNode[]} A list of `@tag` directives to use for the given `id` field
   */
  private getTagDirectivesForIdField(): ConstDirectiveNode[] {
    const tagDirectiveNames = this.extensionAndDefinitionNodes
      .filter((obj) => obj.name.value === this.typename)
      .flatMap((obj) => {
        const taggableNodes = obj.fields?.flatMap((field) => [
          field,
          ...(field?.arguments || []),
        ]);
        return taggableNodes?.flatMap((field) =>
          field.directives
            ?.filter((directive) => directive.name.value === DirectiveName.Tag)
            .map(
              (directive) =>
                (directive?.arguments?.[0].value as StringValueNode).value
            )
        );
      })
      .filter(Boolean)
      .sort() as string[];

    const uniqueTagDirectivesNames: string[] = [
      ...new Set(tagDirectiveNames || []),
    ];
    return uniqueTagDirectivesNames.map<ConstDirectiveNode>((tagName) =>
      FroidSchema.createTagDirective(tagName)
    );
  }

  /**
   * Adds the names of fields used by other entities to the list of externally selected fields.
   *
   * @param {KeyField[]} fields - The key fields to add to the list
   * @returns {void}
   */
  public addExternallySelectedFields(fields: KeyField[]): void {
    this._externallySelectedFields = [
      ...new Set([
        ...this._externallySelectedFields,
        ...fields.map((field) => field.name),
      ]),
    ];
  }

  /**
   * Add key selections found in another entity's key.
   *
   * @param {KeyField[]} selections - The selections found in another entity's key
   */
  public addExternalKeySelections(selections: KeyField[]): void {
    this._externalKeySelections = [
      ...new Set([...this._externalKeySelections, ...selections]),
    ];
  }

  /**
   * Creates the object's AST.
   *
   * @returns {ObjectTypeDefinitionNode} The object's AST.
   */
  public toAst(): ObjectTypeDefinitionNode {
    let froidFields: FieldDefinitionNode[] = [];
    let froidInterfaces: NamedTypeNode[] = [];
    let finalKeyDirective: ConstDirectiveNode | undefined;
    const finalKey = this.finalKey;

    if (this.isEntity) {
      froidFields = [
        FroidSchema.createIdField(this.getTagDirectivesForIdField()),
      ];
      froidInterfaces = [implementsNodeInterface];
      finalKeyDirective = finalKey?.toDirective();
    }

    const fields = [...froidFields, ...this.getFinalFields(finalKey)];
    return {
      ...this.node,
      description: undefined,
      interfaces: froidInterfaces,
      directives: [...(finalKeyDirective ? [finalKeyDirective] : [])],
      fields,
    };
  }
}
