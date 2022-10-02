# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### TBA

## [v0.2.0] - 2022-10-02

### Breaking

- Updated `handleFroidRequest.options.decode` API from `string -> object` to
  `string -> string` to remove inconsistency across the encode/decode APIs. Now
  all JSON parsing happens in the core implementation.

## [v0.1.1] - 2022-10-01

### Added

- Properly export typescript types in published package
- Include `dist` directory in published package

## [v0.1.0] - 2022-09-28

### Added

- Add initial library API:
  - `handleFroidRequest`: Handles both `id` generation as well as `node` field
    parsing of Object Identification requests in Federation.
  - `generateFroidSchema`: Generates schema for the Froid subgraph, complete
    with Federation 1 & 2 support, as well as Apollo contracts!
