import {
  ConstDirectiveNode,
  DocumentNode,
  Kind,
  OperationDefinitionNode,
  SelectionNode,
  StringValueNode,
  parse,
} from 'graphql';
import {KeyField} from './KeyField';
import {ObjectTypeNode} from './types';
import assert from 'assert';
import {
  DirectiveName,
  KeyDirectiveArgument,
  TYPENAME_FIELD_NAME,
} from './constants';

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
      Key.parseKeyFields(parseableField)
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
    return this._fields.map((field) => field.toString()).join(' ');
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
   * @returns {DocumentNode} The key fields represented in AST
   */
  private static parseKeyFields(keyFields: string): DocumentNode {
    return parse(`{${keyFields}}`, {noLocation: true});
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
}
