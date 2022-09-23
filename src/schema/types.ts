import {
  ConstDirectiveNode,
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
} from 'graphql';

export type ObjectTypeNode = ObjectTypeExtensionNode | ObjectTypeDefinitionNode;
export type KeyMappingRecord = {[key: string]: KeyMappingRecord | null};
export type ValidKeyDirective = {
  keyDirective: ConstDirectiveNode;
  keyMappingRecord: KeyMappingRecord;
};
export type RelayObjectType = {
  includeInUnion: boolean;
  node: ObjectTypeNode;
};
