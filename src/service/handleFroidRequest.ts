import {
  generateEntityObjectWithId,
  GenerateEntityObjectsWithIdOptions,
} from './generateEntityObjectWithId';
import {
  generateEntityObjectsById,
  GenerateEntityObjectsByIdOptions,
} from './generateEntityObjectsById';
import {GraphQLResponse, GraphQLRequest} from './types';

export type HandleFroidRequestOptions = GenerateEntityObjectsWithIdOptions &
  GenerateEntityObjectsByIdOptions;

/**
 * Handler for a Federated Relay Global Object Identifier Request
 *
 * @param {object} request - Request object representing the incoming request
 * @param {string} request.query - Query document being executed
 * @param {object} request.variables - Variables used to execute the request
 * @param {object} options - Configuration options available to handleFroidRequest. See generateEntityObjectsById & generateEntityObjectWithId for additional details
 * @returns {Promise<object[]>} Promise representing the list of entity objects with a relay-spec compliant `id` value
 */
export function handleFroidRequest(
  request: GraphQLRequest,
  options: HandleFroidRequestOptions = {}
): GraphQLResponse {
  let result;

  // If we are executing an entity reference resolver
  // https://www.apollographql.com/docs/federation/entities/#2-define-a-reference-resolver
  if (request.variables && request.variables.representations) {
    result = generateEntityObjectWithId(
      {
        representations: request.variables.representations,
      },
      options
    );
  } else {
    // we need to generate ids for entities
    result = generateEntityObjectsById(
      {
        query: request.query,
        variables: request.variables,
      },
      options
    );
  }

  return result;
}

/**
 * This callback is used to customized the encoding algorithm used when generating the key values of a global identifier
 *
 * @callback encoderCallback
 * @param {string} Keys that need to be encoded
 */

/**
 * This callback is used to customized the decoding algorithm used when generating the key values of a global identifier
 *
 * @callback decoderCallback
 * @param {string} Keys that need to be decoded
 */
