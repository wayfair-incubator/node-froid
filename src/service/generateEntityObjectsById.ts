import {StringValueNode} from 'graphql/language/ast';
import {Kind} from 'graphql/language/kinds';
import {GraphQLError, parse, visit} from 'graphql';
import {fromGlobalId} from 'graphql-relay';
import {FroidCache, DecodeCallback, GraphQLResponse} from './types';

const NODE = 'node';

/**
 * Extracts an `id` value from a GQL AST node
 *
 * @param {object} field - AST node representing the parsed field
 * @param {object} variables - Variables used to execute the request
 * @returns {string|null} The id field value
 */
function findIdValue(field, variables): string | null {
  // extract out the value for the `id` argument to the `node` Query field
  const idArg = field?.arguments?.find((a) => a.name.value == 'id');

  // Base on the type of node we are dealing with, extract out the value
  // of the `id` argument
  switch (idArg?.value?.kind) {
    case Kind.VARIABLE:
      // reach into the variables object and pull out the correct argument value
      return variables?.[idArg.value.name.value];
    case Kind.STRING:
      // The value was passed directly in the query string
      // Extract it off of the node.
      const value = idArg.value as StringValueNode;
      return value.value;
    default:
      // It should be impossible to hit these cases becuase the graph
      // is strongly typed.
      throw new Error(
        `'${idArg.value.kind}' is not supported by the node field`
      );
  }
}

export type GenerateEntityObjectsByIdOptions = {
  decode?: DecodeCallback;
  cache?: FroidCache;
};

export type GenerateEntityObjectsByIdArguments = {
  query: string;
  variables?: Record<string, any>;
  options?: GenerateEntityObjectsByIdOptions;
};

/**
 * Generates a Relay-spec complient Entity Object with an `id` field
 *
 * @param {object} object - Container object injected into the generateEntityObjectsById function
 * @param {string} object.query - Query document being executed
 * @param {object} object.variables - Variables used to execute the request
 * @param {object} options - Optional options for configuring generateEntityObjectsById
 * @param {decoderCallback} options.decode - Decoding method used to derive the key arguments
 * @param {FroidCache} options.cache - Cache to use to avoid re-parsing query documents
 * @returns {Promise<Array.<object>>} Promise representing the list of entity objects with a relay-spec compliant `id` value
 */
export function generateEntityObjectsById(
  {query, variables}: GenerateEntityObjectsByIdArguments,
  options?: GenerateEntityObjectsByIdOptions
): Promise<GraphQLResponse> {
  const decode = options?.decode || ((keyString) => keyString);

  // Parse the query document so that we can visit each node
  // Cache it to avoid future future parsing overhead
  let parsedQuery = options?.cache?.get(query);

  if (!parsedQuery) {
    try {
      parsedQuery = parse(query);
    } catch (error) {
      const message =
        // @ts-ignore we protect against message property not existing and provide a fallback instead
        (typeof error === 'object' && error?.message) || 'Error parsing schema';

      return Promise.resolve({
        data: null,
        errors: [{message, query}],
      });
    }
    options?.cache?.set(query, parsedQuery);
  }

  // Used to build up an in-memory response for the incoming request
  const response: GraphQLResponse = {data: {}};

  visit(parsedQuery, {
    Field(node) {
      // If we are currently processing the `node` field node
      if (node.name.value == NODE) {
        // We need to track the client-side alias used to ensure we return the
        // correct key in our data response. We use the actual `node` name if
        // there is no alias (cause you get what you ask for ;)!)
        const responseName = node.alias ? node.alias.value : node.name.value;

        let id;

        try {
          id = findIdValue(node, variables);

          // Throw an error if we didn't get a non-empty string value for the id
          if (!id) throw new GraphQLError('Unable to parse id from operation');

          // Unwrap the relay identifier
          const {type: __typename, id: encodedId} = fromGlobalId(id);

          // Create the object we want to return in our response
          let relayNode = {__typename, id};

          // Get the keys object based on the current decoding algorithm
          const idJsonString = decode(encodedId);
          const keys = JSON.parse(idJsonString);

          // Update the node to include all of the key values for the node
          // in order to ensure we are returning a federatable object that the
          // gateway can process successfully.
          //
          // If we didn't do this, the @key values that are required wouldn't be
          // provided to the subgraph service that needs to resolve the request to
          // provide the rest of the values on for this query type.
          relayNode = {...relayNode, ...keys};

          // Add the node object to the response
          //
          // This allows us to support 'node' queries w/multiple inline fragments
          response.data[responseName] = relayNode;
        } catch (error) {
          const message =
            // @ts-ignore we protect against message property not existing and provide a fallback instead
            (typeof error === 'object' && error?.message) ||
            'Error generating entity object';

          response.errors ||= [];
          response.errors.push({message, query, id});
          response.data[responseName] = null;
        }
      }
    },
  });

  // Need to return a promise to the gateway to simulate an async request
  return Promise.resolve(response);
}

/**
 * This callback is used to customized the decoding algorithm used when generating the key values of a global identifier
 *
 * @callback decoderCallback
 * @param {string} Keys that need to be decoded
 * @returns {string} The decoded string
 */
