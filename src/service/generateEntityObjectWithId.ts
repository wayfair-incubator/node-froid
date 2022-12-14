import {toGlobalId} from 'graphql-relay';
import {RepresentationObject, GraphQLResponse, EncodeCallback} from './types';

export type GenerateEntityObjectsWithIdOptions = {
  encode?: EncodeCallback;
};

export type GenerateEntityObjectWithIdArguments = {
  representations: RepresentationObject[];
};

/**
 * Recursively sorts the keys of an object
 *
 * @param {Record<string, any>} unordered - An object
 * @returns {Record<string, any>} An object with determinisitcally sorted keys
 */
function sortKeys(unordered: Record<string, any>) {
  const ordered = Object.keys(unordered)
    .sort()
    .reduce((obj, key) => {
      obj[key] = unordered[key];

      // sort child keys if the key value is an object
      if (typeof obj[key] === 'object') {
        obj[key] = sortKeys(obj[key]);
      }

      return obj;
    }, {});

  return ordered;
}

/**
 * Generates a Relay-spec complient Entity Object with an `id` field
 *
 * @param {object} object - Container object injected into the generateEntityObjectWithId function
 * @param {object[]} object.representations - List of entity objects that we need to generate relay-spec compliant `id` values for
 * @param {object} options - Optional options for configuring generateEntityObjectWithId
 * @param {encoderCallback} options.encode - Encoding method used to generate the key arguments
 * @returns {Promise<Array.<object>>} Promise representing the list of entity objects with a relay-spec compliant `id` value
 */
export function generateEntityObjectWithId(
  {representations}: GenerateEntityObjectWithIdArguments,
  options?: GenerateEntityObjectsWithIdOptions
): Promise<GraphQLResponse> {
  const encode = options?.encode || ((value) => value);

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

        // sort keys to ensure id value is deterministic
        const sortedKeys = sortKeys(keys);

        // Generate a string we can use to generate a relay-spec compliant global identifier
        const keyValue = JSON.stringify(sortedKeys);

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
 * @returns {string} The encoded string
 */
