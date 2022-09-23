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

export type EntitiesResponse = {
  data: any;
};

export type NodeResponse = {
  data: any;
};

export type GraphQLResponse = {
  data: any;
};

export type GraphQLRequest = {
  query: string;
  variables?: Record<string, any>;
};

export type EncodeCallback = (string) => string;
export type DecodeCallback = (string) => Record<string, any>;
