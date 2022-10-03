import {DocumentNode} from 'graphql/language';

export type RepresentationObject = {
  __typename: string;
};

export type EntityObject = {
  __typename: string;
  id: string;
};

export type EntitiesResponseData = {
  _entities: [EntityObject];
};

export type GraphQLResponse = {
  data: any;
};

export type GraphQLRequest = {
  query: string;
  variables?: Record<string, any>;
};

export type FroidCache = {
  get: (string) => DocumentNode;
  set: (string, DocumentNode) => void;
};

export type EncodeCallback = (string) => string;
export type DecodeCallback = (string) => string;
