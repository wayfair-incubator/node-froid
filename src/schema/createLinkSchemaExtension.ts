import {ConstArgumentNode, Kind, SchemaExtensionNode} from 'graphql';
import {
  DEFAULT_FEDERATION_LINK_IMPORTS,
  FED2_DEFAULT_VERSION,
  FED2_OPT_IN_URL,
} from './constants';

export const createLinkSchemaExtension = (
  imports: string[] = DEFAULT_FEDERATION_LINK_IMPORTS,
  version = FED2_DEFAULT_VERSION
): SchemaExtensionNode => {
  if (!imports.length) {
    throw new Error('At least one import must be provided.');
  }

  const directiveArguments: readonly ConstArgumentNode[] = [
    {
      kind: Kind.ARGUMENT,
      name: {
        kind: Kind.NAME,
        value: 'url',
      },
      value: {
        kind: Kind.STRING,
        value: FED2_OPT_IN_URL + version,
      },
    },
    {
      kind: Kind.ARGUMENT,
      name: {
        kind: Kind.NAME,
        value: 'import',
      },
      value: {
        kind: Kind.LIST,
        values: imports.map((value) => ({
          kind: Kind.STRING,
          value: value[0] === '@' ? value : `@${value}`,
        })),
      },
    },
  ];

  return {
    kind: Kind.SCHEMA_EXTENSION,
    directives: [
      {
        kind: Kind.DIRECTIVE,
        name: {
          kind: Kind.NAME,
          value: 'link',
        },
        arguments: directiveArguments,
      },
    ],
  };
};
