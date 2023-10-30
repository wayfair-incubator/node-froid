import {FieldNode} from 'graphql';
import {TYPENAME_FIELD_NAME} from './constants';

/**
 * Represents an object key's field and its child selections as a structured object.
 */
export class KeyField {
  /**
   * The name of the field.
   */
  public readonly name: string;
  /**
   * The child selections of the field.
   */
  private _selections: KeyField[] = [];

  /**
   * Creates a key field.
   *
   * @param {FieldNode} field - The field this key field will represent
   */
  constructor(field: FieldNode) {
    this.name = field.name.value;
    field.selectionSet?.selections?.forEach((selection) =>
      // Key selections can only contain Object Type fields
      this.addSelection(selection as FieldNode)
    );
  }

  /**
   * Add a selection to the key field's child selections.
   *
   * @param {FieldNode} selection - Selection field AST
   * @returns {void}
   */
  public addSelection(selection: FieldNode): void {
    if (
      selection.name.value === TYPENAME_FIELD_NAME ||
      this._selections.find((field) => field.name === selection.name.value)
    ) {
      return;
    }
    this._selections.push(new KeyField(selection));
  }

  /**
   * Merges another key field into this key field.
   *
   * @param {KeyField} keyField - The key field that will be merged with this key field.
   * @returns {void}
   */
  public merge(keyField: KeyField): void {
    keyField._selections.forEach((mergeSelection) => {
      const existingSelection = this._selections.find(
        (compareSelection) => compareSelection.name === mergeSelection.name
      );
      if (!existingSelection) {
        this._selections.push(mergeSelection);
        return;
      }
      existingSelection.merge(mergeSelection);
    });
  }

  /**
   * The key field's child selections.
   *
   * @returns {KeyField[]} The child selections
   */
  public get selections(): KeyField[] {
    return this._selections;
  }

  /**
   * Converts this key field and its child selections to a string.
   *
   * @returns {string} The key field as a string
   */
  public toString(): string {
    return [this.name, ...this.selectionsToString()].join(' ');
  }

  /**
   * The list of this key field's child selections, converted to strings.
   *
   * @returns {string[]} The list of child selections as strings
   */
  private selectionsToString(): string[] {
    if (!this._selections.length) {
      return [];
    }
    return [
      '{',
      TYPENAME_FIELD_NAME,
      ...this._selections.map((selection) => selection.toString()),
      '}',
    ];
  }
}
