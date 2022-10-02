import {handleFroidRequest} from '../handleFroidRequest';
import {testGql as gql} from '../../__tests__/helpers';

describe('handleFroidRequest', () => {
  describe('_entities requests', () => {
    it('uses the default encode/decode', async () => {
      const query = gql`
        query GetEntities($representations: [_any!]!) {
          _entities(representations: $representations) {
            __typename
            id
          }
        }
      `;
      const variables = {
        representations: [
          {__typename: 'Author', firstName: 'John', lastName: 'Doe'},
        ],
      };

      const result = await handleFroidRequest({query, variables});

      expect(result).toEqual({
        data: {
          _entities: [
            {
              __typename: 'Author',
              id: 'QXV0aG9yOnsiZmlyc3ROYW1lIjoiSm9obiIsImxhc3ROYW1lIjoiRG9lIn0=',
            },
          ],
        },
      });
    });

    it('supports a custom encode/decode', async () => {
      const query = gql`
        query GetEntities($representations: [_any!]!) {
          _entities(representations: $representations) {
            __typename
            id
          }
        }
      `;
      const variables = {
        representations: [
          {__typename: 'Author', firstName: 'John', lastName: 'Doe'},
        ],
      };
      const encode = (value) => `abc${value}abc`;

      const result = await handleFroidRequest(
        {
          query,
          variables,
        },
        {encode}
      );

      expect(result).toEqual({
        data: {
          _entities: [
            {
              __typename: 'Author',
              id: 'QXV0aG9yOmFiY3siZmlyc3ROYW1lIjoiSm9obiIsImxhc3ROYW1lIjoiRG9lIn1hYmM=',
            },
          ],
        },
      });
    });
  });

  describe('node field requests', () => {
    it('uses the default encode/decode', async () => {
      const query = gql`
        query GetNode($id: ID!) {
          node(id: $id) {
            ... on Author {
              __typename
              id
              firstName
              lastName
            }
          }
        }
      `;
      const variables = {
        id: 'QXV0aG9yOnsiZmlyc3ROYW1lIjoiSm9obiIsImxhc3ROYW1lIjoiRG9lIn0=',
      };

      const result = await handleFroidRequest({query, variables});

      expect(result).toEqual({
        data: {
          node: {
            __typename: 'Author',
            id: 'QXV0aG9yOnsiZmlyc3ROYW1lIjoiSm9obiIsImxhc3ROYW1lIjoiRG9lIn0=',
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      });
    });

    it('supports a custom encode/decode', async () => {
      const query = gql`
        query GetNode($id: ID!) {
          node(id: $id) {
            ... on Author {
              __typename
              id
              firstName
              lastName
            }
          }
        }
      `;
      const variables = {
        id: 'QXV0aG9yOmFiY3siZmlyc3ROYW1lIjoiSm9obiIsImxhc3ROYW1lIjoiRG9lIn1hYmM=',
      };
      const decode = (value) => {
        return value.replace(/^abc|abc$/g, '');
      };

      const result = await handleFroidRequest(
        {query, variables},
        {
          decode,
        }
      );

      expect(result).toEqual({
        data: {
          node: {
            __typename: 'Author',
            id: 'QXV0aG9yOmFiY3siZmlyc3ROYW1lIjoiSm9obiIsImxhc3ROYW1lIjoiRG9lIn1hYmM=',
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      });
    });
  });
});
