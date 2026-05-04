# knip — peer-of-transitive-dependency false positive repro

[Knip](https://knip.dev) flags a dependency as unused when it is only
present to satisfy the `peerDependencies` of a package's *transitive*
sub-dependency rather than a direct dependency.

Knip already understands peers of *direct* deps. The blind spot is one
hop further down: it does not look at the `peerDependencies` of a
dep's deps.

## The chain (real packages, no synthetic scaffolding)

```
  root  ──depends on──▶  apollo-link-error  ──depends on──▶  apollo-link
                                                                  │
                                                           peerDependency
                                                                  ▼
  root  ──depends on──▶  graphql  ◀─────────────────────────────────┘
```

`apollo-link-error@1.1.13` regularly depends on `apollo-link@^1.2.14` and
`apollo-link-http-common@^0.2.16`, both of which declare `graphql` as a
**required** (not optional) peer. `apollo-link-error` itself has no
`peerDependencies` block at all, so it does not pass the `graphql` peer
through to its consumers. The consumer (this repo) must declare
`graphql` itself.

`npm view` confirms the chain:

```
$ npm view apollo-link-error@1.1.13 dependencies peerDependencies peerDependenciesMeta
{ 'apollo-link': '^1.2.14',
  'apollo-link-http-common': '^0.2.16',
  tslib: '^1.9.3' }
# (no peerDependencies, no peerDependenciesMeta — graphql is nowhere)

$ npm view apollo-link@1.2.14 peerDependencies peerDependenciesMeta
{ graphql: '^0.11.3 || ^0.12.3 || ^0.13.0 || ^14.0.0 || ^15.0.0' }
# (no peerDependenciesMeta — required peer)
```

Yarn 4 sees the chain too and warns at install time:

```
YN0086: Some peer dependencies are incorrectly met by dependencies;
        run yarn explain peer-requirements for details.

$ yarn explain peer-requirements
... ✘ apollo-link-error@npm:1.1.13 doesn't provide graphql to
       apollo-link-http-common@npm:0.2.16 and 2 other dependencies
```

## Reproduce

```sh
corepack enable
yarn install
yarn knip
```

Output:

```
Unused dependencies (1)
graphql  package.json:11:6
```

`graphql` is reported as unused even though removing it would leave a
sub-dep's required peer unsatisfied (yarn 4 does not auto-install peers).

The source code (`src/index.js`) imports only `apollo-link-error` and
runs successfully (`node src/index.js` prints
`ApolloLink { request: [Function (anonymous)] }`); `graphql` is never
referenced directly.

## Why this matters

Strict installation modes — `pnpm` without `auto-install-peers`, or yarn
4's PnP / strict node-modules — do not silently hoist transitive peer
deps; they must be explicitly declared somewhere up the tree (typically
the leaf consumer). Without recursive peer-dep tracing, knip cannot
tell those legitimate declarations apart from real dead deps, forcing
users to add them to `ignoreDependencies` and lose the signal for when
they later become genuinely unused.

## Where the limitation lives in knip

`packages/knip/src/manifest/index.ts` (`getMetaDataFromPackageJson`)
collects each workspace's *direct* dependencies, reads each one's
`peerDependencies`, and records them as "host dependencies." It does
not recurse into transitive deps.
`DependencyDeputy.isReferencedDependency` then only consults that
one-hop host map.

## Related

- [#1124 — unused deps to check peer deps of deps before declaring a dep unused](https://github.com/webpro-nl/knip/issues/1124)
