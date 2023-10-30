import {stripIndent as gql} from 'common-tags';
import {FroidSchema} from '../FroidSchema';
import {DefinitionNode} from 'graphql';
import {ObjectTypeNode} from '../types';
import {Key} from '../Key';

function generateSchema({
  subgraphs,
  froidSubgraphName,
  contractTags = [],
  typeExceptions = [],
  federationVersion,
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
    objectTypes: ObjectTypeNode[]
  ) => boolean;
  keySorter?: (keys: Key[], node: ObjectTypeNode) => Key[];
}) {
  const froidSchema = new FroidSchema(froidSubgraphName, subgraphs, {
    contractTags,
    typeExceptions,
    nodeQualifier,
    federationVersion,
    keySorter,
  });

  return froidSchema.toString();
}

describe('FroidSchema class', () => {
  it('defaults the federation version to 2.0', () => {
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

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toMatch(
      'extend schema @link(url: "https://specs.apollo.dev/federation/v2.0"'
    );
  });

  it('honors a custom 2.x federation version', () => {
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

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      federationVersion: 'v2.3',
    });

    expect(actual).toMatch(
      'extend schema @link(url: "https://specs.apollo.dev/federation/v2.3"'
    );
  });

  it('throws an error if the version is not a valid v2.x version', () => {
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
        federationVersion: 'v3.1',
      });
    } catch (err) {
      errorMessage = err.message;
    }

    expect(errorMessage).toMatch(
      `Federation version must be a valid 'v2.x' version`
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

  // @todo FIX THE NAME OF THIS TEST
  it('defaults to generating valid schema using the first non-nested complex (multi-field) keys', () => {
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

        type Query {
          node(id: ID!): Node
        }

        interface Node {
          id: ID!
        }

        type Product implements Node @key(fields: "upc sku brand { __typename brandId store { __typename storeId } }") {
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

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

        type Product implements Node @key(fields: "upc sku brand { __typename brandId }") {
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

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: [],
      typeExceptions: ['Todo'],
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'supplier'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'supplier'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'supplier'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'internal'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

    it('tags are identified from field arguments', () => {
      const urlSchema = gql`
        type TypeA @key(fields: "selections { selectionId }") {
          selections: [TypeB!] @inaccessible
          fieldWithArgument(argument: Int @tag(name: "storefront")): Boolean
        }

        type TypeB @key(fields: "selectionId", resolvable: false) {
          selectionId: String!
        }
      `;

      const altSchema = gql`
        type TypeB @key(fields: "selectionId") {
          selectionId: String! @tag(name: "storefront")
        }
      `;

      const subgraphs = new Map();
      subgraphs.set('url-subgraph', urlSchema);
      subgraphs.set('alt-subgraph', altSchema);

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
        contractTags: ['storefront', 'internal'],
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

        type Query {
          node(id: ID!): Node @tag(name: "internal") @tag(name: "storefront")
        }

        interface Node @tag(name: "internal") @tag(name: "storefront") {
          id: ID!
        }

        type TypeA implements Node @key(fields: "selections { __typename selectionId }") {
          id: ID! @tag(name: "storefront")
          selections: [TypeB!]
        }

        type TypeB implements Node @key(fields: "selectionId") {
          id: ID! @tag(name: "storefront")
          selectionId: String!
        }
      `
      );
    });
  });

  describe('when generating schema for complex keys', () => {
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
          return keys.sort((a, b) => {
            return b.depth - a.depth;
          });
        },
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

          type Query {
            node(id: ID!): Node
          }

          interface Node {
            id: ID!
          }

          type Product implements Node @key(fields: "upc sku brand { __typename brandId store { __typename storeId } }") {
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
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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
            return keys.sort((a, b) => b.depth - a.depth);
          }
          return keys;
        },
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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

          type Book implements Node @key(fields: "bookId author { __typename authorId }") {
            id: ID!
            bookId: String!
            author: Author!
          }

          type Author {
            authorId: String!
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

      const actual = generateSchema({
        subgraphs,
        froidSubgraphName: 'relay-subgraph',
      });

      expect(actual).toEqual(
        // prettier-ignore
        gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

          type Query {
            node(id: ID!): Node
          }

          interface Node {
            id: ID!
          }

          type Product implements Node @key(fields: "upc sku brand { __typename brandId store { __typename storeId } }") {
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
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

        type Query {
          node(id: ID!): Node @tag(name: "internal") @tag(name: "storefront")
        }

        interface Node @tag(name: "internal") @tag(name: "storefront") {
          id: ID!
        }

        type Magazine implements Node @key(fields: "magazineId publisher { __typename address { __typename country } }") {
          id: ID!
          magazineId: String!
          publisher: Publisher!
        }

        type Book implements Node @key(fields: "bookId author { __typename fullName address { __typename postalCode } authorId }") {
          id: ID!
          bookId: String!
          author: Author!
        }

        type Author implements Node @key(fields: "authorId") {
          id: ID!
          authorId: Int!
          fullName: String! @external
          address: Address! @external
        }

        type Publisher {
          address: Address!
        }

        type Address {
          country: String!
          postalCode: String!
        }
      `
      );
    });

    it('properly identifies shareable fields', () => {
      const bookSchema = gql`
        type Book @key(fields: "author { name }") {
          author: Author!
        }

        type Author @key(fields: "authorId") {
          authorId: Int!
          name: String! @shareable
        }
      `;

      const authorSchema = gql`
        type Author @key(fields: "authorId") {
          authorId: Int!
          name: String! @shareable
        }
      `;

      const subgraphs = new Map();
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

        type Query {
          node(id: ID!): Node @tag(name: "internal") @tag(name: "storefront")
        }

        interface Node @tag(name: "internal") @tag(name: "storefront") {
          id: ID!
        }

        type Book implements Node @key(fields: "author { __typename name authorId }") {
          id: ID!
          author: Author!
        }

        type Author implements Node @key(fields: "authorId") {
          id: ID!
          authorId: Int!
          name: String! @shareable
        }
      `
      );
    });

    it('properly identifies external fields', () => {
      const bookSchema = gql`
        type Book @key(fields: "author { name }") {
          author: Author!
        }

        type Author @key(fields: "authorId") {
          authorId: Int!
          name: String!
        }
      `;

      const authorSchema = gql`
        type Author @key(fields: "authorId") {
          authorId: Int!
          name: String!
        }
      `;

      const subgraphs = new Map();
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
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external", "@shareable"])

        type Query {
          node(id: ID!): Node @tag(name: "internal") @tag(name: "storefront")
        }

        interface Node @tag(name: "internal") @tag(name: "storefront") {
          id: ID!
        }

        type Book implements Node @key(fields: "author { __typename name authorId }") {
          id: ID!
          author: Author!
        }

        type Author implements Node @key(fields: "authorId") {
          id: ID!
          authorId: Int!
          name: String! @external
        }
      `
      );
    });
  });
});
