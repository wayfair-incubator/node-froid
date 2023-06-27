import {generateFroidSchema} from '../generateFroidSchema';
import {print, DefinitionNode} from 'graphql';
import {stripIndent as gql} from 'common-tags';
import {ObjectTypeNode} from '../types';

function generateSchema(
  subgraphs: Map<string, string>,
  froidSubgraphName: string,
  contractTags: string[] = [],
  typeExceptions: string[] = [],
  nodeQualifier?: (
    node: DefinitionNode,
    objectTypes: Record<string, ObjectTypeNode>
  ) => boolean
) {
  return print(
    generateFroidSchema(subgraphs, froidSubgraphName, {
      contractTags,
      typeExceptions,
      nodeQualifier,
    })
  );
}

describe('generateFroidSchema for federation v2', () => {
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type Product implements Node @key(fields: "upc") {
          id: ID!
          upc: String!
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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type Product implements Node @key(fields: "upc") {
          id: ID!
          upc: String!
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type Product implements Node @key(fields: "upc sku") {
          id: ID!
          upc: String!
          sku: String!
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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type Product implements Node @key(fields: "upc sku") {
          id: ID!
          upc: String!
          sku: String!
        }
      `
    );
  });

  it('generates valid schema for entity with nested complex (multi-field) keys', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product
        @key(fields: "upc sku brand { brandId store { storeId } }")
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type Product implements Node @key(fields: "upc sku brand { brandId store { storeId } }") {
          id: ID!
          upc: String!
          sku: String!
          brand: [Brand!]!
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
      type User @key(fields: "userId") {
        userId: String!
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type User implements Node @key(fields: "userId") {
          id: ID!
          userId: String!
        }

        type Todo implements Node @key(fields: "todoId") {
          id: ID!
          todoId: Int!
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

    const actual = generateSchema(subgraphs, 'relay-subgraph');

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type Brand implements Node @key(fields: "brandId") {
          id: ID!
          brandId: Int!
        }

        type Product implements Node @key(fields: "upc sku brand { brandId }") {
          id: ID!
          upc: String!
          sku: String!
          brand: [Brand!]!
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type User implements Node @key(fields: "userId") {
          id: ID!
          userId: String!
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

      type Todo @key(fields: "oldTodoKey") {
        oldTodoKey: String!
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

    const nodeQualifier = (node) =>
      node.name.value !== 'Todo' ||
      node.directives.filter((directive) => directive.name.value === 'key')
        .length > 1;

    const actual = generateSchema(
      subgraphs,
      'relay-subgraph',
      [],
      [],
      nodeQualifier
    );

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type Todo implements Node @key(fields: "todoId") {
          id: ID!
          todoId: Int!
        }

        type User implements Node @key(fields: "userId") {
          id: ID!
          userId: String!
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

      type User @key(fields: "userId", resolvable: false) {
        userId: String!
      }
    `;
    const relaySchema = gql`
      directive @tag(
        name: String!
      ) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      type Query {
        node(id: ID!): Node
      }

      interface Node {
        id: ID!
      }

      type User implements Node @key(fields: "userId") {
        id: ID!
        userId: String!
      }

      type Todo implements Node @key(fields: "todoId") {
        id: ID!
        todoId: Int!
      }

      type AnotherType implements Node @key(fields: "someId") {
        id: ID!
        someId: Int!
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type User implements Node @key(fields: "userId") {
          id: ID!
          userId: String!
        }

        type Todo implements Node @key(fields: "todoId") {
          id: ID!
          todoId: Int!
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        scalar UsedCustomScalar1

        scalar UsedCustomScalar2

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type User implements Node @key(fields: "userId customField1 customField2") {
          id: ID!
          userId: String!
          customField1: UsedCustomScalar1
          customField2: [UsedCustomScalar2!]!
        }

        type Todo implements Node @key(fields: "todoId customField") {
          id: ID!
          todoId: Int!
          customField: UsedCustomScalar1
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
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

          type Query {
            node(id: ID!): Node @tag(name: "storefront") @tag(name: "supplier")
          }

          interface Node @tag(name: "storefront") @tag(name: "supplier") {
            id: ID!
          }

          type Product implements Node @key(fields: "upc") {
            id: ID!
            upc: String!
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
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

          type Query {
            node(id: ID!): Node @tag(name: "storefront") @tag(name: "supplier")
          }

          interface Node @tag(name: "storefront") @tag(name: "supplier") {
            id: ID!
          }

          type Product implements Node @key(fields: "upc") {
            id: ID! @tag(name: "storefront")
            upc: String!
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
        type StorefrontUser @key(fields: "userId") {
          userId: String!
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
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

          type Query {
            node(id: ID!): Node @tag(name: "storefront") @tag(name: "supplier")
          }

          interface Node @tag(name: "storefront") @tag(name: "supplier") {
            id: ID!
          }

          type Product implements Node @key(fields: "upc") {
            id: ID! @tag(name: "internal") @tag(name: "storefront")
            upc: String!
          }

          type Brand implements Node @key(fields: "brandId") {
            id: ID! @tag(name: "internal") @tag(name: "storefront")
            brandId: Int!
          }

          type StorefrontUser implements Node @key(fields: "userId") {
            id: ID! @tag(name: "internal") @tag(name: "storefront")
            userId: String!
          }

          type InternalUser implements Node @key(fields: "userId") {
            id: ID! @tag(name: "internal")
            userId: String!
          }

          type Todo implements Node @key(fields: "todoId") {
            id: ID! @tag(name: "internal")
            todoId: Int!
          }
        `
      );
    });

    it('generates custom scalar definitions w/global tags when they are used on a type definition in the schema', () => {
      const userSchema = gql`
        scalar UsedCustomScalar1
        scalar UsedCustomScalar2
        scalar UnusedCustomScalar

        enum UsedEnum {
          VALUE_ONE @customDirective
          VALUE_TWO @customDirective @inaccessible
          VALUE_THREE
        }

        type Query {
          user(id: String): User
        }

        type User
          @key(
            fields: "userId customField1 customField2 customEnum1 customEnum2"
          ) {
          userId: String!
          name: String!
          customField1: UsedCustomScalar1
          customField2: [UsedCustomScalar2!]!
          customEnum1: UsedEnum
          customEnum2: [UsedEnum!]!
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

      const actual = generateSchema(subgraphs, 'relay-subgraph', [
        'storefront',
        'internal',
      ]);

      expect(actual).toEqual(
        // prettier-ignore
        gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag"])

        scalar UsedCustomScalar1

        scalar UsedCustomScalar2

        enum UsedEnum {
          VALUE_ONE
          VALUE_TWO @inaccessible
          VALUE_THREE
        }

        type Query {
          node(id: ID!): Node @tag(name: "internal") @tag(name: "storefront")
        }

        interface Node @tag(name: "internal") @tag(name: "storefront") {
          id: ID!
        }

        type User implements Node @key(fields: "userId customField1 customField2 customEnum1 customEnum2") {
          id: ID!
          userId: String!
          customField1: UsedCustomScalar1
          customField2: [UsedCustomScalar2!]!
          customEnum1: UsedEnum
          customEnum2: [UsedEnum!]!
        }

        type Todo implements Node @key(fields: "todoId customField") {
          id: ID!
          todoId: Int!
          customField: UsedCustomScalar1
        }
      `
      );
    });
  });
});
