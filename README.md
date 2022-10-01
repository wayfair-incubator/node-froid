# `node-froid`: NodeJS - Federated Relay Object Identification

[![Release](https://img.shields.io/github/v/release/wayfair-incubator/node-froid?display_name=tag)](CHANGELOG.md)
[![Lint](https://github.com/wayfair-incubator/node-froid/actions/workflows/validate.yml/badge.svg?branch=main)](https://github.com/wayfair-incubator/node-froid/actions/workflows/validate.yml)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.0-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![license: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Maintainer](https://img.shields.io/badge/Maintainer-Wayfair-7F187F)](https://wayfair.github.io)

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [About The Project](#about-the-project)
  - [The problem](#the-problem)
  - [The solution](#the-solution)
- [Getting Started](#getting-started)
- [Library API](#library-api)
  - [`handleFroidRequest`](#handlefroidrequest)
  - [`generateFroidSchema`](#generatefroidschema)
- [Usage](#usage)
  - [`id` Processing](#id-processing)
    - [Custom GraphQL Gateway Datasource](#custom-graphql-gateway-datasource)
    - [Custom GraphQL Gateway Datasource w/Encryption](#custom-graphql-gateway-datasource-wencryption)
    - [Custom GraphQL Gateway Datasource w/Cache](#custom-graphql-gateway-datasource-wcache)
    - [Subgraph w/Express Server](#subgraph-wexpress-server)
  - [Schema Generation](#schema-generation)
    - [Basic Script](#basic-script)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)
- [Acknowledgements](#acknowledgements)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

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
| `request`           | Yes      | The request object passed to the froid subgraph           | see specific properties               |                                        |
| `request.query`     | Yes      | The query string for the request                          | `string`                              |                                        |
| `request.variables` | Yes      | The variables for the request                             | `Record<string, unknown>`             |                                        |
| `options`           |          | Configuration options available to `handleFroidRequest`   | see specific properties               | `{}`                                   |
| `options.encode`    |          | A callback for encoding the object identify key values    | `(string) => string`                  | `(value) => value`                     |
| `options.decode`    |          | A callback for decoding an object identifier's key values | `(string) => Record<string, unknown>` | `(keyString) => JSON.parse(keyString)` |
| `options.cache`     |          | Cache to use to avoid re-parsing query documents          | `FroidCache`                          |                                        |

Returns `Promise<object[]>`: A promise representing the list of entity objects
containing a relay-spec compliant `id` value.

### `generateFroidSchema`

| Parameter Name             | Required | Description                                                                     | Type                    | Default                |
| -------------------------- | -------- | ------------------------------------------------------------------------------- | ----------------------- | ---------------------- |
| `subgraphSchemaMap`        | Yes      | A mapping of subgraph names --> subgraph SDLs used to generate the froid schema | `Map<string, string>`   |                        |
| `froidSubgraphName`        | Yes      | The name of the relay subgraph service                                          | `string`                |                        |
| `options`                  |          | Optional configuration for schema generation                                    | see specific properties | `{}`                   |
| `options.contractTags`     |          | A list of supported [contract][contracts] tags                                  | `string[]`              | `[]`                   |
| `options.federatedVersion` |          | The version of federation to generate schema for                                | `FederationVersion`     | `FederationVersion.V2` |
| `options.typeExceptions`   |          | Types to exclude from `id` field generation                                     | `string[]`              | `[]`                   |

Returns `DocumentNode[]`: The froid schema

## Usage

### `id` Processing

#### Custom GraphQL Gateway Datasource

```ts
import {GraphQLDataSourceProcessOptions} from '@apollo/gateway';
import {GraphQLResponse} from 'apollo-server-types';
import {handleFroidRequest} from '@wayfair/node-froid';
import {Context} from './path/to/your/ContextType';

class FroidDataSource {
  process({
    request,
  }: Pick<
    GraphQLDataSourceProcessOptions<Context>,
    'request'
  >): Promise<GraphQLResponse> {
    return await handleFroidRequest(request);
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
  handleFroidRequest,
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

class FroidLDataSource {
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

    return await handleFroidRequest(request, {...encoder});
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
import bodyParser from 'body-parser';
import {handleFroidRequest} from '@wayfair/node-froid';

const port = process.env.PORT || 5000;

const app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

// No need to run a full GraphQL server.
// Avoid the additional overhead and manage the route directly instead!
app.post('/graphql', async (req, res) => {
  const result = await handleFroidRequest(req.body);
  res.send(result);
});

app.listen(port, () => {
  console.log(`Froid subgraph listening on port ${port}`);
});
```

### Schema Generation

#### Basic Script

```ts
import fs from 'fs';
import {print} from 'graphql';
import {generateFroidSchema} from '@wayfair/node-froid';
// You have to provide this. Apollo's public API should provide the ability to extract out subgraph SDL
import {getFederatedSchemas} from './getFederatedSchemas';

const froidSubgraphName = 'froid-service';
const variant = 'current';

// Map<string, string> where the key is the subgraph name, and the value is the SDL schema
const subgraphSchemaMap = getFederatedSchemas(variant);

const schemaAst = generateFroidSchema(subgraphSchemaMap, froidSubgraphName);

// persist results to a file to use with rover publish
fs.writeFileSync('schema.graphql', print(schemaAst));
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

- [@markjfaga](https://twitter.com/markjfaga)

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
