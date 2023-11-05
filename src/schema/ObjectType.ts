import {FieldDefinitionNode, ObjectTypeDefinitionNode} from 'graphql';
import {Key} from './Key';
import {DirectiveName} from './constants';
import {ObjectTypeNode} from './types';
import {FroidSchema, KeySorter, NodeQualifier} from './FroidSchema';
import {KeyField} from './KeyField';

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
   * Fields belonging to this object type that were selected for
   * use in the keys of other object types.
   */
  private _externallySelectedFields: string[] = [];
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
  }

  /**
   * Get all occurrences of the node across all subgraph schemas.
   *
   * @returns {ObjectTypeNode[]} The list of occurrences
   */
  private getOccurrences(): ObjectTypeNode[] {
    return this.extensionAndDefinitionNodes.filter(
      (searchNode) => searchNode.name.value === this.node.name.value
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
          .map((key) => new Key(this.node.name.value, key)) || []
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
   * The list of selected fields that appear in any of the node's keys.
   *
   * @returns {FieldDefinitionNode[]} The list of key fields
   */
  public get selectedKeyFields(): FieldDefinitionNode[] {
    return this.selectedFields.filter((field) =>
      this.allKeyFieldsList.includes(field.name.value)
    );
  }

  /**
   * The list of selected fields that do not appear in any of the node's keys.
   *
   * @returns {FieldDefinitionNode[]} The list of non-key fields
   */
  public get selectedNonKeyFields(): FieldDefinitionNode[] {
    return this.selectedFields.filter(
      (field) => !this.allKeyFieldsList.includes(field.name.value)
    );
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

    if (!this.selectedKeyMatchesExternalUse()) {
      this.selectedExternallyUsedKey();
    }

    const mergedKey = new Key(
      this.node.name.value,
      this._selectedKey.toString()
    );
    const selectedKeyFields = [
      ...this.selectedKeyFields.map((field) => field.name.value),
    ].join(' ');

    if (selectedKeyFields) {
      const keyFromSelections = new Key(
        this.node.name.value,
        selectedKeyFields
      );
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
          this.node.name.value,
          `${dependentField} { ${dependencyFinalKey.toString()} }`
        );
        mergedKey.merge(keyToMerge);
      }
    );
    return mergedKey;
  }

  /**
   * Determine whether or not the selected key matches the use of the entity in other
   * entity complex keys.
   *
   * - If the entity has no key, this will return true.
   * - If there are no uses of the entity in another entity complex key, this will return true.
   * - Otherwise, they key will be compared to use in other entity keys and the validity
   *   determination will be returned
   *
   * @returns {boolean} Whether or not the selected key matches external use
   */
  private selectedKeyMatchesExternalUse(): boolean {
    return Boolean(
      !this._externallySelectedFields.length ||
        !this._selectedKey ||
        this._selectedKey.fieldsList.some((field) => {
          return this._externallySelectedFields.includes(field);
        })
    );
  }

  /**
   * Assigns an externally used key as the selected key.
   */
  private selectedExternallyUsedKey() {
    const newSelectedKey = this.keys.find((key) =>
      key.fieldsList.some((field) =>
        this._externallySelectedFields.includes(field)
      )
    );
    if (newSelectedKey) {
      // Make the new key official
      this._selectedKey = newSelectedKey;
      // Update the child objects in the key
      this.childObjectsInSelectedKey = this.getChildObjectsInSelectedKey();
      // Update the directly selected fields
      this.directlySelectedFields = this.getDirectlySelectedFields();
    }
  }

  /**
   * Adds the names of fields used by other entities to the list of externally selected fields.
   *
   * @param {KeyField[]} fields - The key fields to add to the list
   * @returns {void}
   */
  public addExternallySelectedFields(fields: KeyField[]): void {
    const additionalFields = fields.flatMap((field) => {
      const usedKeys = this.keys
        .filter((key) => key.fieldsList.includes(field.name))
        .flatMap((key) => key.fieldsList);
      return [field.name, ...usedKeys];
    });
    this._externallySelectedFields = [
      ...new Set([...this._externallySelectedFields, ...additionalFields]),
    ];
  }
}
