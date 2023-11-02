import {
  ASTNode,
  ArgumentNode,
  DefinitionNode,
  DirectiveDefinitionNode,
  DirectiveNode,
  DocumentNode,
  EnumTypeDefinitionNode,
  EnumTypeExtensionNode,
  EnumValueDefinitionNode,
  FieldDefinitionNode,
  InputObjectTypeDefinitionNode,
  InputObjectTypeExtensionNode,
  InputValueDefinitionNode,
  InterfaceTypeDefinitionNode,
  InterfaceTypeExtensionNode,
  Kind,
  NamedTypeNode,
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  ScalarTypeDefinitionNode,
  ScalarTypeExtensionNode,
  UnionTypeDefinitionNode,
  UnionTypeExtensionNode,
} from 'graphql';
import {ID_FIELD_NAME} from './constants';

type NamedNode =
  | ArgumentNode
  | DirectiveNode
  | DirectiveDefinitionNode
  | EnumTypeDefinitionNode
  | EnumTypeExtensionNode
  | EnumValueDefinitionNode
  | FieldDefinitionNode
  | InputObjectTypeDefinitionNode
  | InputObjectTypeExtensionNode
  | InputValueDefinitionNode
  | InterfaceTypeDefinitionNode
  | InterfaceTypeExtensionNode
  | NamedTypeNode
  | ObjectTypeDefinitionNode
  | ObjectTypeExtensionNode
  | ScalarTypeDefinitionNode
  | ScalarTypeExtensionNode
  | UnionTypeDefinitionNode
  | UnionTypeExtensionNode;

const NamedStandaloneNodeKinds = [
  Kind.SCALAR_TYPE_DEFINITION,
  Kind.SCALAR_TYPE_EXTENSION,
];

const NamedParentNodeKinds = [
  Kind.DIRECTIVE_DEFINITION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.ENUM_TYPE_EXTENSION,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_EXTENSION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_EXTENSION,
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.OBJECT_TYPE_EXTENSION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.UNION_TYPE_EXTENSION,
];

const NamedChildNodeKinds = [
  Kind.ARGUMENT,
  Kind.DIRECTIVE,
  Kind.ENUM_VALUE_DEFINITION,
  Kind.FIELD_DEFINITION,
  Kind.INPUT_VALUE_DEFINITION,
];

const namedNodeKinds = [
  ...NamedStandaloneNodeKinds,
  ...NamedParentNodeKinds,
  ...NamedChildNodeKinds,
];

/**
 * Sorts a document
 *
 * @param {DocumentNode} doc - The schema document AST with definitions in need of sorting
 * @returns {DocumentNode} The sorted document
 */
export function sortDocumentAst(doc: DocumentNode): DocumentNode {
  return {
    ...doc,
    definitions: [
      ...(sortDefinitions(doc.definitions) as readonly DefinitionNode[]),
    ],
  };
}

/**
 * Type guard for named nodes.
 *
 * @param {ASTNode} node - The node to be checked
 * @returns {boolean} Whether or not the node is a named node
 */
function isNamedNode(node: ASTNode): node is NamedNode {
  return namedNodeKinds.includes(node.kind);
}

/**
 * Sorts a document's definition nodes.
 *
 * @param {DefinitionNode} definitions - The definitions in need of sorting
 * @returns {DefinitionNode} The sorted nodes
 */
function sortDefinitions(
  definitions: readonly DefinitionNode[]
): readonly DefinitionNode[] {
  const unnamedNodes: ASTNode[] = [];
  const namedNodes: NamedNode[] = [];

  definitions.forEach((node) => {
    if (isNamedNode(node)) {
      namedNodes.push(sortChildren(node));
      return;
    }
    unnamedNodes.push(node);
  });

  unnamedNodes.sort(sortByKind);
  namedNodes.sort(sortByName);

  return [...unnamedNodes, ...namedNodes] as DefinitionNode[];
}

/**
 * Sorts a document's definition nodes.
 *
 * @param {NamedNode} nodes - The definitions in need of sorting
 * @returns {NamedNode} The sorted nodes
 */
function sortNodes(nodes: readonly NamedNode[]): readonly NamedNode[] {
  return [...nodes].sort(sortByName).map((node) => sortChildren(node));
}

/**
 * Sorts the children of a node.
 *
 * @param {NamedNode} node - The node with children that need to be sorted
 * @returns {NamedNode} The sorted node
 */
function sortChildren(node: NamedNode): NamedNode {
  if (node.kind === Kind.NAMED_TYPE || node.kind === Kind.ARGUMENT) {
    return node;
  }

  if (node.kind === Kind.DIRECTIVE) {
    const args = node?.arguments ? {arguments: sortNodes(node.arguments)} : {};
    return {
      ...node,
      ...args,
    } as NamedNode;
  }

  if (node.kind === Kind.DIRECTIVE_DEFINITION) {
    const args = node?.arguments ? {arguments: sortNodes(node.arguments)} : {};
    const locations = node?.locations
      ? {
          locations: [...node.locations].sort((a, b) =>
            a.value.localeCompare(b.value)
          ),
        }
      : {};
    return {
      ...node,
      ...args,
      ...locations,
    } as NamedNode;
  }

  const directives = node?.directives
    ? {directives: sortNodes(node.directives)}
    : {};

  if (
    node.kind === Kind.ENUM_TYPE_DEFINITION ||
    node.kind === Kind.ENUM_TYPE_EXTENSION
  ) {
    const values = node?.values ? {values: sortNodes(node.values)} : {};
    return {
      ...node,
      ...values,
      ...directives,
    } as NamedNode;
  }

  if (node.kind === Kind.FIELD_DEFINITION) {
    const args = node?.arguments ? {arguments: sortNodes(node.arguments)} : {};
    return {
      ...node,
      ...args,
      ...directives,
    } as NamedNode;
  }

  if (
    node.kind === Kind.OBJECT_TYPE_DEFINITION ||
    node.kind === Kind.OBJECT_TYPE_EXTENSION ||
    node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
    node.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION ||
    node.kind === Kind.INTERFACE_TYPE_DEFINITION ||
    node.kind === Kind.INTERFACE_TYPE_EXTENSION
  ) {
    const fields = node?.fields ? {fields: sortNodes(node.fields)} : {};
    return {
      ...node,
      ...fields,
      ...directives,
    } as NamedNode;
  }

  if (
    node.kind === Kind.UNION_TYPE_DEFINITION ||
    node.kind === Kind.UNION_TYPE_EXTENSION
  ) {
    const types = node?.types ? {types: [...node.types].sort(sortByName)} : {};
    return {
      ...node,
      ...types,
      ...directives,
    } as NamedNode;
  }

  return {
    ...node,
    ...directives,
  } as NamedNode;
}

/**
 * Sorting comparator using a node's kind as the sorting criteria.
 *
 * @param {ASTNode} a - The first node being compared
 * @param {ASTNode} b - The second node being compared
 * @returns {number} The ordinal adjustment to be made
 */
function sortByKind(a: ASTNode, b: ASTNode): number {
  return a.kind.localeCompare(b.kind);
}

/**
 * Sorting comparator using a node's name as the sorting criteria.
 *
 * @param {NamedNode} a - The first node being compared
 * @param {NamedNode} b - The second node being compared
 * @returns {number} The ordinal adjustment to be made
 */
function sortByName(a: NamedNode, b: NamedNode): number {
  if (a.name.value === ID_FIELD_NAME) {
    return -1;
  }
  if (b.name.value === ID_FIELD_NAME) {
    return 1;
  }
  return a.name.value.localeCompare(b.name.value);
}
