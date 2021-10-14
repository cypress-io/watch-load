# watch-module

Watches modules that are loaded by Node.js and emits an event for each.

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
