import {stripIndent as gql} from 'common-tags';
import {sortDocumentAst} from '../sortDocumentAst';
import {parse, print} from 'graphql';

const sort = (schema: string): string =>
  print(sortDocumentAst(parse(schema, {noLocation: true})));

describe('sortDocumentAst()', () => {
  it('sorts document AST', () => {
    const schema = gql`
      type Zebra {
        stripesCount: Int!
        eyeColor: Color!
      }

      directive @caps(match: String, all: Boolean) on OBJECT | FIELD

      union Animals = Zebra | Ape

      enum Color {
        ORANGE
        BLUE
        MAGENTA
      }

      input SomeInput {
        someArgument: Boolean
        anotherArgument: Int!
      }

      extend schema @tag(name: "blue") @tag(name: "green")

      interface Food {
        flavor: String!
      }

      type Ape {
        name: String! @caps(match: "Bob", all: false)
        armLength: Float!
      }

      extend schema @tag(name: "red") @tag(name: "orange")

      scalar WingSpan
    `;

    expect(sort(schema)).toEqual(
      // prettier-ignore
      gql`
      extend schema @tag(name: "blue") @tag(name: "green")

      extend schema @tag(name: "red") @tag(name: "orange")

      union Animals = Ape | Zebra

      type Ape {
        armLength: Float!
        name: String! @caps(all: false, match: "Bob")
      }

      directive @caps(all: Boolean, match: String) on FIELD | OBJECT

      enum Color {
        BLUE
        MAGENTA
        ORANGE
      }

      interface Food {
        flavor: String!
      }

      input SomeInput {
        anotherArgument: Int!
        someArgument: Boolean
      }

      scalar WingSpan

      type Zebra {
        eyeColor: Color!
        stripesCount: Int!
      }
      `
    );
  });
});
