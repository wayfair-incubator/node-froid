/**
 * Extract type from a field definition node
 *
 * @param {any} node - The node we want to extract a field type from
 * @returns {string} The name of the type used to define a field
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function extractFieldType(node: any): string {
  if (node.hasOwnProperty('type')) {
    return extractFieldType(node.type);
  }
  return node?.name?.value;
}
