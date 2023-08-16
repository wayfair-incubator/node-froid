import {generateFroidSchema} from '../generateFroidSchema';
import {print, Kind, DefinitionNode} from 'graphql';
import {stripIndent as gql} from 'common-tags';
import {ObjectTypeNode} from '../types';

function generateSchema({
  subgraphs,
  froidSubgraphName,
  contractTags = [],
  typeExceptions = [],
  federationVersion = 'v1',
  nodeQualifier,
  keySorter,
}: {
  subgraphs: Map<string, string>;
  froidSubgraphName: string;
  contractTags?: string[];
  typeExceptions?: string[];
  federationVersion?: string;
  nodeQualifier?: (
    node: DefinitionNode,
    objectTypes: Record<string, ObjectTypeNode>
  ) => boolean;
  keySorter?: (keys: string[], node: ObjectTypeNode) => string[];
}) {
  return print(
    generateFroidSchema(subgraphs, froidSubgraphName, {
      contractTags,
      federationVersion,
      typeExceptions,
      nodeQualifier,
      keySorter,
    })
  );
}

describe('generateFroidSchema for federation v1', () => {
  it('throws an error if a custom 1.x version is provided', () => {
    const productSchema = gql`
      type Product @key(fields: "upc") {
        upc: String!
        name: String
        price: Int
        weight: Int
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    let errorMessage = '';
    try {
      generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        federationVersion: 'v1.5',
      });
    } catch (err) {
      errorMessage = err.message;
    }

    expect(errorMessage).toMatch(
      `Federation version must be either 'v1' or a valid 'v2.x' version`
    );
  });

  it('ignores @key(fields: "id") directives', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product @key(fields: "upc") {
        upc: String!
        name: String
        price: Int
        weight: Int
      }

      type Brand @key(fields: "id") {
        id: ID!
        name: String
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Product implements Node @key(fields: "upc") {
          id: ID!
          upc: String! @external
        }
      `
    );
  });

  it('does not propagate miscellaneous directives to the generated id field', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product @key(fields: "upc") {
        upc: String! @someDirective
        weight: Int
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Product implements Node @key(fields: "upc") {
          id: ID!
          upc: String! @external
        }
      `
    );
  });

  it('generates valid schema for entity with complex (multi-field) keys', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product @key(fields: "upc sku") {
        upc: String!
        sku: String!
        name: String
        price: Int
        weight: Int
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Product implements Node @key(fields: "upc sku") {
          id: ID!
          upc: String! @external
          sku: String! @external
        }
      `
    );
  });

  it('generates valid schema using the first non-nested complex (multi-field) keys', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product
        @key(fields: "upc sku brand { brandId store { storeId } }")
        @key(fields: "upc sku")
        @key(fields: "upc")
        @key(fields: "sku brand { brandId store { storeId } }") {
        upc: String!
        sku: String!
        name: String
        brand: [Brand!]!
        price: Int
        weight: Int
      }

      type Brand {
        brandId: Int!
        store: Store
      }

      type Store {
        storeId: Int!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Product implements Node @key(fields: "upc sku") {
          id: ID!
          upc: String! @external
          sku: String! @external
        }
      `
    );
  });

  it('generates valid schema for entity with nested complex (multi-field) keys', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product @key(fields: "upc sku brand { brandId store { storeId } }") {
        upc: String!
        sku: String!
        name: String
        brand: [Brand!]!
        price: Int
        weight: Int
      }

      type Brand {
        brandId: Int!
        store: Store
      }

      type Store {
        storeId: Int!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Product implements Node @key(fields: "upc sku brand { brandId store { storeId } }") {
          id: ID!
          upc: String! @external
          sku: String! @external
          brand: [Brand!]! @external
        }

        type Brand {
          brandId: Int!
          store: Store
        }

        type Store {
          storeId: Int!
        }
      `
    );
  });

  it('uses a custom key sorter to prefer complex keys', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product
        @key(fields: "upc sku")
        @key(fields: "upc sku brand { brandId store { storeId } }")
        @key(fields: "upc")
        @key(fields: "sku brand { brandId store { storeId } }") {
        upc: String!
        sku: String!
        name: String
        brand: [Brand!]!
        price: Int
        weight: Int
      }

      type Brand {
        brandId: Int!
        store: Store
      }

      type Store {
        storeId: Int!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      keySorter: (keys) => {
        return keys.sort((a, b) => b.indexOf('{') - a.indexOf('{'));
      },
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Product implements Node @key(fields: "upc sku brand { brandId store { storeId } }") {
          id: ID!
          upc: String! @external
          sku: String! @external
          brand: [Brand!]! @external
        }

        type Brand {
          brandId: Int!
          store: Store
        }

        type Store {
          storeId: Int!
        }
      `
    );
  });

  it('uses a custom key sorter to prefer the first ordinal key', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product
        @key(fields: "upc")
        @key(fields: "upc sku brand { brandId store { storeId } }")
        @key(fields: "upc sku")
        @key(fields: "sku brand { brandId store { storeId } }") {
        upc: String!
        sku: String!
        name: String
        brand: [Brand!]!
        price: Int
        weight: Int
      }

      type Brand {
        brandId: Int!
        store: Store
      }

      type Store {
        storeId: Int!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      keySorter: (keys) => keys,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Product implements Node @key(fields: "upc") {
          id: ID!
          upc: String! @external
        }
      `
    );
  });

  it('uses a custom key sorter to prefer complex keys only when the node is named "Book"', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product
        @key(fields: "upc sku")
        @key(fields: "upc sku brand { brandId }") {
        upc: String!
        sku: String!
        name: String
        brand: [Brand!]!
        price: Int
        weight: Int
      }

      type Brand {
        brandId: Int!
        store: Store
      }

      type Book
        @key(fields: "bookId")
        @key(fields: "bookId author { authorId }") {
        bookId: String!
        author: Author!
      }

      type Author {
        authorId: String!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      keySorter: (keys, node) => {
        if (node.name.value === 'Book') {
          return keys.sort((a, b) => b.indexOf('{') - a.indexOf('{'));
        }
        return keys;
      },
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Product implements Node @key(fields: "upc sku") {
          id: ID!
          upc: String! @external
          sku: String! @external
        }

        extend type Book implements Node @key(fields: "bookId author { authorId }") {
          id: ID!
          bookId: String! @external
          author: Author! @external
        }

        type Author {
          authorId: String!
        }
      `
    );
  });

  it('generates the correct entities across multiple subgraph services', () => {
    const productSchema = gql`
      type Query {
        user(id: String): User
      }

      type User @key(fields: "userId") {
        userId: String!
        name: String!
      }
    `;

    const todoSchema = gql`
      extend type User @key(fields: "userId") {
        userId: String! @external
        todos(
          status: String = "any"
          after: String
          first: Int
          before: String
          last: Int
        ): TodoConnection
        totalCount: Int!
        completedCount: Int!
      }

      type TodoConnection {
        pageInfo: PageInfo!
        edges: [TodoEdge]
      }

      type PageInfo {
        hasNextPage: Boolean!
        hasPreviousPage: Boolean!
        startCursor: String
        endCursor: String
      }

      type TodoEdge {
        node: Todo
        cursor: String!
      }

      type Todo @key(fields: "todoId") {
        todoId: Int!
        text: String!
        complete: Boolean!
      }

      type Mutation {
        addTodo(input: AddTodoInput!): AddTodoPayload
      }

      input AddTodoInput {
        text: String!
        userId: ID!
        clientMutationId: String
      }

      type AddTodoPayload {
        todoEdge: TodoEdge!
        user: User!
        clientMutationId: String
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);
    subgraphs.set('todo-subgraph', todoSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type User implements Node @key(fields: "userId") {
          id: ID!
          userId: String! @external
        }

        extend type Todo implements Node @key(fields: "todoId") {
          id: ID!
          todoId: Int! @external
        }
      `
    );
  });

  it('generates the correct entities across multiple subgraph services when external entities are used as complex keys', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product @key(fields: "upc sku brand { brandId }") {
        upc: String!
        sku: String!
        name: String
        brand: [Brand!]!
        price: Int
        weight: Int
      }

      type Brand @key(fields: "brandId", resolvable: false) {
        brandId: Int!
      }
    `;

    const brandSchema = gql`
      type Brand @key(fields: "brandId") {
        brandId: Int!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('brand-subgraph', brandSchema);
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Brand implements Node @key(fields: "brandId") {
          id: ID!
          brandId: Int! @external
        }

        extend type Product implements Node @key(fields: "upc sku brand { brandId }") {
          id: ID!
          upc: String! @external
          sku: String! @external
          brand: [Brand!]! @external
        }
      `
    );
  });

  it('ignores types that are provided as exceptions to generation', () => {
    const userSchema = gql`
      type Query {
        user(id: String): User
      }

      type User @key(fields: "userId") {
        userId: String!
        name: String!
      }
    `;
    const todoSchema = gql`
      type Todo @key(fields: "todoId") {
        todoId: Int!
        text: String!
        complete: Boolean!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('user-subgraph', userSchema);
    subgraphs.set('todo-subgraph', todoSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: [],
      typeExceptions: ['Todo'],
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type User implements Node @key(fields: "userId") {
          id: ID!
          userId: String! @external
        }
      `
    );
  });

  it('ignores types based on a custom qualifier function', () => {
    const userSchema = gql`
      type Query {
        user(id: String): User
      }

      type User @key(fields: "userId") {
        userId: String!
        name: String!
      }

      extend type Todo @key(fields: "oldTodoKey") {
        oldTodoKey: String! @external
      }
    `;

    const todoSchema = gql`
      type Todo @key(fields: "todoId") @key(fields: "oldTodoKey") {
        todoId: Int!
        oldTodoKey: String!
        text: String!
        complete: Boolean!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('todo-subgraph', todoSchema);
    subgraphs.set('user-subgraph', userSchema);

    const nodeQualifier = (node) => node.kind === Kind.OBJECT_TYPE_DEFINITION;

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: [],
      typeExceptions: [],
      nodeQualifier,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type Todo implements Node @key(fields: "todoId") {
          id: ID!
          todoId: Int! @external
        }

        extend type User implements Node @key(fields: "userId") {
          id: ID!
          userId: String! @external
        }
      `
    );
  });

  it('ignores the existing relay subgraph when generating types', () => {
    const userSchema = gql`
      type Query {
        user(id: String): User
      }

      type User @key(fields: "userId") {
        userId: String!
        name: String!
      }
    `;
    const todoSchema = gql`
      type Todo @key(fields: "todoId") {
        todoId: Int!
        text: String!
        complete: Boolean!
      }
    `;
    const relaySchema = gql`
      directive @tag(
        name: String!
      ) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      type Query {
        node(id: ID!): Node
      }

      interface Node {
        id: ID!
      }

      extend type User implements Node @key(fields: "userId") {
        id: ID!
        userId: String! @external
      }

      extend type Todo implements Node @key(fields: "todoId") {
        id: ID!
        todoId: Int! @external
      }

      extend type AnotherType implements Node @key(fields: "someId") {
        id: ID!
        someId: Int! @external
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('user-subgraph', userSchema);
    subgraphs.set('todo-subgraph', todoSchema);
    subgraphs.set('relay-subgraph', relaySchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type User implements Node @key(fields: "userId") {
          id: ID!
          userId: String! @external
        }

        extend type Todo implements Node @key(fields: "todoId") {
          id: ID!
          todoId: Int! @external
        }
      `
    );
  });

  it('generates custom scalar definitions when they are used on a type definition in the schema', () => {
    const userSchema = gql`
      scalar UsedCustomScalar1
      scalar UsedCustomScalar2
      scalar UnusedCustomScalar

      type Query {
        user(id: String): User
      }

      type User @key(fields: "userId customField1 customField2") {
        userId: String!
        name: String!
        customField1: UsedCustomScalar1
        customField2: [UsedCustomScalar2!]!
        unusedField: UnusedCustomScalar
      }
    `;
    const todoSchema = gql`
      scalar UsedCustomScalar1

      type Todo @key(fields: "todoId customField") {
        todoId: Int!
        text: String!
        complete: Boolean!
        customField: UsedCustomScalar1
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('user-subgraph', userSchema);
    subgraphs.set('todo-subgraph', todoSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        scalar UsedCustomScalar1

        scalar UsedCustomScalar2

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        extend type User implements Node @key(fields: "userId customField1 customField2") {
          id: ID!
          userId: String! @external
          customField1: UsedCustomScalar1 @external
          customField2: [UsedCustomScalar2!]! @external
        }

        extend type Todo implements Node @key(fields: "todoId customField") {
          id: ID!
          todoId: Int! @external
          customField: UsedCustomScalar1 @external
        }
      `
    );
  });

  describe('when using contacts with @tag', () => {
    it('propogates valid tags to all core relay object identification types', () => {
      const productSchema = gql`
        type Query {
          topProducts(first: Int = 5): [Product]
        }

        type Product @key(fields: "upc") {
          upc: String!
          name: String
          price: Int
          weight: Int
        }
      `;
      const subgraphs = new Map();
      subgraphs.set('product-subgraph', productSchema);

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'supplier'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
          directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

          type Query {
            node(id: ID!): Node @tag(name: "storefront") @tag(name: "supplier")
          }

          interface Node @tag(name: "storefront") @tag(name: "supplier") {
            id: ID!
          }

          extend type Product implements Node @key(fields: "upc") {
            id: ID!
            upc: String! @external
          }
        `
      );
    });

    it('uses the first non-id key directive despite contract tags', () => {
      const productSchema = gql`
        type Query {
          topProducts(first: Int = 5): [Product]
        }

        type Product @key(fields: "upc") @key(fields: "name") {
          upc: String! @inaccessible
          name: String @tag(name: "storefront")
          price: Int
          weight: Int
        }
      `;
      const subgraphs = new Map();
      subgraphs.set('product-subgraph', productSchema);

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'supplier'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
          directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

          type Query {
            node(id: ID!): Node @tag(name: "storefront") @tag(name: "supplier")
          }

          interface Node @tag(name: "storefront") @tag(name: "supplier") {
            id: ID!
          }

          extend type Product implements Node @key(fields: "upc") {
            id: ID! @tag(name: "storefront")
            upc: String! @external
          }
        `
      );
    });

    it('propogates tags to the id field based on tags of sibling fields across subgraphs', () => {
      const productSchema = gql`
        type Query {
          user(id: String): User
        }

        type Product @key(fields: "upc") {
          internalUpc: String @tag(name: "internal")
          upc: String! @tag(name: "storefront") @tag(name: "internal")
          name: String @tag(name: "storefront") @tag(name: "internal")
          price: Int @tag(name: "storefront") @tag(name: "internal")
          weight: Int @tag(name: "storefront")
        }

        type Brand @key(fields: "brandId") {
          brandId: Int! @tag(name: "storefront") @tag(name: "internal")
          name: String @tag(name: "storefront") @tag(name: "internal")
        }

        type StorefrontUser @key(fields: "userId") {
          userId: String! @tag(name: "storefront") @tag(name: "internal")
          name: String! @tag(name: "storefront")
        }

        type InternalUser @key(fields: "userId") {
          userId: String! @tag(name: "internal")
          name: String! @tag(name: "internal")
        }
      `;

      const todoSchema = gql`
        extend type StorefrontUser @key(fields: "userId") {
          userId: String! @external
          todos: [Todo!]! @tag(name: "internal")
        }

        type Todo @key(fields: "todoId") {
          todoId: Int! @tag(name: "internal")
          assignedTo: InternalUser! @tag(name: "internal")
          title: String! @tag(name: "internal")
        }
      `;
      const subgraphs = new Map();
      subgraphs.set('product-subgraph', productSchema);
      subgraphs.set('todo-subgraph', todoSchema);

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'supplier'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
          directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

          type Query {
            node(id: ID!): Node @tag(name: "storefront") @tag(name: "supplier")
          }

          interface Node @tag(name: "storefront") @tag(name: "supplier") {
            id: ID!
          }

          extend type Product implements Node @key(fields: "upc") {
            id: ID! @tag(name: "internal") @tag(name: "storefront")
            upc: String! @external
          }

          extend type Brand implements Node @key(fields: "brandId") {
            id: ID! @tag(name: "internal") @tag(name: "storefront")
            brandId: Int! @external
          }

          extend type StorefrontUser implements Node @key(fields: "userId") {
            id: ID! @tag(name: "internal") @tag(name: "storefront")
            userId: String! @external
          }

          extend type InternalUser implements Node @key(fields: "userId") {
            id: ID! @tag(name: "internal")
            userId: String! @external
          }

          extend type Todo implements Node @key(fields: "todoId") {
            id: ID! @tag(name: "internal")
            todoId: Int! @external
          }
        `
      );
    });

    it('generates custom return type definitions when they are used on a type definition in the schema', () => {
      const userSchema = gql`
        scalar UsedCustomScalar1 @tag(name: "storefront")
        scalar UsedCustomScalar2 @tag(name: "internal")
        scalar UnusedCustomScalar

        enum UsedEnum {
          VALUE_ONE
          VALUE_TWO @customDirective
        }

        type Query {
          user(id: String): User
        }

        type User @key(fields: "userId customField1 customField2 customEnum") {
          userId: String!
          name: String!
          customField1: UsedCustomScalar1
          customField2: [UsedCustomScalar2!]!
          customEnum: UsedEnum
          unusedField: UnusedCustomScalar
        }
      `;
      const todoSchema = gql`
        scalar UsedCustomScalar1 @tag(name: "internal")

        type Todo @key(fields: "todoId customField") {
          todoId: Int!
          text: String!
          complete: Boolean!
          customField: UsedCustomScalar1
        }
      `;
      const subgraphs = new Map();
      subgraphs.set('user-subgraph', userSchema);
      subgraphs.set('todo-subgraph', todoSchema);

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'internal'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        scalar UsedCustomScalar1

        scalar UsedCustomScalar2

        enum UsedEnum {
          VALUE_ONE
          VALUE_TWO
        }

        type Query {
          node(id: ID!): Node @tag(name: "internal") @tag(name: "storefront")
        }

        interface Node @tag(name: "internal") @tag(name: "storefront") {
          id: ID!
        }

        extend type User implements Node @key(fields: "userId customField1 customField2 customEnum") {
          id: ID!
          userId: String! @external
          customField1: UsedCustomScalar1 @external
          customField2: [UsedCustomScalar2!]! @external
          customEnum: UsedEnum @external
        }

        extend type Todo implements Node @key(fields: "todoId customField") {
          id: ID!
          todoId: Int! @external
          customField: UsedCustomScalar1 @external
        }
      `
      );
    });
  });

  describe('when generating schema for complex keys', () => {
    it('finds the complete schema cross-subgraph', () => {
      const magazineSchema = gql`
        type Magazine
          @key(fields: "magazineId publisher { address { country } }") {
          magazineId: String!
          publisher: Publisher!
        }

        type Publisher {
          address: Address!
        }

        type Address {
          country: String!
        }
      `;

      const bookSchema = gql`
        type Book
          @key(fields: "bookId author { fullName address { postalCode } }") {
          bookId: String!
          title: String!
          author: Author!
        }

        extend type Author @key(fields: "authorId") {
          authorId: Int! @external
          fullName: String! @external
          address: Address! @external
        }

        type Address {
          postalCode: String!
          country: String!
        }
      `;

      const authorSchema = gql`
        type Author @key(fields: "authorId") {
          authorId: Int!
          fullName: String!
          address: Address!
        }

        type Address {
          postalCode: String!
          country: String!
        }
      `;

      const subgraphs = new Map();
      subgraphs.set('magazine-subgraph', magazineSchema);
      subgraphs.set('book-subgraph', bookSchema);
      subgraphs.set('author-subgraph', authorSchema);

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'internal'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        type Query {
          node(id: ID!): Node @tag(name: "internal") @tag(name: "storefront")
        }

        interface Node @tag(name: "internal") @tag(name: "storefront") {
          id: ID!
        }

        extend type Magazine implements Node @key(fields: "magazineId publisher { address { country } }") {
          id: ID!
          magazineId: String! @external
          publisher: Publisher! @external
        }

        type Publisher {
          address: Address!
        }

        type Address {
          country: String!
          postalCode: String!
        }

        extend type Book implements Node @key(fields: "bookId author { fullName address { postalCode } }") {
          id: ID!
          bookId: String! @external
          author: Author! @external
        }

        extend type Author implements Node @key(fields: "authorId") {
          id: ID!
          fullName: String! @external
          address: Address! @external
          authorId: Int! @external
        }
      `
      );
    });
  });
});
