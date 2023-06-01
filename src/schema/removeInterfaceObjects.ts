import {DefinitionNode, Kind} from 'graphql';
import {EXTENDS_DIRECTIVE, INTERFACE_OBJECT_DIRECTIVE} from './constants';

/**
 * Checks if given node is an ObjectTypeDefinition without an @extends directive.
 *
 * @param node - Node to check
 * @returns boolean - True if node is an ObjectTypeDefinition without an @extends directive, false otherwise.
 */
function isObjectTypeExtension(node: DefinitionNode): boolean {
  return !!(
    node.kind === Kind.OBJECT_TYPE_EXTENSION ||
    (node.kind === Kind.OBJECT_TYPE_DEFINITION &&
      node.directives?.some(
        (directive) => directive.name.value === EXTENDS_DIRECTIVE
      ))
  );
}

/**
 * Checks if given node is an ObjectTypeExtension and has @interfaceObject directive.
 * Checks for both `extend type Foo` and Java-style `type Foo @extends` syntax
 *
 * @param node - Node to check
 * @returns boolean - True if node is ObjectTypeExtension and has @interfaceObject directive, false otherwise.
 */
function getObjectTypeExtensionsWithInterfaceObject(
  node: DefinitionNode
): boolean {
  return !!(
    isObjectTypeExtension(node) &&
    'directives' in node &&
    node.directives?.some(
      (directive) => directive.name.value === 'interfaceObject'
    )
  );
}

/**
 * Removes nodes from the list that have @interfaceObject directive or their name is in extensionsWithInterfaceObject.
 *
 * @param nodes - Array of nodes to filter
 * @param extensionsWithInterfaceObject - Array of names to exclude
 * @returns DefinitionNode[] - Filtered array of nodes.
 */
function removeInterfaceObjectsFromNodes(
  nodes: DefinitionNode[],
  extensionsWithInterfaceObject: string[]
): DefinitionNode[] {
  return nodes.filter(
    (node) =>
      !(
        ('directives' in node &&
          node.directives?.some(
            (directive) => directive.name.value === INTERFACE_OBJECT_DIRECTIVE
          )) ||
        ('name' in node &&
          node.name &&
          extensionsWithInterfaceObject.includes(node.name.value))
      )
  );
}

/**
 * Removes all ObjectTypeDefinition and ObjectTypeExtension nodes with @interfaceObject
 * directive.
 *
 * This is done because otherwise there is a type conflict in composition between
 * node-relay subgraph and subgraphs implementing the types with @interfaceObject
 *
 * Concrete implementers of the interface are entities themselves, so corresponding
 * node-relay subgraph types will still be generated for those.
 *
 * See https://www.apollographql.com/docs/federation/federated-types/interfaces/
 * for more info on the use of @interfaceObject (requires Federation Spec v2.3 or
 * higher)
 *
 * @param {DefinitionNode[]} nodes - Schema AST nodes
 * @returns {DefinitionNode[]} Only nodes that are not using @interfaceObject
 */
export const removeInterfaceObjects = (
  nodes: DefinitionNode[]
): DefinitionNode[] => {
  const objectTypeExtensionsWithInterfaceObject = nodes
    .filter(getObjectTypeExtensionsWithInterfaceObject)
    .flatMap((node) =>
      'name' in node && node.name?.value ? node.name.value : []
    );

  return removeInterfaceObjectsFromNodes(
    nodes,
    objectTypeExtensionsWithInterfaceObject
  );
};
