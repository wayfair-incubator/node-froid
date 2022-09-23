import {ConstArgumentNode, Kind, SchemaExtensionNode} from 'graphql';

export const FED2_OPT_IN_URL = 'https://specs.apollo.dev/federation/v2.0';

export const createLinkSchemaExtension = (
  imports: string[] = ['@key'],
  url = FED2_OPT_IN_URL
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
        value: url,
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
