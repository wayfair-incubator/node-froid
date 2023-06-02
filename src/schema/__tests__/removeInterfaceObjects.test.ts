import {testGql as gql} from '../../__tests__/helpers';
import {Kind, parse, print} from 'graphql';
import {removeInterfaceObjects} from '../removeInterfaceObjects';
import {ObjectTypeNode} from '../types';

describe('removeInterfaceObject', () => {
  it('removes ObjectTypeDefinitions with @interfaceObject', () => {
    const schema = gql`
      type Foo {
        fooId: String
      }

      type Media @key(fields: "authorId") @interfaceObject {
        authorId: String
        rating: String
      }
    `;

    const input = parse(schema).definitions as ObjectTypeNode[];

    const output = removeInterfaceObjects(input);

    const expectedOutput = gql`
      type Foo {
        fooId: String
      }
    `;

    expect(print({kind: Kind.DOCUMENT, definitions: output})).toEqual(
      print(parse(expectedOutput))
    );
  });

  it('removes ObjectTypeExtensions with @interfaceObject and removes the corresponding ObjectTypeDefinition', () => {
    const schema = gql`
      type Bar {
        barId: String
      }

      type Container @key(fields: "manufacturerId") {
        manufacturerId: String
      }

      extend type Container @interfaceObject {
        weight: Float
      }
    `;

    const input = parse(schema).definitions as ObjectTypeNode[];

    const output = removeInterfaceObjects(input);

    const expectedOutput = gql`
      type Bar {
        barId: String
      }
    `;

    expect(print({kind: Kind.DOCUMENT, definitions: output})).toEqual(
      print(parse(expectedOutput))
    );
  });

  it('removes Java-style ObjectTypeExtensions (ObjectTypeDefinitions with @extends) with @interfaceObject and removes the corresponding ObjectTypeDefinition', () => {
    const schema = gql`
      type Bar {
        barId: String
      }

      type Container @key(fields: "manufacturerId") {
        manufacturerId: String
      }

      type Container @interfaceObject @extends {
        weight: Float
      }
    `;

    const input = parse(schema).definitions as ObjectTypeNode[];

    const output = removeInterfaceObjects(input);

    const expectedOutput = gql`
      type Bar {
        barId: String
      }
    `;

    expect(print({kind: Kind.DOCUMENT, definitions: output})).toEqual(
      print(parse(expectedOutput))
    );
  });
});
