# Open Source Project Template

[![Release](https://img.shields.io/github/v/release/wayfair-incubator/node-froid?display_name=tag)](CHANGELOG.md)
[![Lint](https://github.com/wayfair-incubator/node-froid/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/wayfair-incubator/node-froid/actions/workflows/lint.yml)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.0-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![Maintainer](https://img.shields.io/badge/Maintainer-Wayfair-7F187F)](https://wayfair.github.io)

## About The Project

### The problem

There isn't good support for the Relay's [Object Identification] spec in the
Federated GraphQL ecosystem. This makes it difficult to support common patterns
used to refrech objects from your graph to power things like cache TTLs and
cache-miss hydration.

### The solution

`@wayfair/node-froid` provides two key pieces of functionality:

- **id processing**: a solution that can be used to run inline as part of a
  custom [Data Source] or as a completely separate subgraph (recommended)
  dedicated to service your object identification implementation .
- **schema generation**: a schema generation script that reflects on all
  subgraphs in your federated graph and generates a valid relay object
  identification schema.
  - Can run in Federation v1 or v2 mode
  - Supports [contracts]!

## Getting Started

This module is distributed via [npm][npm] which is bundled with [node][node] and
should be installed as one of your project's `devDependencies`:

```
npm install @wayfair/node-froid
```

or

for installation via [yarn][yarn]

```
yarn add @wayfair/node-froid
```

This library has `peerDependencies` listings for `graphql` and `graphql-relay`.

## Library API

### `handleFroidRequest`

| Parameter Name      | Required | Description                                               | Type                                  | Default                                |
| ------------------- | -------- | --------------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| `request`           | Yes      | The request object passed to the relay subgraph           | see specific properties               |                                        |
| `request.query`     | Yes      | The query string for the request                          | `string`                              |                                        |
| `request.variables` | Yes      | The variables for the request                             | `Record<string, unknown>`             |                                        |
| `options`           |          | Configuration options available to `handleFroidRequest`   | see specific properties               | `{}`                                   |
| `options.encode`    |          | A callback for encoding the object identify key values    | `(string) => string`                  | `(value) => value`                     |
| `options.decode`    |          | A callback for decoding an object identifier's key values | `(string) => Record<string, unknown>` | `(keyString) => JSON.parse(keyString)` |
| `options.cache`     |          | Cache to use to avoid re-parsing query documents          | `FroidCache`                          |                                        |

Returns `Promise<object[]>`: A promise representing the list of entity objects
containing a relay-spec compliant `id` value.

### `generateFroidSchema`

| Parameter Name             | Required | Description                                                                                           | Type                    | Default                |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------- |
| `subgraphSchemaMap`        | Yes      | A mapping of subgraph names --> subgraph SDLs used to generate the relay object identification schema | `Map<string, string>`   |                        |
| `relayServiceName`         | Yes      | The name of the relay subgraph service                                                                | `string`                |                        |
| `options`                  |          | Optional configuration for schema generation                                                          | see specific properties | `{}`                   |
| `options.contractTags`     |          | A list of supported [contract][contracts] tags                                                        | `string[]`              | `[]`                   |
| `options.federatedVersion` |          | The version of federation to generate schema for                                                      | `FederationVersion`     | `FederationVersion.V2` |
| `options.typeExceptions`   |          | Types to exclude from `id` field generation                                                           | `string[]`              | `[]`                   |

Returns `DocumentNode[]`: The Relay Object Identification schema

## Usage

### `id` Processing

#### Custom GraphQL Gateway Datasource

```ts
import {GraphQLDataSourceProcessOptions} from '@apollo/gateway';
import {GraphQLResponse} from 'apollo-server-types';
import {handleRelayRequest} from '@wayfair/node-froid';
import {Context} from './path/to/your/ContextType';

class RelayNodeGraphQLDataSource {
  process({
    request,
  }: Pick<
    GraphQLDataSourceProcessOptions<Context>,
    'request'
  >): Promise<GraphQLResponse> {
    return await handleRelayRequest(request);
  }
}
```

#### Custom GraphQL Gateway Datasource w/Encryption

```ts
// Datasource Implementation
import {GraphQLDataSourceProcessOptions} from '@apollo/gateway';
import {GraphQLResponse} from 'apollo-server-types';
import {
  DecodeCallback,
  EncodeCallback,
  handleRelayRequest,
} from '@wayfair/node-froid';
// You only really need this if you are using context
import {Context} from './path/to/your/ContextType';
// Used to determine which encoder to use
import {FeatureToggleManager} from './path/to/your/FeatureToggleManager';

// Interface we need to match properly encode key values
interface Encoder {
  encode: EncodeCallback;
  decode: DecodeCallback;
}

class RelayNodeGraphQLDataSource {
  private encoder1: Encoder;
  private encoder2: Encoder;

  // Take two encoders to support live key rotation
  constructor(encoder1: Encoder, encoder2, Encoder) {
    this.encoder1 = encoder1;
    this.encoder2 = encoder2;
  }

  process({
    request,
  }: Pick<
    GraphQLDataSourceProcessOptions<Context>,
    'request'
  >): Promise<GraphQLResponse> {
    const encoder = FeatureToggleManager.useEncoder1()
      ? this.encoder1
      : this.encoder2;

    return await handleRelayRequest(request, {...encoder});
  }
}

// Sample Encoder
import crypto from 'crypto';
import {DecodeCallback, EncodeCallback} from '@wayfair/node-froid';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

// Interface we need to match properly encode key values
interface Encoder {
  encode: EncodeCallback;
  decode: DecodeCallback;
}

type CreateEncoderArguments = {
  base64InitializationVector: string;
  base64EncryptionKey: string;
};

export class CustomEncoder implements Encoder {
  private iv: Buffer;
  private key: Buffer;

  constructor({
    base64InitializationVector,
    base64EncryptionKey,
  }: CreateEncoderArguments) {
    this.iv = Buffer.from(base64InitializationVector, 'base64');
    this.key = Buffer.from(base64EncryptionKey, 'base64');
  }

  public encode(value: string): string {
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      this.key,
      this.iv
    );
    const encryptedValue = cipher.update(value);
    const encryptedBuffer = Buffer.concat([encryptedValue, cipher.final()]);

    return encryptedBuffer.toString('base64');
  }

  public decode(value: string): object {
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      this.key,
      this.iv
    );
    const decryptedValue = decipher.update(Buffer.from(value, 'base64'));
    const decryptedBuffer = Buffer.concat([decryptedValue, decipher.final()]);

    const text = decryptedBuffer.toString();

    return JSON.parse(text);
  }
}
```

#### Custom GraphQL Gateway Datasource w/Cache

```ts
import {GraphQLDataSourceProcessOptions} from '@apollo/gateway';
import {GraphQLResponse} from 'apollo-server-types';
import {handleRelayRequest} from '@wayfair/node-froid';
import {Context} from './path/to/your/ContextType';
import LRU from 'lru-cache';

const cache = new LRU({max: 500});

class RelayNodeGraphQLDataSource {
  process({
    request,
  }: Pick<
    GraphQLDataSourceProcessOptions<Context>,
    'request'
  >): Promise<GraphQLResponse> {
    return await handleRelayRequest(request, {
      cache,
    });
  }
}
```

#### Subgraph w/Express Server

```ts
import express from 'express';
import {handleRelayRequest} from '@wayfair/node-froid';

const app = express();

// No need to run a full GraphQL server.
// Avoid the additional overhead and manage the route directly instead!
app.post('/graphql', async (req, res) => {
  const result = await handleRelayRequest(req);
  res.send(result);
});
```

### Schema Generation

#### Basic Script

```ts
import cp from 'child_process';
import {generateRelayServiceSchema} from '@wayfair/node-froid';
// You have to provide this. Apollo's public API should provide the ability to extract out subgraph SDL
import {getFederatedSchemas} from './getFederatedSchemas';

const relayServiceName = 'relay-object-identification-service';

// Map<string, string> where the key is the subgraph name, and the value is the SDL schema
const subgraphSchemaMap = await getFederatedSchemas(variant);

const schema = await generateRelayServiceSchema(subgraphSchemaMap, relayServiceName);
const publishCommand = `subgraph publish your-graph@your-variant --name '${relayServiceName}' --routing-url 'https://path/to/service' --schema -`;

cp.spawnSync(
  'node',
  [
    // Assumes you have @apollo/rover installed as a dependency of your app
    'node_modules/@apollo/rover/run.js',
    ...publishCommand.split(' '),
    '--output',
    'json',
    '--client-timeout=150',
  ],
  {
    input: schema,
    env: {
      APOLLO_KEY: '<your apollo key read from a secret>'),
    },
  }
);
```

## Roadmap

See the [open issues](https://github.com/wayfair-incubator/node-froid/issues)
for a list of proposed features (and known issues).

## Contributing

Contributions are what make the open source community such an amazing place to
learn, inspire, and create. Any contributions you make are **greatly
appreciated**. For detailed contributing guidelines, please see
[CONTRIBUTING.md](CONTRIBUTING.md)

## License

Distributed under the `MIT` License. See [`LICENSE`][license] for more
information.

## Contact

Your Name - [@markjfaga](https://twitter.com/markjfaga)

Project Link:
[https://github.com/wayfair-incubator/node-froid](https://github.com/wayfair-incubator/node-froid)

## Acknowledgements

This template was adapted from
[https://github.com/othneildrew/Best-README-Template](https://github.com/othneildrew/Best-README-Template).

[npm]: https://www.npmjs.com/
[yarn]: https://classic.yarnpkg.com
[node]: https://nodejs.org
[license]: https://github.com/wayfair-incubator/node-froid/blob/main/LICENSE
[object identification]:
  https://relay.dev/docs/guides/graphql-server-specification/#object-identification
[data source]:
  https://www.apollographql.com/docs/apollo-server/data/data-sources/
[contracts]: https://www.apollographql.com/docs/studio/contracts/
