# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v2.0.1] - 2022-11-22

### Fix

- Sort the key values encoded in an id to ensure they are deterministically
  generated

## [v2.0.0] - 2022-11-22

### Breaking

- @key directive selection in schema generation now picks the first directive
  where fields doesn't specify a nested complex key.

### Fix

- Fix applied to when entities are specified in a nested complex key field, they
  were generated as non-entity types in the Froid schema.
- Fix issue where non-resolvable entity references in Federation 2 were
  processed during Froid schema generation

## [v1.1.0] - 2022-11-22

### Fix

- Support enum generation specified as @key fields.

## [Unreleased]

## [v1.0.1] - 2022-10-10

### Added

- cleanup distributed files when publishing packages

## [v1.0.0] - 2022-10-04

### Added

- Public release
- feat: add better error handling support

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
