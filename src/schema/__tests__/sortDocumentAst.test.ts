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

      type Ape @key(fields: "name armLength") {
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

      type Ape @key(fields: "armLength name") {
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

  it('sorts id fields to the top of the list', () => {
    const schema = gql`
      type Ape {
        id: ID!
        name: String!
      }

      type Gorilla {
        name: String!
        id: ID!
      }
    `;

    expect(sort(schema)).toEqual(
      // prettier-ignore
      gql`
      type Ape {
        id: ID!
        name: String!
      }

      type Gorilla {
        id: ID!
        name: String!
      }
      `
    );
  });

  it('sorts applied directives alphabetically by name', () => {
    const schema = gql`
      type Ape {
        name: String! @inaccessible @caps
      }
    `;

    expect(sort(schema)).toEqual(
      // prettier-ignore
      gql`
      type Ape {
        name: String! @caps @inaccessible
      }
      `
    );
  });

  it('sorts applied directive arguments alphabetically by name', () => {
    const schema = gql`
      type Ape {
        name: String! @caps(match: "asdf", all: false)
      }
    `;

    expect(sort(schema)).toEqual(
      // prettier-ignore
      gql`
      type Ape {
        name: String! @caps(all: false, match: "asdf")
      }
      `
    );
  });

  it('sorts duplicate applied directives by their arguments', () => {
    const schema = gql`
      type Ape {
        name: String!
          @tag(name: 1)
          @tag(name: "avengers")
          @capitalize(all: true)
          @tag(name: "justice-league")
          @tag(name: {bob: "Barker"})
          @capitalize(match: "ASDF", all: false)
          @tag(size: "small")
          @capitalize(all: false)
      }
    `;

    expect(sort(schema)).toEqual(
      // prettier-ignore
      gql`
      type Ape {
        name: String! @capitalize(all: true) @capitalize(all: false) @capitalize(all: false, match: "ASDF") @tag(name: 1) @tag(name: "avengers") @tag(name: "justice-league") @tag(name: {bob: "Barker"}) @tag(size: "small")
      }
      `
    );
  });
});
