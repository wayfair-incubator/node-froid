import {toGlobalId} from 'graphql-relay';
import {RepresentationObject, EntitiesResponse, EncodeCallback} from './types';

export type GenerateEntityObjectWithIdArguments = {
  representations: RepresentationObject[];
  encode?: EncodeCallback;
};

/**
 * Generates a Relay-spec complient Entity Object with an `id` field
 *
 * @param {object} object - Container object injected into the generateEntityObjectWithId function
 * @param {Array.<object>} object.representations - List of entity objects that we need to generate relay-spec compliant `id` values for
 * @param {encoderCallback} object.encode - Encoding method used to generate the key arguments
 * @returns {Promise<Array.<object>>} Promise representing the list of entity objects with a relay-spec compliant `id` value
 */
export function generateEntityObjectWithId({
  representations,
  encode = (value) => value,
}: GenerateEntityObjectWithIdArguments): Promise<EntitiesResponse> {
  // Need to return a promise to the gateway to simulate an async request
  // The resolved result needs to look like a valid GraphQL JSON response
  // as if we have queried a real subgraph, so we start with a `data` property
  // that continues the data requested as outlined inline below.
  return Promise.resolve({
    data: {
      // return a set of _entities. For more information on this field and how
      // federation across subgraphs work, please see
      // https://www.apollographql.com/docs/federation/entities/#the-query-plan
      //
      // To generate this, we need to iterate over each `representation`, which represents
      // a federated entity in our graph. For each of these, this service is
      // responsible for generating and returning the `id` for that extended entity
      _entities: representations.map((representation) => {
        // Extract out the type name from the rest of the arguments
        // We will be left with only the @key fields for a federated entity
        const {__typename, ...keys} = representation;

        // Generate a string we can use to generate a relay-spec compliant global identifier
        const keyValue = JSON.stringify(keys);

        // Return the `id` field for the type provided
        return {
          __typename,
          id: toGlobalId(__typename, encode(keyValue)),
        };
      }),
    },
  });
}

/**
 * This callback is used to customized the encoding algorithm used when generating the key values of a global identifier
 *
 * @callback encoderCallback
 * @param {string} Keys that need to be encoded
 */
