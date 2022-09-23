export const isRootType = (nodeNameValue: string): boolean =>
  ['Query', 'Mutation', 'Subscription'].includes(nodeNameValue);
