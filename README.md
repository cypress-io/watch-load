# watch-module [![Build and Test](https://github.com/cypress-io/watch-load/actions/workflows/build-and-test.yaml/badge.svg?branch=master)](https://github.com/cypress-io/watch-load/actions/workflows/build-and-test.yaml)

Watches modules that are loaded by Node.js and emits an event for each.

[Documentation](https://cypress-io.github.io/watch-load/docs/)

## Example

```ts
// Register a watcher that will emit an event each time a user module or a module from
// node_modules is loaded via `import` or `require`.
const watcher = addWatcher({ nodeModules: true, userModules: true })
let requiredModules: LoadedModuleInfo[] = []
watcher.on('match', (match) => {
  console.log(match)
})
```

## LICENSE

MIT
