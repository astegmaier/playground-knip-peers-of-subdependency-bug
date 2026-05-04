import { onError } from 'apollo-link-error';

const link = onError(({ graphQLErrors }) => {
  if (graphQLErrors) console.log(graphQLErrors);
});

console.log(link);
