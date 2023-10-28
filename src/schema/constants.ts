import {ConstDirectiveNode, Kind} from 'graphql';

export const FED1_VERSION = 'v1';
export const FED2_DEFAULT_VERSION = 'v2.0';
export const FED2_VERSION_PREFIX = 'v2.';
export const ID_FIELD_NAME = 'id';
export const ID_FIELD_TYPE = 'ID';
export const EXTERNAL_DIRECTIVE = 'external';
export const EXTENDS_DIRECTIVE = 'extends';
export const TAG_DIRECTIVE = 'tag';
export const KEY_DIRECTIVE = 'key';
export const INTERFACE_OBJECT_DIRECTIVE = 'interfaceObject';
export const TYPENAME_FIELD_NAME = '__typename';
export const CONTRACT_DIRECTIVE_NAME = 'tag';
export const EXTERNAL_DIRECTIVE_AST = {
  kind: Kind.DIRECTIVE,
  name: {kind: Kind.NAME, value: EXTERNAL_DIRECTIVE},
} as ConstDirectiveNode;
export enum KeyDirectiveArgument {
  Fields = 'fields',
}
