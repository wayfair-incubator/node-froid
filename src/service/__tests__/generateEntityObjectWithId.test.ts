import {generateEntityObjectWithId} from '../generateEntityObjectWithId';
import {fromGlobalId} from 'graphql-relay';

describe('generateEntityObjectWithId', () => {
  it('returns an empty array when handed an empty array', async () => {
    const representations = [];

    const result = await generateEntityObjectWithId({representations});

    expect(result).toEqual({data: {_entities: []}});
  });

  it('returns an encoded id for all representations passed', async () => {
    const representations = [
      {__typename: 'Author', firstName: 'John', lastName: 'Doe'},
      {__typename: 'Author', firstName: 'Jane', lastName: 'Doe'},
    ];

    const result = await generateEntityObjectWithId({representations});

    expect(result).toEqual({
      data: {
        _entities: [
          {
            __typename: 'Author',
            id: 'QXV0aG9yOnsiZmlyc3ROYW1lIjoiSm9obiIsImxhc3ROYW1lIjoiRG9lIn0=',
          },
          {
            __typename: 'Author',
            id: 'QXV0aG9yOnsiZmlyc3ROYW1lIjoiSmFuZSIsImxhc3ROYW1lIjoiRG9lIn0=',
          },
        ],
      },
    });
    const id1 = fromGlobalId(result.data._entities[0].id);
    expect(id1).toEqual({
      id: '{"firstName":"John","lastName":"Doe"}',
      type: 'Author',
    });
    const id2 = fromGlobalId(result.data._entities[1].id);
    expect(id2).toEqual({
      id: '{"firstName":"Jane","lastName":"Doe"}',
      type: 'Author',
    });
  });

  it('allows for use of a custom encode', async () => {
    const representations = [
      {__typename: 'Author', firstName: 'John', lastName: 'Doe'},
    ];
    const encode = (value) => `abc${value}abc`;

    const result = await generateEntityObjectWithId({representations, encode});

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
    const id = fromGlobalId(result.data._entities[0].id);
    expect(id).toEqual({
      id: 'abc{"firstName":"John","lastName":"Doe"}abc',
      type: 'Author',
    });
  });
});
