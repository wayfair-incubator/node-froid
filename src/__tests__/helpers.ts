/**
 * Tagged template used to mock the `gql` tagged template used by many GQL query libraries.
 * This is especially useful for syntax highlighting in unit tests as it allows the
 * syntax highlighter to understand the mock query as a GQL query.
 *
 * In general tagged templates work by splitting the string around expressions denoted by `${}`.
 * The expressions are then evaluated and passed as arguments after an array split strings.
 * For example
 *
 *    const potato = "foo";
 *    exampleTag`one ${potato} two ${1+2}'s more`
 *
 * is syntactic sugar for
 *
 *    function exampleTag(strings: ReadonlyArray<string>, ...params: string[]) {
 *       console.log(strings); //["one ", " two ", "'s more"]
 *       console.log(params); // ["foo", 3]
 *    }
 *
 * The testGql template simply returns passed string, concatenating any passed expressions
 * within their relative position.
 *
 * Using the testGql tag would result in the following output:
 *    const potato = "foo";
 *    let str = testGql`one ${potato} two ${1+2}'s more`;
 *    console.log(str); //"one foo two 3's more"
 *
 * @param {string} strings - array of string values that surround any expressions
 * @param {Array} params - the passed expression values
 * @returns {string} the string with expressions expanded in their relative positions
 */
export const testGql = (
  strings: ReadonlyArray<string>,
  ...params: any[]
): string => {
  let outputString = '';
  for (let i = 0; i < strings.length; i++) {
    outputString += strings[i] + (params[i] ? params[i] : '');
  }

  return outputString;
};
