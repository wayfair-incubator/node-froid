# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v3.2.3] - 2025-09-29

### Fix

- The `FroidSchema` class does not include all shareable value type fields found
  across subgraphs.

## [v3.2.2] - 2024-08-20

### Fixed

- Improves the error message surfaced in cases where FROID generates an empty
  key.

## [v3.2.1] - 2024-04-29

### Fixed

- Fixes a case where sub-entity keys failed to roll up properly to referencing
  entity keys when a value type was in-between.

## [v3.2.0] - 2024-03-22

### Added

- Added a new option for an `omittedEntityQualifier` to re-evaluate and include
  entities that may have been erroneously omitted by the `nodeQualifier`. This
  provided the flexibility to fix missing entities while preserving previous
  behavior

## [v3.1.1] - 2024-02-15

### Fix

- The `FroidSchema` class does not include all enum values found across
  subgraphs when enum definitions differ.

## [v3.1.0] - 2023-11-09

- Added a new `FroidSchema` class to test the next version of FROID schema
  generation.
- FROID schema is now sorted (both new and old version) and include
  documentation string.

## [v3.0.1] - 2023-08-17

### Fix

- Applying the `@tag` directive to an entity's `id` field could fail if the only
  `@tag` directive in the entity was applied to a field argument. This fix now
  considers field argument `@tag`s as well as field `@tag`s when selecting the
  `id` field's `@tag`(s).

## [v3.0.0] - 2023-08-16

### Breaking

- The federation version is no longer provided as an enum value. It must now be
  provided as a string of either `v1` or a valid `v2.x` version (examples:
  `v2.1`, `v2.3`, etc.).
- Fixes to complex key schema generation and federation v1 value type schema
  generation could effect the generated schema. Please carefully compare schema
  generated with the previous version against schema generated after upgrading.

### Added

- Added support for a custom key sorter. This allows for a custom key preference
  to be applied prior to selecting the first key.
- Added support for explicitly defining the federation version, either `v1` or a
  valid `v2.x` version (examples: `v2.1`, `v2.3`, etc.)

### Fix

- In some cases, if a complex key included a nested entity but was not using the
  entity's key, schema generation would fail to include the nested entity's key
  field(s).
- In some cases, if a type appeared in multiple subgraphs and was being used in
  multiple complex keys but with different field selections, not all fields
  would be included in the generated schema.
- When generating Federation v1 schema, value types would erroneously receive
  the `extend` keyword and their fields would erroneously receive the
  `@external` directive.

## [v2.2.0] - 2023-06-27

### Added

- Add support for a custom schema node qualifier when generating node-relay
  schema so users can determine whether or not to include an entity in the
  generated node-relay schema based on custom criteria

## [v2.1.0] - 2023-06-01

### Added

- Omit `@interfaceObject`s prior to generating node-relay schema to avoid
  breaking federation composition

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
