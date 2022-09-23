# Open Source Project Template

[![Release](https://img.shields.io/github/v/release/wayfair-incubator/node-froid?display_name=tag)](CHANGELOG.md)
[![Lint](https://github.com/wayfair-incubator/node-froid/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/wayfair-incubator/node-froid/actions/workflows/lint.yml)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.0-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![Maintainer](https://img.shields.io/badge/Maintainer-Wayfair-7F187F)](https://wayfair.github.io)

## About The Project

Provide some information about what the project is/does.

## Getting Started

To get a local copy up and running follow these simple steps.

### Prerequisites

This is an example of how to list things you need to use the software and how to
install them.

- npm

  ```sh
  npm install npm@latest -g
  ```

### Installation

1. Clone the repo

   ```sh
   git clone https://github.com/wayfair-incubator/node-froid.git
   ```

2. Install NPM packages

   ```sh
   npm install
   ```

## Library API

### `handleFroidRequest`

| Parameter Name      | Required | Description                                               | Type                                  | Default                                |
| ------------------- | -------- | --------------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| `request`           | Yes      | The request object passed to the relay subgraph           | see specific properties               |                                        |
| `request.query`     | Yes      | The query string for the request                          | `string`                              |                                        |
| `request.variables` | Yes      | The variables for the request                             | `Record<string, unknown>`             |                                        |
| `encode`            |          | A callback for encoding the object identify key values    | `(string) => string`                  | `(value) => value`                     |
| `decode`            |          | A callback for decoding an object identifier's key values | `(string) => Record<string, unknown>` | `(keyString) => JSON.parse(keyString)` |

Returns `Promise<object[]>`: A promise representing the list of entity objects
containing a relay-spec compliant `id` value.

### `generateFroidSchema`

| Parameter Name             | Required | Description                                                                                           | Type                    | Default                |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------- |
| `subgraphSchemaMap`        | Yes      | A mapping of subgraph names --> subgraph SDLs used to generate the relay object identification schema | `Map<string, string>`   |                        |
| `relayServiceName`         | Yes      | The name of the relay subgraph service                                                                | `string`                |                        |
| `options`                  |          | Optional configuration for schema generation                                                          | see specific properties | `{}`                   |
| `options.contractTags`     |          | A list of supported contract tags                                                                     | `string[]`              | `[]`                   |
| `options.federatedVersion` |          | The version of federation to generate schema for                                                      | `FederationVersion`     | `FederationVersion.V2` |
| `options.typeExceptions`   |          | Types to exclude from `id` field generation                                                           | `string[]`              | `[]`                   |

Returns `DocumentNode[]`: The Relay Object Identification schema

## Usage

Use this space to show useful examples of how a project can be used. Additional
screenshots, code examples and demos work well in this space. You may also link
to more resources.

_For more examples, please refer to the [Documentation](https://example.com) or
the [Wiki](https://github.com/wayfair-incubator/node-froid/wiki)_

## Roadmap

See the [open issues](https://github.com/wayfair-incubator/node-froid/issues)
for a list of proposed features (and known issues).

## Contributing

Contributions are what make the open source community such an amazing place to
learn, inspire, and create. Any contributions you make are **greatly
appreciated**. For detailed contributing guidelines, please see
[CONTRIBUTING.md](CONTRIBUTING.md)

## License

Distributed under the `MIT` License. See `LICENSE` for more information.

## Contact

Your Name - [@markjfaga](https://twitter.com/markjfaga)

Project Link:
[https://github.com/wayfair-incubator/node-froid](https://github.com/wayfair-incubator/node-froid)

## Acknowledgements

This template was adapted from
[https://github.com/othneildrew/Best-README-Template](https://github.com/othneildrew/Best-README-Template).
