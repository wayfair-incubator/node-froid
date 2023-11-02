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
  public readonly typename: string;
  private _externallySelectedFields: string[] = [];

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
  }

  /**
   * All occurrences of the node across all subgraph schemas.
   *
   * @returns {ObjectTypeNode[]} The list of occurrences
   */
  public get occurrences(): ObjectTypeNode[] {
    return this.extensionAndDefinitionNodes.filter(
      (searchNode) => searchNode.name.value === this.node.name.value
    );
  }

  /**
   * All keys applied to all occurrences of the node.
   *
   * @returns {Key[]} The list of keys
   */
  public get keys(): Key[] {
    return this.occurrences.flatMap(
      (occurrence) =>
        occurrence.directives
          ?.filter((directive) => directive.name.value === DirectiveName.Key)
          .map((key) => new Key(this.node.name.value, key)) || []
    );
  }

  /**
   * All the child fields from all occurrences of the node.
   *
   * @returns {FieldDefinitionNode[]} The list of fields
   */
  public get allFields(): FieldDefinitionNode[] {
    const fields: Record<string, FieldDefinitionNode | null> = {};
    this.occurrences.forEach((occurrence) =>
      occurrence?.fields?.forEach((field) => {
        fields[field.name.value] = null;
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
    return Object.values(fields).filter(Boolean) as FieldDefinitionNode[];
  }

  private addQualifiedField(
    field: FieldDefinitionNode,
    fields: Record<string, FieldDefinitionNode | null>,
    applyNodeQualifier = true
  ): FieldDefinitionNode | undefined {
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
   * The names of all the fields that appear the keys of the node.
   *
   * @returns {string[]} The list of key field names
   */
  public get allKeyFieldsList(): string[] {
    return [...new Set(this.keys.flatMap((key) => key.fieldsList))];
  }

  /**
   * All the fields that appear in the keys of the node.
   *
   * @returns {FieldDefinitionNode[]} The list of key fields
   */
  public get allKeyFields(): FieldDefinitionNode[] {
    return this.allFields.filter((field) =>
      this.allKeyFieldsList.includes(field.name.value)
    );
  }

  /**
   * The key selected for use in the FROID schema.
   *
   * @returns {Key|undefined} The selected key
   */
  get selectedKey(): Key | undefined {
    return this.keySorter(this.keys, this.node)[0];
  }

  /**
   * The list of child objects that appear in the selected key.
   * Each record is made up of the field referencing a child object and the object it
   * is referencing.
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
   *
   * @returns {Record<string, string>} The list of fields that reference a child object and the object the field is referencing
   */
  public get childObjectsInSelectedKey(): Record<string, string> {
    const children: Record<string, string> = {};
    this.allFields.forEach((field) => {
      if (!this?.selectedKey?.fieldsList.includes(field.name.value)) {
        return;
      }
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
   *
   * @returns {string[]} The list of field names
   */
  public get directlySelectedFields(): string[] {
    return this.allFields
      .filter((field) =>
        this.selectedKey?.fieldsList.includes(field.name.value)
      )
      .map((field) => field.name.value);
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
    return this.allFields.filter(
      (field) =>
        this.directlySelectedFields.includes(field.name.value) ||
        this.externallySelectedFields.includes(field.name.value)
    );
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
   * The node's key after all key fields used by other entities are added.
   *
   * @returns {Key|undefined} The final key. Undefined if the node is not an entity.
   */
  public get finalKey(): Key | undefined {
    return this.getFinalKey();
  }

  /**
   * Generated the final key for the node based on all descendant types and their keys (if they have keys).
   *
   * @param {number} depth - The current nesting depth of the key. Defaults to 0.
   * @param {string[]} ancestors - The type name of ancestors that have been traversed up to the current key depth.
   * @returns {Key|undefined} The final key or undefined if the node has no key.
   */
  private getFinalKey(depth = 0, ancestors: string[] = []): Key | undefined {
    if (!this.selectedKey) {
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
    const mergedKey = new Key(
      this.node.name.value,
      this.selectedKey.toString()
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
   * Adds the names of fields used by other entities to the list of externally selected fields.
   *
   * @param {KeyField[]} fields - The key fields to add to the list
   * @returns {void}
   */
  public addExternallySelectedFields(fields: KeyField[]): void {
    this._externallySelectedFields.push(...fields.map((field) => field.name));
  }
}
