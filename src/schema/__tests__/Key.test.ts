import {Key} from '../Key';

describe('Key class', () => {
  it('handles duplicate key fields', () => {
    const key = new Key('Book', 'bookId bookId');
    expect(key.toString()).toEqual('bookId');
  });

  it('handles new field branches when merging keys', () => {
    const first = new Key('Book', 'author { name }');
    const second = new Key('Book', 'genre { name }');
    first.merge(second);
    expect(first.toString()).toEqual(
      'author { __typename name } genre { __typename name }'
    );
  });
});
