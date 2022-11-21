import {generateFroidSchema, FederationVersion} from '../generateFroidSchema';
import {print} from 'graphql';
import {stripIndent as gql} from 'common-tags';

function generateSchema(
  subgraphs: Map<string, string>,
  froidSubgraphName: string,
  contractTags: string[] = [],
  typeExceptions: string[] = []
) {
  return print(
    generateFroidSchema(subgraphs, froidSubgraphName, {
      contractTags,
      federationVersion: FederationVersion.V1,
      typeExceptions,
    })
  );
}

describe('generateFroidSchema for federation v1', () => {
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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

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

  it('does not propogate miscelaneous directives to the generated id field', () => {
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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

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

        extend type Brand {
          brandId: Int! @external
          store: Store @external
        }

        extend type Store {
          storeId: Int! @external
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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

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

    const actual = generateSchema(subgraphs, 'relay-subgraph', [], ['Todo']);

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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

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

      const actual = generateSchema(subgraphs, 'relay-subgraph', [
        'storefront',
        'supplier',
      ]);

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

      const actual = generateSchema(subgraphs, 'relay-subgraph', [
        'storefront',
        'supplier',
      ]);

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

      const actual = generateSchema(subgraphs, 'relay-subgraph', [
        'storefront',
        'supplier',
      ]);

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
          USED
          NOT_USED
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

      const actual = generateSchema(subgraphs, 'relay-subgraph', [
        'storefront',
        'internal',
      ]);

      expect(actual).toEqual(
        // prettier-ignore
        gql`
        directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

        scalar UsedCustomScalar1

        scalar UsedCustomScalar2

        enum UsedEnum {
          USED
          NOT_USED
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
});
