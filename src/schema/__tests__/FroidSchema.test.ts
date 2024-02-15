import {stripIndent as gql} from 'common-tags';
import {FroidSchema, KeySorter, NodeQualifier} from '../FroidSchema';
import {Kind} from 'graphql';
import {FED2_DEFAULT_VERSION} from '../constants';

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
  federationVersion: string;
  nodeQualifier?: NodeQualifier;
  keySorter?: KeySorter;
}) {
  const froidSchema = new FroidSchema(
    froidSubgraphName,
    federationVersion,
    subgraphs,
    {
      contractTags,
      typeExceptions,
      nodeQualifier,
      keySorter,
    }
  );

  return froidSchema.toString();
}

describe('FroidSchema class', () => {
  it('requires a federation version', () => {
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

  it('uses the first entity key found regardless of complexity by default', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Brand {
          brandId: Int!
          store: Store
        }

        "The global identification interface implemented by all entities."
        interface Node {
          "The globally unique identifier."
          id: ID!
        }

        type Product implements Node @key(fields: "brand { __typename brandId store { __typename storeId } } sku upc") {
          "The globally unique identifier."
          id: ID!
          brand: [Brand!]!
          sku: String!
          upc: String!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node
        }

        type Store {
          storeId: Int!
        }
      `
    );
  });

  it('includes entities from multiple subgraph schemas', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node
        }

        type Todo implements Node @key(fields: "todoId") {
          "The globally unique identifier."
          id: ID!
          todoId: Int!
        }

        type User implements Node @key(fields: "userId") {
          "The globally unique identifier."
          id: ID!
          userId: String!
        }
      `
    );
  });

  it('includes custom scalar definitions when they are used as the return type for a key field', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node
        }

        type Todo implements Node @key(fields: "customField todoId") {
          "The globally unique identifier."
          id: ID!
          customField: UsedCustomScalar1
          todoId: Int!
        }

        scalar UsedCustomScalar1

        scalar UsedCustomScalar2

        type User implements Node @key(fields: "customField1 customField2 userId") {
          "The globally unique identifier."
          id: ID!
          customField1: UsedCustomScalar1
          customField2: [UsedCustomScalar2!]!
          userId: String!
        }
      `
    );
  });

  it('generates valid schema for entities with multi-field, un-nested complex keys', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          "The global identification interface implemented by all entities."
          interface Node {
            "The globally unique identifier."
            id: ID!
          }

          type Product implements Node @key(fields: "sku upc") {
            "The globally unique identifier."
            id: ID!
            sku: String!
            upc: String!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node
          }
        `
    );
  });

  it('generates valid schema for entity with nested complex keys', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          type Brand {
            brandId: Int!
            store: Store
          }

          "The global identification interface implemented by all entities."
          interface Node {
            "The globally unique identifier."
            id: ID!
          }

          type Product implements Node @key(fields: "brand { __typename brandId store { __typename storeId } } sku upc") {
            "The globally unique identifier."
            id: ID!
            brand: [Brand!]!
            sku: String!
            upc: String!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node
          }

          type Store {
            storeId: Int!
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Address {
          country: String!
          postalCode: String!
        }

        type Author implements Node @key(fields: "authorId") {
          "The globally unique identifier."
          id: ID!
          address: Address! @external
          authorId: Int!
          fullName: String! @external
        }

        type Book implements Node @key(fields: "author { __typename address { __typename postalCode } authorId fullName } bookId") {
          "The globally unique identifier."
          id: ID!
          author: Author!
          bookId: String!
        }

        type Magazine implements Node @key(fields: "magazineId publisher { __typename address { __typename country } }") {
          "The globally unique identifier."
          id: ID!
          magazineId: String!
          publisher: Publisher!
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Publisher {
          address: Address!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }
      `
    );
  });

  it('ignores the selected key of an entity if another key is used as part of the complex key for another entity', () => {
    const bookSchema = gql`
      type Book @key(fields: "bookId") @key(fields: "isbn") {
        bookId: Int!
        isbn: String!
      }
    `;

    const authorSchema = gql`
      type Author @key(fields: "book { isbn }") {
        name: String!
        book: Book!
      }

      type Book @key(fields: "isbn") {
        isbn: String!
      }
    `;

    const subgraphs = new Map();
    subgraphs.set('book-subgraph', bookSchema);
    subgraphs.set('author-subgraph', authorSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: ['storefront', 'internal'],
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Author implements Node @key(fields: "book { __typename isbn }") {
          "The globally unique identifier."
          id: ID!
          book: Book!
        }

        type Book implements Node @key(fields: "isbn") {
          "The globally unique identifier."
          id: ID!
          isbn: String!
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }
      `
    );
  });

  it('uses entire entity keys when selecting based on use in another entity complex key', () => {
    const bookSchema = gql`
      type Book @key(fields: "bookId") @key(fields: "isbn title") {
        bookId: Int!
        isbn: String!
        title: String!
      }
    `;

    const authorSchema = gql`
      type Author @key(fields: "book { isbn }") {
        name: String!
        book: Book!
      }

      type Book @key(fields: "isbn") {
        isbn: String!
      }
    `;

    const subgraphs = new Map();
    subgraphs.set('book-subgraph', bookSchema);
    subgraphs.set('author-subgraph', authorSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: ['storefront', 'internal'],
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Author implements Node @key(fields: "book { __typename isbn title }") {
          "The globally unique identifier."
          id: ID!
          book: Book!
        }

        type Book implements Node @key(fields: "isbn title") {
          "The globally unique identifier."
          id: ID!
          isbn: String!
          title: String!
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }
      `
    );
  });

  it('uses a compound entity key if multiple keys are used in other entity complex keys', () => {
    const bookSchema = gql`
      type Book @key(fields: "bookId") @key(fields: "isbn title") {
        bookId: Int!
        isbn: String!
        title: String!
      }
    `;

    const authorSchema = gql`
      type Author @key(fields: "book { isbn }") {
        name: String!
        book: Book!
      }

      type Book @key(fields: "isbn") {
        isbn: String!
      }
    `;

    const reviewSchema = gql`
      type Review @key(fields: "book { bookId }") {
        averageRating: Float!
        book: Book!
      }

      type Book @key(fields: "bookId") {
        bookId: Int!
      }
    `;

    const subgraphs = new Map();
    subgraphs.set('book-subgraph', bookSchema);
    subgraphs.set('author-subgraph', authorSchema);
    subgraphs.set('review-subgraph', reviewSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: ['storefront', 'internal'],
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Author implements Node @key(fields: "book { __typename bookId isbn title }") {
          "The globally unique identifier."
          id: ID!
          book: Book!
        }

        type Book implements Node @key(fields: "bookId isbn title") {
          "The globally unique identifier."
          id: ID!
          bookId: Int!
          isbn: String!
          title: String!
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }

        type Review implements Node @key(fields: "book { __typename bookId isbn title }") {
          "The globally unique identifier."
          id: ID!
          book: Book!
        }
      `
    );
  });

  it('ignores the default selected key even when a compound entity key is created', () => {
    const bookSchema = gql`
      type Book
        @key(fields: "bookId")
        @key(fields: "isbn title")
        @key(fields: "sku") {
        bookId: Int!
        isbn: String!
        title: String!
        sku: String!
      }
    `;

    const authorSchema = gql`
      type Author @key(fields: "book { isbn }") {
        name: String!
        book: Book!
      }

      type Book @key(fields: "isbn") {
        isbn: String!
      }
    `;

    const reviewSchema = gql`
      type Review @key(fields: "book { sku }") {
        averageRating: Float!
        book: Book!
      }

      type Book @key(fields: "bookId") {
        sku: String!
      }
    `;

    const subgraphs = new Map();
    subgraphs.set('book-subgraph', bookSchema);
    subgraphs.set('author-subgraph', authorSchema);
    subgraphs.set('review-subgraph', reviewSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: ['storefront', 'internal'],
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Author implements Node @key(fields: "book { __typename isbn sku title }") {
          "The globally unique identifier."
          id: ID!
          book: Book!
        }

        type Book implements Node @key(fields: "isbn sku title") {
          "The globally unique identifier."
          id: ID!
          isbn: String!
          sku: String!
          title: String!
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }

        type Review implements Node @key(fields: "book { __typename isbn sku title }") {
          "The globally unique identifier."
          id: ID!
          book: Book!
        }
      `
    );
  });

  it('figures out key dependencies across multiple subgraphs when there are conflicts between the default selected key and key dependencies', () => {
    const bookSchema = gql`
      type Book
        @key(fields: "bookId")
        @key(fields: "isbn title")
        @key(fields: "sku") {
        bookId: Int!
        isbn: String!
        title: String!
        sku: String!
      }
    `;

    const authorSchema = gql`
      type Author
        @key(fields: "review { reviewId }")
        @key(fields: "book { isbn }") {
        name: String!
        book: Book!
        review: Review!
      }

      type Book @key(fields: "isbn") {
        isbn: String!
      }

      type Review @key(fields: "reviewId") {
        reviewId: Int!
      }
    `;

    const reviewSchema = gql`
      type Review @key(fields: "book { sku }") @key(fields: "reviewId") {
        reviewId: Int!
        averageRating: Float!
        book: Book!
      }

      type Book @key(fields: "bookId") {
        sku: String!
      }
    `;

    const subgraphs = new Map();
    subgraphs.set('book-subgraph', bookSchema);
    subgraphs.set('author-subgraph', authorSchema);
    subgraphs.set('review-subgraph', reviewSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: ['storefront', 'internal'],
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Author implements Node @key(fields: "review { __typename reviewId }") {
          "The globally unique identifier."
          id: ID!
          review: Review!
        }

        type Book implements Node @key(fields: "bookId") {
          "The globally unique identifier."
          id: ID!
          bookId: Int!
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }

        type Review implements Node @key(fields: "reviewId") {
          "The globally unique identifier."
          id: ID!
          reviewId: Int!
        }
      `
    );
  });

  it('applies the @external directive to non-key fields used by other entity keys', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Author implements Node @key(fields: "authorId") {
          "The globally unique identifier."
          id: ID!
          authorId: Int!
          name: String! @external
        }

        type Book implements Node @key(fields: "author { __typename authorId name }") {
          "The globally unique identifier."
          id: ID!
          author: Author!
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }
      `
    );
  });

  it('applies the @external directive to @shareable non-key fields used by other entity keys', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Author implements Node @key(fields: "authorId") {
          "The globally unique identifier."
          id: ID!
          authorId: Int!
          name: String! @external
        }

        type Book implements Node @key(fields: "author { __typename authorId name }") {
          "The globally unique identifier."
          id: ID!
          author: Author!
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }
      `
    );
  });

  it('uses a custom qualifier to prefer fields', () => {
    const bookSchema = gql`
      type Book @key(fields: "isbn") {
        isbn: String!
        title: String!
      }
    `;
    const authorSchema = gql`
      type Book @key(fields: "isbn") {
        isbn: String!
        title: String
      }

      type Author @key(fields: "book { title }") {
        book: Book!
      }
    `;
    const reviewSchema = gql`
      type Book @key(fields: "isbn") {
        isbn: String!
        title: String!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('book-subgraph', bookSchema);
    subgraphs.set('author-subgraph', authorSchema);
    subgraphs.set('review-subgraph', reviewSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      federationVersion: FED2_DEFAULT_VERSION,
      nodeQualifier: (node) => {
        if (
          node.kind === Kind.FIELD_DEFINITION &&
          node.type.kind === Kind.NON_NULL_TYPE
        ) {
          return false;
        }
        return true;
      },
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          type Author implements Node @key(fields: "book { __typename isbn title }") {
            "The globally unique identifier."
            id: ID!
            book: Book!
          }

          type Book implements Node @key(fields: "isbn") {
            "The globally unique identifier."
            id: ID!
            isbn: String!
            title: String @external
          }

          "The global identification interface implemented by all entities."
          interface Node {
            "The globally unique identifier."
            id: ID!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node
          }
        `
    );
  });

  it('falls back to picking the first found field if the provided custom qualifier fails to find a field', () => {
    const bookSchema = gql`
      type Book @key(fields: "isbn") {
        isbn: String!
        title: String
      }
    `;
    const authorSchema = gql`
      type Book @key(fields: "isbn") {
        isbn: String!
        title: [String]
      }

      type Author @key(fields: "book { title }") {
        book: Book!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('book-subgraph', bookSchema);
    subgraphs.set('author-subgraph', authorSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      federationVersion: FED2_DEFAULT_VERSION,
      nodeQualifier: (node) => {
        if (
          node.kind === Kind.FIELD_DEFINITION &&
          node.type.kind !== Kind.NON_NULL_TYPE
        ) {
          return false;
        }
        return true;
      },
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          type Author implements Node @key(fields: "book { __typename isbn title }") {
            "The globally unique identifier."
            id: ID!
            book: Book!
          }

          type Book implements Node @key(fields: "isbn") {
            "The globally unique identifier."
            id: ID!
            isbn: String!
            title: String @external
          }

          "The global identification interface implemented by all entities."
          interface Node {
            "The globally unique identifier."
            id: ID!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node
          }
        `
    );
  });

  it('stops compound key generation recursion when an already-visited ancestor is encountered', () => {
    const bookSchema = gql`
      type Book @key(fields: "author { name }") {
        author: Author!
        title: String!
      }

      type Author @key(fields: "book { title }") {
        book: Book!
        name: String!
      }
    `;

    const subgraphs = new Map();
    subgraphs.set('book-subgraph', bookSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: ['storefront', 'internal'],
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Author implements Node @key(fields: "book { __typename author { __typename name } title }") {
          "The globally unique identifier."
          id: ID!
          book: Book!
          name: String! @external
        }

        type Book implements Node @key(fields: "author { __typename book { __typename title } name }") {
          "The globally unique identifier."
          id: ID!
          author: Author!
          title: String! @external
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }
      `
    );
  });

  it('does not duplicate fields needed by other entities for their complex keys', () => {
    const bookSchema = gql`
      type Book @key(fields: "bookId") @key(fields: "isbn") {
        bookId: String!
        isbn: String!
      }
    `;

    const authorSchema = gql`
      type Book @key(fields: "isbn") {
        isbn: String!
      }

      type Author @key(fields: "book { isbn }") {
        book: Book!
      }
    `;

    const reviewSchema = gql`
      type Book @key(fields: "isbn") {
        isbn: String!
      }

      type Review @key(fields: "book { isbn }") {
        book: Book!
      }
    `;

    const subgraphs = new Map();
    subgraphs.set('book-subgraph', bookSchema);
    subgraphs.set('author-subgraph', authorSchema);
    subgraphs.set('review-subgraph', reviewSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: ['storefront', 'internal'],
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Author implements Node @key(fields: "book { __typename isbn }") {
          "The globally unique identifier."
          id: ID!
          book: Book!
        }

        type Book implements Node @key(fields: "isbn") {
          "The globally unique identifier."
          id: ID!
          isbn: String!
        }

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }

        type Review implements Node @key(fields: "book { __typename isbn }") {
          "The globally unique identifier."
          id: ID!
          book: Book!
        }
      `
    );
  });

  it('applies tags to all core relay object identification types', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          "The global identification interface implemented by all entities."
          interface Node @tag(name: "storefront") @tag(name: "supplier") {
            "The globally unique identifier."
            id: ID!
          }

          type Product implements Node @key(fields: "upc") {
            "The globally unique identifier."
            id: ID!
            upc: String!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node @tag(name: "storefront") @tag(name: "supplier")
          }
        `
    );
  });

  it('identifies tags from field arguments', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }

        type TypeA implements Node @key(fields: "selections { __typename selectionId }") {
          "The globally unique identifier."
          id: ID! @tag(name: "storefront")
          selections: [TypeB!]
        }

        type TypeB implements Node @key(fields: "selectionId") {
          "The globally unique identifier."
          id: ID! @tag(name: "storefront")
          selectionId: String!
        }
      `
    );
  });

  it('applies tags to the id field based on tags of sibling fields across subgraph schemas', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          type Brand implements Node @key(fields: "brandId") {
            "The globally unique identifier."
            id: ID! @tag(name: "internal") @tag(name: "storefront")
            brandId: Int!
          }

          type InternalUser implements Node @key(fields: "userId") {
            "The globally unique identifier."
            id: ID! @tag(name: "internal")
            userId: String!
          }

          "The global identification interface implemented by all entities."
          interface Node @tag(name: "storefront") @tag(name: "supplier") {
            "The globally unique identifier."
            id: ID!
          }

          type Product implements Node @key(fields: "upc") {
            "The globally unique identifier."
            id: ID! @tag(name: "internal") @tag(name: "storefront")
            upc: String!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node @tag(name: "storefront") @tag(name: "supplier")
          }

          type StorefrontUser implements Node @key(fields: "userId") {
            "The globally unique identifier."
            id: ID! @tag(name: "internal") @tag(name: "storefront")
            userId: String!
          }

          type Todo implements Node @key(fields: "todoId") {
            "The globally unique identifier."
            id: ID! @tag(name: "internal")
            todoId: Int!
          }
        `
    );
  });

  it('uses an entity key regardless of tagging or accessibility, and accurately tags the id field', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          "The global identification interface implemented by all entities."
          interface Node @tag(name: "storefront") @tag(name: "supplier") {
            "The globally unique identifier."
            id: ID!
          }

          type Product implements Node @key(fields: "upc") {
            "The globally unique identifier."
            id: ID! @tag(name: "storefront")
            upc: String!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node @tag(name: "storefront") @tag(name: "supplier")
          }
        `
    );
  });

  it('applies global tags to included custom scalar definitions', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }

        type Todo implements Node @key(fields: "customField todoId") {
          "The globally unique identifier."
          id: ID!
          customField: UsedCustomScalar1
          todoId: Int!
        }

        scalar UsedCustomScalar1

        scalar UsedCustomScalar2

        enum UsedEnum {
          VALUE_ONE
          VALUE_THREE
          VALUE_TWO @inaccessible
        }

        type User implements Node @key(fields: "customEnum1 customEnum2 customField1 customField2 userId") {
          "The globally unique identifier."
          id: ID!
          customEnum1: UsedEnum
          customEnum2: [UsedEnum!]!
          customField1: UsedCustomScalar1
          customField2: [UsedCustomScalar2!]!
          userId: String!
        }
      `
    );
  });

  it('includes a combined enum definition when enum values differ across subgraphs', () => {
    const userSchema = gql`
      enum UsedEnum {
        VALUE_ONE
        VALUE_TWO
      }
    `;
    const todoSchema = gql`
      enum UsedEnum {
        VALUE_THREE
        VALUE_FOUR
      }

      type User @key(fields: "userId enumField") {
        userId: String!
        enumField: UsedEnum!
      }
    `;
    const bookSchema = gql`
      enum UsedEnum {
        VALUE_THREE
        VALUE_FIVE
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('user-subgraph', userSchema);
    subgraphs.set('todo-subgraph', todoSchema);
    subgraphs.set('book-subgraph', bookSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      contractTags: ['storefront', 'internal'],
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node @tag(name: "internal") @tag(name: "storefront") {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node @tag(name: "internal") @tag(name: "storefront")
        }

        enum UsedEnum {
          VALUE_FIVE
          VALUE_FOUR
          VALUE_ONE
          VALUE_THREE
          VALUE_TWO
        }

        type User implements Node @key(fields: "enumField userId") {
          "The globally unique identifier."
          id: ID!
          enumField: UsedEnum!
          userId: String!
        }
      `
    );
  });

  it('ignores keys that use the `id` field', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node {
          "The globally unique identifier."
          id: ID!
        }

        type Product implements Node @key(fields: "upc") {
          "The globally unique identifier."
          id: ID!
          upc: String!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node
        }
      `
    );
  });

  it('ignores interface objects', () => {
    const productSchema = gql`
      type Product @key(fields: "upc") {
        upc: String!
      }

      type PrintedMedia @interfaceObject @key(fields: "mediaId") {
        mediaId: Int!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
      extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

      "The global identification interface implemented by all entities."
      interface Node {
        "The globally unique identifier."
        id: ID!
      }

      type Product implements Node @key(fields: "upc") {
        "The globally unique identifier."
        id: ID!
        upc: String!
      }

      type Query {
        "Fetches an entity by its globally unique identifier."
        node(
          "A globally unique entity identifier."
          id: ID!
        ): Node
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node
        }

        type User implements Node @key(fields: "userId") {
          "The globally unique identifier."
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node
        }

        type Todo implements Node @key(fields: "todoId") {
          "The globally unique identifier."
          id: ID!
          todoId: Int!
        }

        type User implements Node @key(fields: "userId") {
          "The globally unique identifier."
          id: ID!
          userId: String!
        }
      `
    );
  });

  it('ignores descriptions for schema that is not owned by the FROID subgraph', () => {
    const userSchema = gql`
      "Scalar description"
      scalar UsedCustomScalar1

      """
      Another scalar description
      """
      scalar UsedCustomScalar2

      scalar UnusedCustomScalar

      type Query {
        user(id: String): User
      }

      "User description"
      type User @key(fields: "userId address { postalCode }") {
        "userId description"
        userId: String!
        "Name description"
        name: String!
        "Unused field description"
        unusedField: UnusedCustomScalar
        "Address field description"
        address: Address!
      }

      """
      Address type description
      """
      type Address {
        "postalCode field description"
        postalCode: String!
      }
    `;

    const todoSchema = gql`
      scalar UsedCustomScalar1

      """
      Todo type description
      """
      type Todo @key(fields: "todoId customField") {
        "todoId field description"
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        type Address {
          postalCode: String!
        }

        "The global identification interface implemented by all entities."
        interface Node {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node
        }

        type Todo implements Node @key(fields: "customField todoId") {
          "The globally unique identifier."
          id: ID!
          customField: UsedCustomScalar1
          todoId: Int!
        }

        scalar UsedCustomScalar1

        type User implements Node @key(fields: "address { __typename postalCode } userId") {
          "The globally unique identifier."
          id: ID!
          address: Address!
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
    // prettier-ignore
    const relaySchema = gql`
      type AnotherType implements Node @key(fields: "someId") {
        "The globally unique identifier."
        id: ID!
        someId: Int!
      }

      directive @tag(
        name: String!
      ) repeatable on ARGUMENT_DEFINITION | ENUM | ENUM_VALUE | FIELD_DEFINITION | INPUT_FIELD_DEFINITION | INPUT_OBJECT | INTERFACE | OBJECT | SCALAR | UNION

      "The global identification interface implemented by all entities."
      interface Node {
        "The globally unique identifier."
        id: ID!
      }

      type Query {
        "Fetches an entity by its globally unique identifier."
        node(
          "A globally unique entity identifier."
          id: ID!
        ): Node
      }

      type Todo implements Node @key(fields: "todoId") {
        "The globally unique identifier."
        id: ID!
        todoId: Int!
      }

      type User implements Node @key(fields: "userId") {
        "The globally unique identifier."
        id: ID!
        userId: String!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('user-subgraph', userSchema);
    subgraphs.set('todo-subgraph', todoSchema);
    subgraphs.set('relay-subgraph', relaySchema);

    const actual = generateSchema({
      subgraphs,
      froidSubgraphName: 'relay-subgraph',
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node {
          "The globally unique identifier."
          id: ID!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node
        }

        type Todo implements Node @key(fields: "todoId") {
          "The globally unique identifier."
          id: ID!
          todoId: Int!
        }

        type User implements Node @key(fields: "userId") {
          "The globally unique identifier."
          id: ID!
          userId: String!
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

        "The global identification interface implemented by all entities."
        interface Node {
          "The globally unique identifier."
          id: ID!
        }

        type Product implements Node @key(fields: "upc") {
          "The globally unique identifier."
          id: ID!
          upc: String!
        }

        type Query {
          "Fetches an entity by its globally unique identifier."
          node(
            "A globally unique entity identifier."
            id: ID!
          ): Node
        }
      `
    );
  });

  it('can uses a custom key sorter to prefer the first complex key', () => {
    const productSchema = gql`
      type Query {
        topProducts(first: Int = 5): [Product]
      }

      type Product
        @key(fields: "upc sku")
        @key(fields: "brand { brandId store { storeId } }")
        @key(fields: "price")
        @key(fields: "brand { name }") {
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
        name: String!
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          type Brand {
            brandId: Int!
            store: Store
          }

          "The global identification interface implemented by all entities."
          interface Node {
            "The globally unique identifier."
            id: ID!
          }

          type Product implements Node @key(fields: "brand { __typename brandId store { __typename storeId } }") {
            "The globally unique identifier."
            id: ID!
            brand: [Brand!]!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node
          }

          type Store {
            storeId: Int!
          }
        `
    );
  });

  it('can uses a custom key sorter to prefer the first ordinal key', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          "The global identification interface implemented by all entities."
          interface Node {
            "The globally unique identifier."
            id: ID!
          }

          type Product implements Node @key(fields: "upc") {
            "The globally unique identifier."
            id: ID!
            upc: String!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node
          }
        `
    );
  });

  it('can uses a custom key sorter to prefer complex keys only when the node is named "Book"', () => {
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
      federationVersion: FED2_DEFAULT_VERSION,
    });

    expect(actual).toEqual(
      // prettier-ignore
      gql`
          extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@tag", "@external"])

          type Author {
            authorId: String!
          }

          type Book implements Node @key(fields: "author { __typename authorId } bookId") {
            "The globally unique identifier."
            id: ID!
            author: Author!
            bookId: String!
          }

          "The global identification interface implemented by all entities."
          interface Node {
            "The globally unique identifier."
            id: ID!
          }

          type Product implements Node @key(fields: "sku upc") {
            "The globally unique identifier."
            id: ID!
            sku: String!
            upc: String!
          }

          type Query {
            "Fetches an entity by its globally unique identifier."
            node(
              "A globally unique entity identifier."
              id: ID!
            ): Node
          }
        `
    );
  });

  it('generates schema document AST', () => {
    const productSchema = gql`
      type Product @key(fields: "upc") {
        upc: String!
      }
    `;
    const subgraphs = new Map();
    subgraphs.set('product-subgraph', productSchema);

    const froid = new FroidSchema(
      'relay-subgraph',
      FED2_DEFAULT_VERSION,
      subgraphs,
      {}
    );

    expect(froid.toAst().kind).toEqual(Kind.DOCUMENT);
  });

  it('honors a 2.x federation version', () => {
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

  describe('createLinkSchemaExtension() method', () => {
    it('throws an error if no links are provided', () => {
      let errorMessage = '';
      const productSchema = gql`
        type Product @key(fields: "upc") {
          upc: String!
        }
      `;
      const subgraphs = new Map();
      subgraphs.set('product-subgraph', productSchema);

      try {
        const froid = new FroidSchema(
          'relay-subgraph',
          FED2_DEFAULT_VERSION,
          subgraphs,
          {}
        );
        // @ts-ignore
        froid.createLinkSchemaExtension([]);
      } catch (error) {
        errorMessage = error.message;
      }
      expect(errorMessage).toEqual('At least one import must be provided.');
    });
  });
});
