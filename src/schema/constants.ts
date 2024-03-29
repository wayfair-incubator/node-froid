import {ConstDirectiveNode, Kind} from 'graphql';

export const FED1_VERSION = 'v1';
export const FED2_DEFAULT_VERSION = 'v2.0';
export const FED2_VERSION_PREFIX = 'v2.';
export const FED2_OPT_IN_URL = 'https://specs.apollo.dev/federation/';
export const ID_FIELD_NAME = 'id';
export const ID_FIELD_TYPE = 'ID';
export const TYPENAME_FIELD_NAME = '__typename';

export enum Directive {
  Extends = '@extends',
  External = '@external',
  InterfaceObject = '@interfaceObject',
  Key = '@key',
  Tag = '@tag',
}

export enum DirectiveName {
  Extends = 'extends',
  External = 'external',
  InterfaceObject = 'interfaceObject',
  Key = 'key',
  Tag = 'tag',
}

export enum KeyDirectiveArgument {
  Fields = 'fields',
}

export const CONTRACT_DIRECTIVE_NAME = DirectiveName.Tag;
export const EXTERNAL_DIRECTIVE = DirectiveName.External;
export const EXTENDS_DIRECTIVE = DirectiveName.Extends;
export const TAG_DIRECTIVE = DirectiveName.Tag;
export const KEY_DIRECTIVE = DirectiveName.Key;
export const INTERFACE_OBJECT_DIRECTIVE = DirectiveName.InterfaceObject;

export const EXTERNAL_DIRECTIVE_AST = {
  kind: Kind.DIRECTIVE,
  name: {kind: Kind.NAME, value: DirectiveName.External},
} as ConstDirectiveNode;

export const DEFAULT_FEDERATION_LINK_IMPORTS = [
  Directive.Key,
  Directive.Tag,
  Directive.External,
];
