import {ListValueNode, SchemaExtensionNode, StringValueNode} from 'graphql';
import {createLinkSchemaExtension} from '../createLinkSchemaExtension';
import {DEFAULT_FEDERATION_LINK_IMPORTS} from '../constants';

const getImports = (schema: SchemaExtensionNode): string[] => {
  return (schema.directives
    ?.flatMap((directive) => {
      return directive.arguments?.flatMap((argument) => {
        if (argument.name.value !== 'import') {
          return;
        }
        return (argument.value as ListValueNode).values.flatMap(
          (value) => (value as StringValueNode).value
        );
      });
    })
    .filter(Boolean) || []) as string[];
};

describe('createLinkSchemaExtension()', () => {
  it('defaults to a known set of imports', () => {
    const result = createLinkSchemaExtension();
    expect(getImports(result)).toEqual(DEFAULT_FEDERATION_LINK_IMPORTS);
  });

  it('applies missing `@`s to imports', () => {
    const result = createLinkSchemaExtension(['apple', 'banana', '@carrot']);
    expect(getImports(result)).toEqual(['@apple', '@banana', '@carrot']);
  });

  it('throws an error if no imports are provided', () => {
    let errorMessage = '';
    try {
      createLinkSchemaExtension([]);
    } catch (error) {
      errorMessage = error.message;
    }
    expect(errorMessage).toEqual('At least one import must be provided.');
  });
});
