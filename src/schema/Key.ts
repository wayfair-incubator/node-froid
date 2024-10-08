import {
  ConstDirectiveNode,
  DocumentNode,
  FieldNode,
  Kind,
  OperationDefinitionNode,
  SelectionNode,
  SelectionSetNode,
  StringValueNode,
  parse,
  print,
} from 'graphql';
import {KeyField} from './KeyField';
import {ObjectTypeNode} from './types';
import assert from 'assert';
import {
  DirectiveName,
  KeyDirectiveArgument,
  TYPENAME_FIELD_NAME,
} from './constants';

const WRAPPING_CURLY_BRACES_REGEXP = /^\{(.*)\}$/s;
const INDENTED_MULTILINE_REGEXP = /(\n|\s)+/g;

/**
 * Represents an object key directive as a structures object.
 */
export class Key {
  /**
   * The key's fields.
   */
  private _fields: KeyField[] = [];

  /**
   * Creates a key from the key fields of an object type.
   *
   * @param {string} typename - The name of the object type the key is associated with
   * @param {string} keyFields - The fields string of the object's key directive
   */
  constructor(typename: string, keyFields: string);
  /**
   * Creates a key from the key directive AST of an object type.
   *
   * @param {string} typename - The name of the object type the key is associated with
   * @param {ConstDirectiveNode} keyDirective - The object's key directive.
   */
  constructor(typename: string, keyDirective: ConstDirectiveNode);
  /**
   * Creates a key from an object type, key directive AST, or key directive fields string.
   *
   * @param {string|ObjectTypeNode} typename - An object type or its name
   * @param {string|ConstDirectiveNode} keyFields - The object's key directive or fields
   */
  constructor(
    public readonly typename: string,
    keyFields: string | ConstDirectiveNode
  ) {
    this.parseToFields(keyFields);
    return;
  }

  /**
   * Parses a field string/directive AST to key fields.
   *
   * @param {string | ConstDirectiveNode} fieldsOrDirective - The fields string/directive AST to parse
   * @returns {void}
   */
  private parseToFields(fieldsOrDirective: string | ConstDirectiveNode): void {
    let parseableField = fieldsOrDirective;
    if (typeof parseableField !== 'string') {
      parseableField = Key.getKeyDirectiveFields(parseableField);
    }
    (
      Key.parseKeyFields(this.typename, parseableField)
        .definitions[0] as OperationDefinitionNode
    )?.selectionSet?.selections?.forEach((selection) =>
      this.addSelection(selection)
    );
  }

  /**
   * Adds a key field selection to the key's fields.
   *
   * @param {SelectionNode} selection - A key field selection from AST
   * @returns {void}
   */
  public addSelection(selection: SelectionNode): void {
    assert(
      selection.kind === Kind.FIELD,
      `Encountered @key "fields" selection of kind "${selection.kind}" on type "${this.typename}". @key selections must be fields.`
    );
    if (
      selection.name.value === TYPENAME_FIELD_NAME ||
      this._fields.find((field) => field.name === selection.name.value)
    ) {
      return;
    }
    this._fields.push(new KeyField(selection));
  }

  /**
   * Merges another key with this key.
   *
   * @param {Key} key - The key that will be merged into this key.
   * @returns {void}
   */
  public merge(key: Key): void {
    key._fields.forEach((mergeField) => {
      const existingField = this._fields.find(
        (compareField) => compareField.name === mergeField.name
      );
      if (!existingField) {
        this._fields.push(mergeField);
        return;
      }
      existingField.merge(mergeField);
    });
  }

  /**
   * The names of the first level of fields in a key.
   *
   * @returns {string[]} The key field names
   */
  public get fieldsList(): string[] {
    return this._fields.map((field) => field.name);
  }

  /**
   * The list of fields in the key.
   *
   * @returns {KeyField[]} The list of key fields.
   */
  public get fields(): KeyField[] {
    return this._fields;
  }

  /**
   * How many object levels deep the key fields go.
   *
   * Examples:
   * 'foo' => Depth 0
   * 'bar { barId }' => Depth 1
   * 'bar { barId } baz { bazId }' => Depth 1
   * 'baz { bazId qux { quxId } }' => Depth 2
   * 'bar { barId } baz { bazId qux { quxId } }' => Depth 2
   *
   * @returns {number} The key fields depth.
   */
  public get depth(): number {
    return this.calculateDepth(this._fields);
  }

  /**
   * Recursively calculates the key depth.
   *
   * @param {KeyField[]} keyFields - The key fields at the current depth level. Defaults to zero (0).
   * @param {number} currentDepth - The current depth level
   * @returns {number} The depth level as calculated
   */
  private calculateDepth(keyFields: KeyField[], currentDepth = 0): number {
    const allSelections = keyFields.flatMap((keyField) => keyField.selections);
    if (allSelections.length) {
      currentDepth += 1;
      currentDepth = this.calculateDepth(allSelections, currentDepth);
    }
    return currentDepth;
  }

  /**
   * Converts the key to a fields string for use in a schema key directive.
   *
   * @returns {string} The fields string
   */
  public toString(): string {
    return Key.getSortedSelectionSetFields(
      this.typename,
      this._fields.map((field) => field.toString()).join(' ')
    );
  }

  /**
   * Converts the key to schema directive AST.
   *
   * @returns {ConstDirectiveNode} The schema directive AST
   */
  public toDirective(): ConstDirectiveNode {
    return {
      kind: Kind.DIRECTIVE,
      name: {
        kind: Kind.NAME,
        value: DirectiveName.Key,
      },
      arguments: [
        {
          kind: Kind.ARGUMENT,
          name: {
            kind: Kind.NAME,
            value: KeyDirectiveArgument.Fields,
          },
          value: {
            kind: Kind.STRING,
            value: this.toString(),
          },
        },
      ],
    };
  }

  /**
   * Parses a key fields string into AST.
   *
   * @param {string} keyFields - The key fields string
   * @param {string} typename - The typename of the node the directive belongs to
   * @returns {DocumentNode} The key fields represented in AST
   */
  private static parseKeyFields(
    typename: string,
    keyFields: string
  ): DocumentNode {
    try {
      return parse(`{${keyFields}}`, {noLocation: true});
    } catch (error) {
      throw new Error(
        `Failed to parse key fields "${keyFields}" for type "${typename}" due to error: ${
          (error as Error).message
        }`
      );
    }
  }

  /**
   * Gets the fields string from a key directive's AST
   *
   * @param {ConstDirectiveNode} key - The key directive AST
   * @returns {string} The key directive's fields
   */
  private static getKeyDirectiveFields(key: ConstDirectiveNode): string {
    return (
      key.arguments?.find(
        (arg) => arg.name.value === KeyDirectiveArgument.Fields
      )?.value as StringValueNode
    ).value;
  }

  /**
   * Sorts the selection set fields.
   *
   * @param {string} fields - The selection set fields.
   * @param {string} typename - The typename of the node the directive belongs to
   * @returns {string} The sorted selection set fields.
   */
  public static getSortedSelectionSetFields(
    typename: string,
    fields: string
  ): string {
    const selections = Key.sortSelectionSetByNameAscending(
      (
        Key.parseKeyFields(typename, fields)
          .definitions[0] as OperationDefinitionNode
      ).selectionSet
    );
    return Key.formatSelectionSetFields(print(selections));
  }

  /**
   * Sorts the selection set by name, ascending.
   *
   * @param {SelectionSetNode | SelectionNode} node - The selection set node.
   * @returns {SelectionSetNode | SelectionNode} The sorted selection set.
   */
  protected static sortSelectionSetByNameAscending<
    T extends SelectionSetNode | SelectionNode
  >(
    node: T
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): T {
    if (node.kind === Kind.SELECTION_SET) {
      const selections = node.selections
        .map<FieldNode>((selection) => {
          return this.sortSelectionSetByNameAscending(selection) as FieldNode;
        })
        .sort(Key.sortASTByNameAscending);
      return {
        ...node,
        selections,
      } as T;
    }
    if (node.kind === Kind.FIELD) {
      if (node.selectionSet) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const selections = (node.selectionSet.selections as any)
          .map((selection) => {
            return Key.sortSelectionSetByNameAscending(selection);
          })
          .sort(Key.sortASTByNameAscending);
        return {
          ...node,
          selectionSet: {
            ...node.selectionSet,
            selections,
          },
        };
      }
      return node;
    }
    return node;
  }

  /**
   * Sorts AST by name, ascending.
   *
   * @param {FieldNode} a - The first node to be compared
   * @param {FieldNode} b - The second node to be compared
   * @returns {number} The ordinal adjustment to be made
   */
  protected static sortASTByNameAscending(a: FieldNode, b: FieldNode): number {
    return a.name.value.localeCompare(b.name.value);
  }

  /**
   * Formats a selection set string for use in a directive.
   *
   * @param {string} selectionSetString - The selection set string.
   * @returns {string} The formatted selection set string.
   */
  protected static formatSelectionSetFields(
    selectionSetString: string
  ): string {
    return selectionSetString
      .replace(WRAPPING_CURLY_BRACES_REGEXP, '$1')
      .replace(INDENTED_MULTILINE_REGEXP, ' ')
      .trim();
  }
}
