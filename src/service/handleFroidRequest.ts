import {generateEntityObjectWithId} from './generateEntityObjectWithId';
import {generateEntityObjectsById} from './generateEntityObjectsById';
import {
  GraphQLResponse,
  GraphQLRequest,
  EncodeCallback,
  DecodeCallback,
} from './types';

/**
 * Handler for a Federated Relay Global Object Identifier Request
 *
 * @param {object} request - Request object representing the incoming request
 * @param {string} request.query - Query document being executed
 * @param {object} request.variables - Variables used to execute the request
 * @param {encoderCallback} encode - Encoding method used to generate the key arguments
 * @param {decoderCallback} decode - Decoding method used to derive the key arguments
 * @returns {Promise<object[]>} Promise representing the list of entity objects with a relay-spec compliant `id` value
 */
export function handleFroidRequest(
  request: GraphQLRequest,
  encode?: EncodeCallback,
  decode?: DecodeCallback
): GraphQLResponse {
  let result;

  // If we are executing an entity reference resolver
  // https://www.apollographql.com/docs/federation/entities/#2-define-a-reference-resolver
  if (request.variables && request.variables.representations) {
    result = generateEntityObjectWithId({
      representations: request.variables.representations,
      encode,
    });
  } else {
    // we need to generate ids for entities
    result = generateEntityObjectsById({
      query: request.query,
      variables: request.variables,
      decode,
    });
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
