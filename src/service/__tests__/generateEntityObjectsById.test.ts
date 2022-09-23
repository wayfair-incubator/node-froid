import {generateEntityObjectsById} from '../generateEntityObjectsById';
import {testGql as gql} from '../../__tests__/helpers';
import {toGlobalId} from 'graphql-relay';

describe('generateEntityObjectsById', () => {
  it('returns an entity object with the `id` + entity keys present', async () => {
    const authorEntityKey = {firstName: 'John', lastName: 'Doe'};
    const id = toGlobalId('Author', JSON.stringify(authorEntityKey));

    const result = await generateEntityObjectsById({
      query: gql`
        query GetAuthor($id: ID!) {
          node(id: $id) {
            ... on Author {
              id
              firstName
              lastName
              fullName
            }
          }
        }
      `,
      variables: {id},
    });

    expect(result).toEqual({
      data: {
        node: {
          __typename: 'Author',
          id,
          firstName: 'John',
          lastName: 'Doe',
        },
      },
    });
  });

  it('supports multiple node queries with aliases', async () => {
    const authorEntityKey = {firstName: 'John', lastName: 'Doe'};
    const id = toGlobalId('Author', JSON.stringify(authorEntityKey));
    const authorEntityKey2 = {firstName: 'Jane', lastName: 'Doe'};
    const id2 = toGlobalId('Author', JSON.stringify(authorEntityKey2));

    const result = await generateEntityObjectsById({
      query: gql`
        query GetAuthor($id: ID!, $id2: ID!) {
          node(id: $id) {
            ... on Author {
              id
              firstName
              lastName
              fullName
            }
          }
          second: node(id: $id2) {
            ... on Author {
              id
              firstName
              lastName
              fullName
            }
          }
        }
      `,
      variables: {id, id2},
    });

    expect(result).toEqual({
      data: {
        node: {
          __typename: 'Author',
          id,
          firstName: 'John',
          lastName: 'Doe',
        },
        second: {
          __typename: 'Author',
          id: id2,
          firstName: 'Jane',
          lastName: 'Doe',
        },
      },
    });
  });

  it('allows for use of a custom decode', async () => {
    const authorEntityKey = {firstName: 'John', lastName: 'Doe'};
    const id = toGlobalId(
      'Author',
      // fake encodeing
      'abc' + JSON.stringify(authorEntityKey) + 'abc'
    );
    const decode = (value) => {
      const decodedValue = value.replace(/^abc|abc$/g, '');
      return JSON.parse(decodedValue);
    };

    const result = await generateEntityObjectsById(
      {
        query: gql`
          query GetAuthor($id: ID!) {
            node(id: $id) {
              ... on Author {
                id
                firstName
                lastName
                fullName
              }
            }
          }
        `,
        variables: {id},
      },
      {decode}
    );

    expect(result).toEqual({
      data: {
        node: {
          __typename: 'Author',
          id,
          firstName: 'John',
          lastName: 'Doe',
        },
      },
    });
  });

  describe('when interpolated arguemnts are used', () => {
    it('returns an entity object with the `id` + entity keys present', async () => {
      const authorEntityKey = {firstName: 'John', lastName: 'Doe'};
      const id = toGlobalId('Author', JSON.stringify(authorEntityKey));

      const result = await generateEntityObjectsById({
        query: gql`
        query {
          node(id: "${id}") {
            ... on Author {
              id
              firstName
              lastName
              fullName
            }
          }
        }
      `,
      });

      expect(result).toEqual({
        data: {
          node: {
            __typename: 'Author',
            id,
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      });
    });
  });
});
